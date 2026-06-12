/// <reference types="node" />
/**
 * generateFabricData.ts — Emit Fabric IQ / OneLake-ready tables from the live portfolio.
 *
 * Single source of truth: backend/src/grantPortfolio.ts. Running this script
 * projects that operational object graph into a star schema (dimensions + facts)
 * plus a lifecycle-event audit table, written as CSVs under /fabric/data.
 *
 * Upload the CSVs to a Microsoft Fabric Lakehouse (OneLake) → "Load to Tables",
 * then build the semantic model + ontology on top. See /fabric/README.md.
 *
 * Run:  cd backend && npx ts-node src/scripts/generateFabricData.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GRANT_PORTFOLIO, type ActiveGrant } from "../grantPortfolio";

const OUT_DIR = join(__dirname, "..", "..", "..", "fabric", "data");
const CITY = { id: "buffalo-grove-il", name: "Buffalo Grove", state: "IL", county: "Lake/Cook", population: 43212, moodysRating: "Aa2" };

// ─── CSV helpers ─────────────────────────────────────────────────────────────
type Row = Record<string, string | number | boolean | null | undefined>;

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\n") + "\n";
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Lifecycle stage mapping ─────────────────────────────────────────────────
// The macro lifecycle every grant moves through. Stored as an ordinal so the
// semantic model / ontology can reason about progression and regressions.
const STAGE_ORDINAL: Record<string, number> = {
  Identified: 1,
  Drafting: 2,
  Submitted: 3,
  UnderReview: 4,
  Awarded: 5,
  Active: 6,
  Closeout: 7,
  Closed: 8,
  Declined: 9,
};

function paidTotal(g: ActiveGrant): number {
  return g.disbursements.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0);
}

// Map a grant's app status to its macro lifecycle state + ordinal.
function lifecycleOf(g: ActiveGrant): { state: string; ordinal: number } {
  switch (g.status) {
    case "active": return { state: "Active", ordinal: STAGE_ORDINAL.Active };
    case "applied": return { state: "UnderReview", ordinal: STAGE_ORDINAL.UnderReview };
    case "closeout": return { state: "Closeout", ordinal: STAGE_ORDINAL.Closeout };
    case "closed": return { state: "Closed", ordinal: STAGE_ORDINAL.Closed };
    case "declined": return { state: "Declined", ordinal: STAGE_ORDINAL.Declined };
    default: return { state: "Identified", ordinal: STAGE_ORDINAL.Identified };
  }
}

// ─── Builders ────────────────────────────────────────────────────────────────
function buildDimGrant() {
  return GRANT_PORTFOLIO.map((g) => ({
    grant_id: g.id,
    grant_name: g.name,
    city_id: CITY.id,
    agency_id: slug(g.agency),
    program_id: slug(g.program),
    cfda: g.cfda,
    award_amount: g.awardAmount,
    city_match: g.cityMatch,
    total_project: g.totalProject,
    federal_share_pct: g.totalProject > 0 ? Math.round((g.awardAmount / g.totalProject) * 100) : null,
    award_date: g.awardDate || "",
    start_date: g.startDate || "",
    end_date: g.endDate || "",
    lifecycle_state: lifecycleOf(g).state,
    lifecycle_ordinal: lifecycleOf(g).ordinal,
    primary_focus: g.primaryFocus,
    project_manager: g.projectManager,
    grant_coordinator: g.grantCoordinator,
    pct_disbursed: g.awardAmount > 0 ? Math.round((paidTotal(g) / g.awardAmount) * 100) : 0,
    key_risk: g.keyRisk ?? "",
    summary: g.summary,
  }));
}

function buildDimAgency() {
  const seen = new Map<string, Row>();
  for (const g of GRANT_PORTFOLIO) {
    const id = slug(g.agency);
    if (!seen.has(id)) {
      const isFederal = /federal|u\.s\.|fema|usdot|department/i.test(g.agency);
      seen.set(id, { agency_id: id, agency_name: g.agency, level: isFederal ? "Federal" : "State/Regional" });
    }
  }
  return [...seen.values()];
}

function buildDimProgram() {
  const seen = new Map<string, Row>();
  for (const g of GRANT_PORTFOLIO) {
    const id = slug(g.program);
    if (!seen.has(id)) {
      seen.set(id, { program_id: id, program_name: g.program, agency_id: slug(g.agency), cfda: g.cfda, focus_area: g.primaryFocus });
    }
  }
  return [...seen.values()];
}

function buildDimCity() {
  return [{ city_id: CITY.id, city_name: CITY.name, state: CITY.state, county: CITY.county, population: CITY.population, moodys_rating: CITY.moodysRating }];
}

function buildFactDisbursement() {
  const rows: Row[] = [];
  for (const g of GRANT_PORTFOLIO) {
    for (const d of g.disbursements) {
      rows.push({
        disbursement_id: `${g.id}__${d.id}`,
        grant_id: g.id,
        label: d.label,
        phase: d.phase,
        amount: d.amount,
        status: d.status,
        event_date: d.date,
        federal_share_pct: d.federalSharePct ?? "",
        federal_amount: d.federalSharePct ? Math.round(d.amount * (d.federalSharePct / 100)) : "",
        city_amount: d.federalSharePct ? Math.round(d.amount * (1 - d.federalSharePct / 100)) : "",
        vendor: d.vendor ?? "",
        invoice_number: d.invoiceNumber ?? "",
        check_number: d.checkNumber ?? "",
        description: d.description ?? "",
        notes: d.notes ?? "",
      });
    }
  }
  return rows;
}

function buildFactMilestone() {
  const rows: Row[] = [];
  for (const g of GRANT_PORTFOLIO) {
    for (const m of g.milestones) {
      rows.push({
        milestone_id: `${g.id}__${m.id}`,
        grant_id: g.id,
        title: m.title,
        status: m.status,
        progress_pct: m.progress ?? (m.status === "complete" ? 100 : 0),
        due_date: m.dueDate,
        completed_date: m.completedDate ?? "",
        is_at_risk: m.status === "at-risk",
        owner: m.owner,
      });
    }
  }
  return rows;
}

function buildFactCompliance() {
  const rows: Row[] = [];
  for (const g of GRANT_PORTFOLIO) {
    for (const c of g.compliance) {
      rows.push({
        compliance_id: `${g.id}__${c.id}`,
        grant_id: g.id,
        title: c.title,
        type: c.type,
        status: c.status,
        frequency: c.frequency ?? "",
        due_date: c.dueDate ?? "",
        last_completed_date: c.lastCompletedDate ?? "",
        is_overdue: c.status === "overdue",
        is_due_soon: c.status === "due-soon",
        notes: c.notes ?? "",
      });
    }
  }
  return rows;
}

// ─── Lifecycle event audit table — the "show the lifecycle" hero table ────────
// Every meaningful state change in a grant's life, unioned into one timeline:
// macro stage transitions + milestone completions + disbursements + filings.
function buildFactLifecycleEvent() {
  const rows: Row[] = [];
  let seq = 0;
  const push = (
    g: ActiveGrant,
    date: string,
    eventType: string,
    fromState: string,
    toState: string,
    detail: string,
    source: string,
    amount?: number
  ) => {
    if (!date) return;
    rows.push({
      event_id: `evt-${String(++seq).padStart(4, "0")}`,
      grant_id: g.id,
      grant_name: g.name,
      event_date: date,
      event_type: eventType, // StageTransition | MilestoneCompleted | DisbursementPaid | ComplianceFiled
      from_state: fromState,
      to_state: toState,
      stage_ordinal: STAGE_ORDINAL[toState] ?? "",
      detail,
      actor: g.grantCoordinator,
      amount: amount ?? "",
      source_document: source,
    });
  };

  for (const g of GRANT_PORTFOLIO) {
    const appSubmitted = g.milestones.find((m) => /submitted/i.test(m.title) && m.completedDate);

    // Macro stage transitions (derived from real dates on the record)
    if (appSubmitted?.completedDate) {
      push(g, appSubmitted.completedDate, "StageTransition", "Drafting", "Submitted", `Application submitted to ${g.agency}`, "grant-agreement");
      push(g, appSubmitted.completedDate, "StageTransition", "Submitted", "UnderReview", `${g.agency} technical review begins`, "grant-agreement");
    }
    if (g.declinedDate) push(g, g.declinedDate, "StageTransition", "UnderReview", "Declined", `${g.agency} did not select this application`, "grant-agreement");
    if (g.awardDate) push(g, g.awardDate, "StageTransition", "UnderReview", "Awarded", `Award notification: $${g.awardAmount.toLocaleString()}`, "grant-agreement", g.awardAmount);
    if (g.startDate) push(g, g.startDate, "StageTransition", "Awarded", "Active", "Grant agreement executed — period of performance begins", "grant-agreement");
    if (g.closeoutDate) push(g, g.closeoutDate, "StageTransition", "Active", "Closeout", "Period of performance complete — final reporting begins", "closeout-record");
    if (g.closedDate) push(g, g.closedDate, "StageTransition", "Closeout", "Closed", "Final SF-425 accepted — grant reconciled and archived", "closeout-record");

    // Milestone completions
    for (const m of g.milestones) {
      if (m.completedDate && !/submitted/i.test(m.title)) {
        push(g, m.completedDate, "MilestoneCompleted", "Active", "Active", m.title, "progress-report");
      }
    }
    // Disbursements paid
    for (const d of g.disbursements) {
      if (d.status === "paid") {
        push(g, d.date, "DisbursementPaid", "Active", "Active", `${d.label} — ${d.vendor ?? ""}`.trim(), d.invoiceNumber ?? "drawdown-request", d.amount);
      }
    }
    // Compliance filings
    for (const c of g.compliance) {
      if (c.lastCompletedDate) {
        push(g, c.lastCompletedDate, "ComplianceFiled", "Active", "Active", `${c.title} filed`, "compliance-record");
      }
    }
  }

  // Stable chronological order, then by grant
  rows.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)) || String(a.grant_id).localeCompare(String(b.grant_id)));
  return rows;
}

// ─── Write all tables ────────────────────────────────────────────────────────
const tables: Record<string, Row[]> = {
  dim_city: buildDimCity(),
  dim_agency: buildDimAgency(),
  dim_program: buildDimProgram(),
  dim_grant: buildDimGrant(),
  fact_disbursement: buildFactDisbursement(),
  fact_milestone: buildFactMilestone(),
  fact_compliance: buildFactCompliance(),
  fact_lifecycle_event: buildFactLifecycleEvent(),
};

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [name, rows] of Object.entries(tables)) {
  const path = join(OUT_DIR, `${name}.csv`);
  writeFileSync(path, toCsv(rows), "utf8");
  total += rows.length;
  console.log(`  ✓ ${name.padEnd(22)} ${String(rows.length).padStart(4)} rows  → fabric/data/${name}.csv`);
}
console.log(`\nGenerated ${Object.keys(tables).length} tables, ${total} rows total → ${OUT_DIR}`);

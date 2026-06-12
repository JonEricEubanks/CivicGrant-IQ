/// <reference types="node" />
/**
 * fabricIq.ts — Fabric IQ ontology grounding for the Grant Admin agent.
 *
 * Loads the grant-lifecycle ontology (the same definition published to the
 * Microsoft Fabric IQ workload over OneLake — see /fabric/ontology) and turns it
 * into (a) a business-vocabulary grounding block injected into the admin agent's
 * system prompt, and (b) a guard evaluator that tells the agent which governed
 * ontology *actions* are currently available for a given grant.
 *
 * This makes the Fabric IQ integration load-bearing: the admin agent reasons in
 * the ontology's shared business language (Grant, Disbursement, ComplianceItem…)
 * rather than over ad-hoc table rows. Reads a local JSON spec, so it works with
 * zero Fabric credentials and never blocks the request if the file is absent.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActiveGrant } from "./grantPortfolio";

interface OntologyEntityType {
  name: string;
  displayName: string;
  table: string;
  properties: Array<{ name: string; type: string; description?: string }>;
}
interface OntologyRelationship {
  name: string;
  from: string;
  to: string;
  cardinality: string;
}
interface OntologyRule {
  name: string;
  message: string;
}
interface OntologyAction {
  name: string;
  appliesTo: string;
  description: string;
  guard?: string;
}
interface Ontology {
  displayName: string;
  description: string;
  entityTypes: OntologyEntityType[];
  relationships: OntologyRelationship[];
  rules: OntologyRule[];
  actions: OntologyAction[];
}

// Resolve repo/fabric/ontology from either backend/src or backend/dist.
const ONTOLOGY_PATH = join(__dirname, "..", "..", "fabric", "ontology", "grant-lifecycle-ontology.json");

let cached: Ontology | null | undefined;

export function loadOntology(): Ontology | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(readFileSync(ONTOLOGY_PATH, "utf8")) as Ontology;
  } catch {
    cached = null; // spec not present in this deployment — degrade gracefully
  }
  return cached;
}

/** Is the Fabric IQ ontology available to ground responses? */
export function isFabricIqActive(): boolean {
  return loadOntology() !== null;
}

/**
 * Compact business-vocabulary grounding block for the admin agent system prompt.
 * Declares the ontology's entity types, relationships, governance rules, and the
 * lifecycle states — so the model interprets the grant data as business concepts.
 */
export function buildOntologyGrounding(): string {
  const o = loadOntology();
  if (!o) return "";

  const entities = o.entityTypes
    .map((e) => `  • ${e.displayName} (${e.name}) — ${e.properties.slice(0, 6).map((p) => p.name).join(", ")}`)
    .join("\n");

  const rels = o.relationships
    .map((r) => `  • ${r.from} —${r.name}→ ${r.to}`)
    .join("\n");

  const rules = o.rules.map((r) => `  • ${r.name}: ${r.message}`).join("\n");

  return [
    `## FABRIC IQ — GRANT LIFECYCLE ONTOLOGY`,
    `You reason over this data using a shared business ontology grounded in Microsoft Fabric IQ (OneLake), not raw tables.`,
    `Ontology: "${o.displayName}". ${o.description}`,
    ``,
    `Lifecycle states (ordered): Identified → Drafting → Submitted → UnderReview → Awarded → Active → Closeout → Closed (or Declined).`,
    ``,
    `Business entities:`,
    entities,
    ``,
    `Relationships (use these to reason across domains and cite your traversal):`,
    rels,
    ``,
    `Governance rules you must respect (never assert anything that violates them):`,
    rules,
    ``,
    `When you recommend an action, phrase it in this ontology's language and name the governed action (e.g. RequestDrawdown, FileSF425).`,
  ].join("\n");
}

/**
 * Evaluate which governed ontology actions are currently available for a grant,
 * by applying the guards declared in the ontology to the grant's live state.
 * Mirrors the guard expressions in grant-lifecycle-ontology.json.
 */
export function availableActions(grant: ActiveGrant): Array<{ name: string; description: string; reason: string }> {
  const o = loadOntology();
  if (!o) return [];

  const out: Array<{ name: string; description: string; reason: string }> = [];
  const hasInProgressMilestone = grant.milestones.some((m) => m.status === "in-progress");
  const hasPendingDisbursement = grant.disbursements.some((d) => d.status === "pending");
  const sf425Open = grant.compliance.some((c) => /sf-425/i.test(c.title) && (c.status === "due-soon" || c.status === "overdue"));
  const quarterlyOpen = grant.compliance.some((c) => /quarterly/i.test(c.title) && (c.status === "due-soon" || c.status === "overdue"));
  const atRiskMilestone = grant.milestones.some((m) => m.status === "at-risk");

  const fire = (name: string, ok: boolean, reason: string) => {
    if (!ok) return;
    const action = o.actions.find((a) => a.name === name);
    if (action) out.push({ name: action.name, description: action.description, reason });
  };

  fire("RequestDrawdown", hasInProgressMilestone && !hasPendingDisbursement, "in-progress milestone with no pending drawdown");
  fire("FileSF425", sf425Open, "SF-425 obligation is due-soon or overdue");
  fire("FileQuarterlyReport", quarterlyOpen, "quarterly report obligation is due-soon or overdue");
  fire("FlagAtRiskMilestone", atRiskMilestone, "a milestone is flagged at-risk");

  return out;
}

/** Human-readable list of available actions for prompt injection. */
export function buildAvailableActionsBlock(grant: ActiveGrant): string {
  const actions = availableActions(grant);
  if (actions.length === 0) return "";
  return [
    ``,
    `## GOVERNED ACTIONS AVAILABLE NOW (per Fabric IQ ontology guards)`,
    ...actions.map((a) => `  • ${a.name} — ${a.description} (triggered: ${a.reason})`),
  ].join("\n");
}

/**
 * grantPortfolio.ts — Static grant portfolio data for Buffalo Grove, IL
 *
 * Represents the city's active, applied, and closeout grants as of June 2026.
 * Used by the /api/admin-chat route to give the agent full context for
 * post-award grant administration questions.
 */

export interface Disbursement {
  id: string;
  label: string;
  phase: string;
  amount: number;
  status: "paid" | "pending" | "planned";
  date: string; // ISO date (actual for paid, scheduled for pending/planned)
  // Detail fields — shown in expanded row
  invoiceNumber?: string;   // ACH/check reference or drawdown request #
  vendor?: string;          // Prime contractor or payee
  description?: string;     // Scope of work covered by this disbursement
  federalSharePct?: number; // % of this draw that is federal funds (vs city match)
  checkNumber?: string;     // Treasury warrant / EFT confirmation
  notes?: string;           // Flags, holds, or reconciliation notes
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completedDate?: string;
  status: "complete" | "in-progress" | "upcoming" | "at-risk";
  progress?: number; // 0-100 for in-progress items
  owner: string;
}

export interface ComplianceItem {
  id: string;
  title: string;
  type: "report" | "audit" | "clearance" | "monitoring";
  dueDate?: string;
  lastCompletedDate?: string;
  status: "current" | "due-soon" | "overdue" | "complete";
  frequency?: string;
  notes?: string;
}

export interface ActiveGrant {
  id: string;
  name: string;
  agency: string;
  program: string;
  awardAmount: number;
  cityMatch: number;
  totalProject: number;
  awardDate: string;
  startDate: string;
  endDate: string;
  status: "active" | "applied" | "closeout";
  projectManager: string;
  grantCoordinator: string;
  cfda: string;
  primaryFocus: string;
  disbursements: Disbursement[];
  milestones: Milestone[];
  compliance: ComplianceItem[];
  summary: string;
  keyRisk?: string;
}

// ─── Active Portfolio ────────────────────────────────────────────────────────

export const GRANT_PORTFOLIO: ActiveGrant[] = [
  // ─── 1. AWARDED: Northwood Stormwater SMC SIIP ─────────────────────────
  {
    id: "northwood-smc-2024",
    name: "Northwood Stormwater Improvement — SMC SIIP",
    agency: "Stormwater Management Commission (SMC)",
    program: "Stormwater Improvement and Implementation Program (SIIP)",
    awardAmount: 5_500_000,
    cityMatch: 1_375_000,
    totalProject: 6_875_000,
    awardDate: "2024-10-01",
    startDate: "2024-10-15",
    endDate: "2027-09-30",
    status: "active",
    projectManager: "Director of Public Works",
    grantCoordinator: "Deputy Village Manager",
    cfda: "15.999",
    primaryFocus: "Stormwater / Environmental",
    summary:
      "Construction of a 4.2-acre stormwater wetland complex, replacement of three undersized culverts on Northwood Drive, and full road reconstruction with bioswales. Reduces 100-year flood exposure for 342 properties and removes 28 acres from the FEMA Special Flood Hazard Area.",
    keyRisk:
      "Phase 2 (culvert replacement) involves lane closures on Northwood Dr — community outreach and traffic management plan due to SMC by July 1, 2026.",
    disbursements: [
      {
        id: "d1",
        label: "Phase 1 Mobilization",
        phase: "Pre-Construction",
        amount: 275_000,
        status: "paid",
        date: "2024-11-15",
        invoiceNumber: "SMC-DR-2024-001",
        vendor: "Martam Construction Inc.",
        description: "Site mobilization, erosion control installation, temporary access road, and initial clearing for wetland cell area.",
        federalSharePct: 80,
        checkNumber: "EFT-24-110892",
      },
      {
        id: "d2",
        label: "Design Engineering (100%)",
        phase: "Design",
        amount: 412_500,
        status: "paid",
        date: "2025-03-20",
        invoiceNumber: "SMC-DR-2024-002",
        vendor: "Baxter & Woodman Consulting Engineers",
        description: "100% construction documents, hydraulic modeling, NEPA CE documentation, permit applications (IDNR, USACE Section 404).",
        federalSharePct: 80,
        checkNumber: "EFT-25-030441",
      },
      {
        id: "d3",
        label: "Phase 1 Construction — Wetland Cells",
        phase: "Construction",
        amount: 1_100_000,
        status: "paid",
        date: "2025-12-31",
        invoiceNumber: "SMC-DR-2025-003",
        vendor: "Martam Construction Inc.",
        description: "Excavation and grading of 4.2-acre wetland complex, native planting installation (3 cell zones), outlet control structures.",
        federalSharePct: 80,
        checkNumber: "EFT-25-121988",
      },
      {
        id: "d4",
        label: "Phase 2 Construction — Culverts & Road",
        phase: "Construction",
        amount: 980_000,
        status: "pending",
        date: "2026-09-30",
        invoiceNumber: "SMC-DR-2026-004",
        vendor: "Martam Construction Inc.",
        description: "Replacement of 3 undersized culverts on Northwood Dr, bioswale installation, lane restoration. Drawdown request submitted 2026-06-01 — awaiting SMC approval.",
        federalSharePct: 80,
        notes: "SMC review period: up to 45 days. Expect payment by Aug 15, 2026.",
      },
      {
        id: "d5",
        label: "Phase 3 Construction — Road Reconstruction",
        phase: "Construction",
        amount: 1_485_000,
        status: "planned",
        date: "2026-12-31",
        vendor: "TBD (bid Q4 2026)",
        description: "Full reconstruction of Northwood Dr between Checker Rd and Weiland Rd — new pavement, curb & gutter, accessible ramps, storm sewer upgrades.",
        federalSharePct: 80,
      },
      {
        id: "d6",
        label: "Closeout, Final Report & Retention",
        phase: "Closeout",
        amount: 1_247_500,
        status: "planned",
        date: "2027-09-30",
        description: "5% retention release, final performance report, SF-425 closeout submission, project sign installation, as-built drawings.",
        federalSharePct: 80,
        notes: "Retention held until SMC final site inspection and written concurrence.",
      },
    ],
    milestones: [
      {
        id: "m1",
        title: "Grant Agreement Executed",
        dueDate: "2024-10-15",
        completedDate: "2024-10-15",
        status: "complete",
        owner: "Village Manager's Office",
      },
      {
        id: "m2",
        title: "Environmental Clearance (NEPA Categorical Exclusion)",
        dueDate: "2024-12-01",
        completedDate: "2024-11-22",
        status: "complete",
        owner: "Public Works",
      },
      {
        id: "m3",
        title: "Final Design Completion (100%)",
        dueDate: "2025-03-01",
        completedDate: "2025-02-28",
        status: "complete",
        owner: "Engineering",
      },
      {
        id: "m4",
        title: "Phase 1 Bid Award",
        dueDate: "2025-04-15",
        completedDate: "2025-04-10",
        status: "complete",
        owner: "Public Works",
      },
      {
        id: "m5",
        title: "Phase 1 Construction Complete (Wetland)",
        dueDate: "2026-01-01",
        completedDate: "2025-12-31",
        status: "complete",
        owner: "Public Works",
      },
      {
        id: "m6",
        title: "Phase 2 Construction — Culverts & Road (65%)",
        dueDate: "2026-09-30",
        status: "in-progress",
        progress: 65,
        owner: "Public Works / Contractor",
      },
      {
        id: "m7",
        title: "Phase 3 Construction — Road Reconstruction",
        dueDate: "2026-12-31",
        status: "upcoming",
        owner: "Public Works / Contractor",
      },
      {
        id: "m8",
        title: "Final Inspection & Project Acceptance",
        dueDate: "2027-06-30",
        status: "upcoming",
        owner: "Engineering",
      },
      {
        id: "m9",
        title: "Final Performance & Financial Report Submitted",
        dueDate: "2027-09-30",
        status: "upcoming",
        owner: "Finance / Deputy Village Manager",
      },
    ],
    compliance: [
      {
        id: "c1",
        title: "Davis-Bacon Act Wage Compliance",
        type: "audit",
        frequency: "Ongoing — certified payrolls weekly",
        lastCompletedDate: "2026-05-30",
        status: "current",
        notes: "All contractor payrolls current through May 30, 2026. No violations.",
      },
      {
        id: "c2",
        title: "Quarterly Progress Reports",
        type: "report",
        frequency: "Quarterly",
        dueDate: "2026-07-01",
        lastCompletedDate: "2026-04-01",
        status: "current",
        notes: "Q1 2026 report filed April 1. Q2 2026 report due July 1, 2026.",
      },
      {
        id: "c3",
        title: "Semi-Annual Financial Report (SF-425)",
        type: "report",
        frequency: "Semi-annual",
        dueDate: "2026-06-30",
        lastCompletedDate: "2025-12-31",
        status: "due-soon",
        notes: "SF-425 due June 30, 2026 — Finance must pull actuals and submit via grants.gov.",
      },
      {
        id: "c4",
        title: "Environmental Monitoring — Wetland Cell Establishment",
        type: "monitoring",
        frequency: "Monthly (first 2 years)",
        lastCompletedDate: "2026-05-15",
        status: "current",
        notes: "Hydrophytic vegetation coverage at 78% of target. On track.",
      },
      {
        id: "c5",
        title: "NEPA Categorical Exclusion Compliance",
        type: "clearance",
        lastCompletedDate: "2024-11-22",
        status: "complete",
        notes: "CE approved Nov 22, 2024. No significant environmental impacts.",
      },
      {
        id: "c6",
        title: "Mid-Project Performance Review",
        type: "audit",
        frequency: "One-time",
        dueDate: "2026-08-15",
        status: "current",
        notes: "SMC site visit + financial audit scheduled for August 2026.",
      },
      {
        id: "c7",
        title: "Title VI Non-Discrimination Certification",
        type: "clearance",
        lastCompletedDate: "2024-10-15",
        status: "current",
        notes: "Annual re-certification due with grant agreement anniversary.",
      },
    ],
  },

  // ─── 2. APPLIED: RAISE Aptakisic/IL-83 ─────────────────────────────────
  {
    id: "raise-aptakisic-2024",
    name: "RAISE Aptakisic Road / IL-83 Reconstruction",
    agency: "U.S. Department of Transportation (USDOT)",
    program: "Rebuilding American Infrastructure with Sustainability and Equity (RAISE)",
    awardAmount: 5_000_000,
    cityMatch: 5_000_000,
    totalProject: 10_000_000,
    awardDate: "",
    startDate: "",
    endDate: "",
    status: "applied",
    projectManager: "Director of Public Works",
    grantCoordinator: "Deputy Village Manager",
    cfda: "20.933",
    primaryFocus: "Transportation / Active Mobility",
    summary:
      "Full reconstruction of Aptakisic Road from Buffalo Grove Road to IL-83 (1.2 miles). Installs adaptive signal coordination, protected bike lane, ADA-compliant pedestrian crossing upgrades, and Class I bus stop improvements for Metra Pace Route 630.",
    keyRisk:
      "Application submitted July 2024 — award announcements expected late 2025/early 2026. No notification received yet. Follow up with USDOT FY2026 RAISE program office.",
    disbursements: [],
    milestones: [
      {
        id: "m1",
        title: "Application Submitted",
        dueDate: "2024-07-15",
        completedDate: "2024-07-12",
        status: "complete",
        owner: "Deputy Village Manager",
      },
      {
        id: "m2",
        title: "USDOT Technical Review (expected)",
        dueDate: "2025-06-30",
        status: "upcoming",
        owner: "USDOT",
      },
      {
        id: "m3",
        title: "Award Notification (expected)",
        dueDate: "2026-03-31",
        status: "at-risk",
        owner: "USDOT",
      },
    ],
    compliance: [],
  },

  // ─── 3. APPLIED: FEMA BRIC Buffalo Creek ────────────────────────────────
  {
    id: "fema-bric-2025",
    name: "FEMA BRIC Buffalo Creek Resilience Project",
    agency: "Federal Emergency Management Agency (FEMA)",
    program: "Building Resilient Infrastructure and Communities (BRIC)",
    awardAmount: 3_400_000,
    cityMatch: 850_000,
    totalProject: 4_250_000,
    awardDate: "",
    startDate: "",
    endDate: "",
    status: "applied",
    projectManager: "Director of Public Works",
    grantCoordinator: "Emergency Management Coordinator",
    cfda: "97.047",
    primaryFocus: "Resilience / Climate Mitigation",
    summary:
      "Real-time flood early warning sensor network along Buffalo Creek (6 stream gauges, 2 rain gauges), lift station hardening (backup generator + SCADA), and green infrastructure in the 100-year floodplain. Protects 1,200+ downstream properties.",
    keyRisk:
      "FEMA BRIC FY2025 awards expected Q3 2026. FEMA has historically taken 12-18 months for BRIC award decisions. Subapplicant is Lake County Emergency Management Agency — maintain coordination.",
    disbursements: [],
    milestones: [
      {
        id: "m1",
        title: "Application Submitted to FEMA via IEMA",
        dueDate: "2025-10-01",
        completedDate: "2025-09-28",
        status: "complete",
        owner: "Emergency Management Coordinator",
      },
      {
        id: "m2",
        title: "FEMA Technical Review",
        dueDate: "2026-06-30",
        status: "upcoming",
        owner: "FEMA / IEMA",
      },
      {
        id: "m3",
        title: "BRIC Award Notification (expected)",
        dueDate: "2026-09-30",
        status: "upcoming",
        owner: "FEMA",
      },
    ],
    compliance: [],
  },
];

// ─── Helper: find grant by ID ────────────────────────────────────────────────
export function findGrant(id: string): ActiveGrant | undefined {
  return GRANT_PORTFOLIO.find((g) => g.id === id);
}

// ─── Helper: compute portfolio summary stats ─────────────────────────────────
export function portfolioStats() {
  const active = GRANT_PORTFOLIO.filter((g) => g.status === "active");
  const totalAwarded = GRANT_PORTFOLIO.filter((g) => g.status === "active" || g.status === "closeout")
    .reduce((s, g) => s + g.awardAmount, 0);
  const totalApplied = GRANT_PORTFOLIO.filter((g) => g.status === "applied")
    .reduce((s, g) => s + g.awardAmount, 0);
  const totalDisbursed = active.flatMap((g) => g.disbursements)
    .filter((d) => d.status === "paid")
    .reduce((s, d) => s + d.amount, 0);
  const overdueTasks = active
    .flatMap((g) => g.compliance)
    .filter((c) => c.status === "overdue").length;
  const dueSoonTasks = active
    .flatMap((g) => g.compliance)
    .filter((c) => c.status === "due-soon").length;

  return { totalAwarded, totalApplied, totalDisbursed, overdueTasks, dueSoonTasks };
}

// ─── Helper: build LLM context string for a grant ────────────────────────────
export function buildGrantContext(grant: ActiveGrant): string {
  const paidTotal = grant.disbursements
    .filter((d) => d.status === "paid")
    .reduce((s, d) => s + d.amount, 0);
  const pctDisbursed = grant.awardAmount > 0
    ? Math.round((paidTotal / grant.awardAmount) * 100) : 0;

  const lines: string[] = [
    `GRANT: ${grant.name}`,
    `Agency: ${grant.agency} | Program: ${grant.program}`,
    `Award: $${grant.awardAmount.toLocaleString()} | City Match: $${grant.cityMatch.toLocaleString()} | Total Project: $${grant.totalProject.toLocaleString()}`,
    `Period: ${grant.startDate || "TBD"} → ${grant.endDate || "TBD"}`,
    `Status: ${grant.status.toUpperCase()}`,
    `PM: ${grant.projectManager} | Coordinator: ${grant.grantCoordinator}`,
    ``,
    `SUMMARY: ${grant.summary}`,
    grant.keyRisk ? `KEY RISK: ${grant.keyRisk}` : "",
    ``,
    `DISBURSEMENTS (${pctDisbursed}% disbursed, $${paidTotal.toLocaleString()} of $${grant.awardAmount.toLocaleString()}):`,
    ...grant.disbursements.map(
      (d) => `  [${d.status.toUpperCase()}] ${d.label}: $${d.amount.toLocaleString()} (${d.date})`
    ),
    ``,
    `MILESTONES:`,
    ...grant.milestones.map((m) => {
      const prog = m.progress !== undefined ? ` (${m.progress}% complete)` : "";
      const done = m.completedDate ? ` ✓ Completed ${m.completedDate}` : ` — Due ${m.dueDate}`;
      return `  [${m.status.toUpperCase()}] ${m.title}${prog}${done} | Owner: ${m.owner}`;
    }),
    ``,
    `COMPLIANCE:`,
    ...grant.compliance.map(
      (c) =>
        `  [${c.status.toUpperCase()}] ${c.title} (${c.type})${c.dueDate ? ` — Due: ${c.dueDate}` : ""}${c.notes ? ` | Note: ${c.notes}` : ""}`
    ),
  ];

  return lines.filter((l) => l !== undefined).join("\n");
}

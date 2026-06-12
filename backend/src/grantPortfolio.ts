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
  status: "active" | "applied" | "closeout" | "closed" | "declined";
  closeoutDate?: string;  // date grant entered closeout (final reporting)
  closedDate?: string;    // date grant fully reconciled and archived
  declinedDate?: string;  // date agency declined the application
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

  // ─── 4. CLOSED: Lake-Cook Road CMAQ Signal Modernization ───────────────
  {
    id: "cmaq-lakecook-2021",
    name: "Lake-Cook Road Signal Modernization — CMAQ",
    agency: "U.S. Department of Transportation (USDOT) via CMAP",
    program: "Congestion Mitigation and Air Quality Improvement (CMAQ)",
    awardAmount: 2_400_000,
    cityMatch: 600_000,
    totalProject: 3_000_000,
    awardDate: "2021-05-15",
    startDate: "2021-07-01",
    endDate: "2023-12-15",
    closeoutDate: "2023-12-20",
    closedDate: "2024-03-28",
    status: "closed",
    projectManager: "Director of Public Works",
    grantCoordinator: "Deputy Village Manager",
    cfda: "20.205",
    primaryFocus: "Transportation / Air Quality",
    summary:
      "Adaptive signal coordination across 11 intersections on Lake-Cook Road, fiber interconnect, and transit signal priority for Pace bus routes. Cut corridor travel time 22% and idling emissions an estimated 18% — fully completed, audited, and closed.",
    disbursements: [
      { id: "d1", label: "Design & Engineering", phase: "Design", amount: 360_000, status: "paid", date: "2021-11-30", invoiceNumber: "CMAQ-DR-2021-001", vendor: "HNTB Corporation", description: "Signal timing design, fiber interconnect plans, IDOT Phase II engineering.", federalSharePct: 80, checkNumber: "EFT-21-113344" },
      { id: "d2", label: "Equipment Procurement — Controllers", phase: "Procurement", amount: 540_000, status: "paid", date: "2022-04-18", invoiceNumber: "CMAQ-DR-2022-002", vendor: "Econolite Systems", description: "Adaptive controllers, detection cameras, transit signal priority units for 11 intersections.", federalSharePct: 80, checkNumber: "EFT-22-041190" },
      { id: "d3", label: "Construction — Fiber & Installation", phase: "Construction", amount: 1_080_000, status: "paid", date: "2023-03-22", invoiceNumber: "CMAQ-DR-2023-003", vendor: "Meade Electric Company", description: "Fiber interconnect trenching, controller cabinet installation, integration and corridor commissioning.", federalSharePct: 80, checkNumber: "EFT-23-032207" },
      { id: "d4", label: "Closeout & Retention Release", phase: "Closeout", amount: 420_000, status: "paid", date: "2024-03-28", invoiceNumber: "CMAQ-DR-2024-004", vendor: "Meade Electric Company", description: "5% retention release, final performance measurement (before/after travel-time study), as-builts.", federalSharePct: 80, checkNumber: "EFT-24-032811", notes: "Final SF-425 accepted by CMAP 2024-03-15. Grant closed." },
    ],
    milestones: [
      { id: "m1", title: "Application Submitted to CMAP", dueDate: "2020-09-01", completedDate: "2020-08-28", status: "complete", owner: "Deputy Village Manager" },
      { id: "m2", title: "Grant Agreement Executed", dueDate: "2021-07-01", completedDate: "2021-07-01", status: "complete", owner: "Village Manager's Office" },
      { id: "m3", title: "Phase II Design Complete", dueDate: "2021-12-01", completedDate: "2021-11-20", status: "complete", owner: "Engineering" },
      { id: "m4", title: "Equipment Procured & Delivered", dueDate: "2022-05-01", completedDate: "2022-04-15", status: "complete", owner: "Public Works" },
      { id: "m5", title: "Corridor Construction Complete", dueDate: "2023-06-30", completedDate: "2023-06-12", status: "complete", owner: "Public Works / Contractor" },
      { id: "m6", title: "Before/After Performance Study", dueDate: "2023-11-30", completedDate: "2023-11-22", status: "complete", owner: "Engineering" },
      { id: "m7", title: "Final Inspection & Project Acceptance", dueDate: "2023-12-15", completedDate: "2023-12-15", status: "complete", owner: "Engineering" },
      { id: "m8", title: "Final Report & SF-425 Closeout Accepted", dueDate: "2024-03-31", completedDate: "2024-03-15", status: "complete", owner: "Finance / Deputy Village Manager" },
    ],
    compliance: [
      { id: "c1", title: "Quarterly Progress Reports", type: "report", frequency: "Quarterly", lastCompletedDate: "2023-12-15", status: "complete", notes: "All 10 quarterly reports filed on time across the period of performance." },
      { id: "c2", title: "Davis-Bacon Act Wage Compliance", type: "audit", frequency: "Ongoing", lastCompletedDate: "2023-06-12", status: "complete", notes: "Certified payrolls complete. No violations across project." },
      { id: "c3", title: "Single Audit (Uniform Guidance)", type: "audit", frequency: "One-time", lastCompletedDate: "2024-02-10", status: "complete", notes: "FY2023 Single Audit — no findings related to this award." },
      { id: "c4", title: "Final SF-425 Federal Financial Report", type: "report", frequency: "One-time", lastCompletedDate: "2024-03-15", status: "complete", notes: "Accepted by CMAP. Grant closed 2024-03-28." },
      { id: "c5", title: "Title VI Non-Discrimination Certification", type: "clearance", lastCompletedDate: "2021-07-01", status: "complete", notes: "Certified at agreement execution." },
    ],
  },

  // ─── 5. CLOSEOUT: AFG Self-Contained Breathing Apparatus (SCBA) ─────────
  {
    id: "afg-scba-2023",
    name: "Fire Dept SCBA Replacement — FEMA AFG",
    agency: "Federal Emergency Management Agency (FEMA)",
    program: "Assistance to Firefighters Grant (AFG)",
    awardAmount: 318_000,
    cityMatch: 31_800,
    totalProject: 349_800,
    awardDate: "2023-08-10",
    startDate: "2023-09-01",
    endDate: "2025-08-31",
    closeoutDate: "2025-06-01",
    status: "closeout",
    projectManager: "Fire Chief",
    grantCoordinator: "Deputy Village Manager",
    cfda: "97.044",
    primaryFocus: "Public Safety / Equipment",
    summary:
      "Replacement of 42 end-of-life self-contained breathing apparatus (SCBA) units and 84 spare cylinders to meet the current NFPA 1981 edition. Equipment in service; grant is in closeout pending final performance report and SF-425.",
    keyRisk:
      "Period of performance ends Aug 31, 2025. Final performance report + SF-425 closeout package due within 90 days of period end — Finance must reconcile final actuals.",
    disbursements: [
      { id: "d1", label: "SCBA Units Procurement", phase: "Procurement", amount: 248_000, status: "paid", date: "2024-01-22", invoiceNumber: "AFG-DR-2024-001", vendor: "MSA Safety / Air Mask Service Co.", description: "42 MSA G1 SCBA units with integrated thermal imaging, NFPA 1981 compliant.", federalSharePct: 91, checkNumber: "EFT-24-012266" },
      { id: "d2", label: "Spare Cylinders & Fit Testing", phase: "Procurement", amount: 52_000, status: "paid", date: "2024-03-15", invoiceNumber: "AFG-DR-2024-002", vendor: "Air Mask Service Co.", description: "84 carbon-fiber spare cylinders, department-wide fit testing and training.", federalSharePct: 91, checkNumber: "EFT-24-031902" },
      { id: "d3", label: "Closeout & Final Retention", phase: "Closeout", amount: 18_000, status: "pending", date: "2025-08-31", description: "Final invoice reconciliation and retention release pending SF-425 acceptance.", federalSharePct: 91, notes: "Awaiting final performance report submission before drawdown." },
    ],
    milestones: [
      { id: "m1", title: "Application Submitted", dueDate: "2023-03-01", completedDate: "2023-02-24", status: "complete", owner: "Fire Chief" },
      { id: "m2", title: "Award & Agreement Executed", dueDate: "2023-09-01", completedDate: "2023-09-01", status: "complete", owner: "Village Manager's Office" },
      { id: "m3", title: "SCBA Units Delivered & In Service", dueDate: "2024-02-01", completedDate: "2024-01-20", status: "complete", owner: "Fire Department" },
      { id: "m4", title: "Department-Wide Fit Testing & Training", dueDate: "2024-04-01", completedDate: "2024-03-28", status: "complete", owner: "Fire Department" },
      { id: "m5", title: "Final Performance Report & SF-425 Closeout", dueDate: "2025-11-30", status: "upcoming", owner: "Finance / Fire Chief" },
    ],
    compliance: [
      { id: "c1", title: "Final Performance Report (AFG)", type: "report", frequency: "One-time", dueDate: "2025-11-30", status: "due-soon", notes: "Due within 90 days of period-of-performance end (Aug 31, 2025)." },
      { id: "c2", title: "Final SF-425 Federal Financial Report", type: "report", frequency: "One-time", dueDate: "2025-11-30", status: "due-soon", notes: "Reconcile final actuals; release $18K retention on acceptance." },
      { id: "c3", title: "Equipment Inventory & Tagging", type: "monitoring", frequency: "One-time", lastCompletedDate: "2024-04-01", status: "complete", notes: "All 42 units tagged with grant asset IDs per AFG requirements." },
      { id: "c4", title: "Federal Equipment Use Certification", type: "clearance", lastCompletedDate: "2024-04-01", status: "current", notes: "Equipment used solely for authorized firefighting purposes." },
    ],
  },

  // ─── 6. DECLINED: EPA Brownfields Assessment ───────────────────────────
  {
    id: "epa-brownfields-2024",
    name: "Former Industrial Parcel Brownfields Assessment — EPA",
    agency: "U.S. Environmental Protection Agency (EPA)",
    program: "Brownfields Assessment Grant",
    awardAmount: 500_000,
    cityMatch: 0,
    totalProject: 500_000,
    awardDate: "",
    startDate: "",
    endDate: "",
    declinedDate: "2024-12-05",
    status: "declined",
    projectManager: "Director of Community Development",
    grantCoordinator: "Deputy Village Manager",
    cfda: "66.818",
    primaryFocus: "Environmental / Redevelopment",
    summary:
      "Phase I/II environmental site assessments and cleanup planning for a 12-acre former light-industrial parcel targeted for mixed-use redevelopment. Not selected in the FY2024 cycle; EPA feedback cited limited demonstrated community engagement — slated for resubmission FY2026 with a strengthened reuse plan.",
    keyRisk:
      "Declined Dec 2024. EPA debrief: strengthen community-engagement narrative and secure a letter of support from the county land bank before resubmitting in the FY2026 cycle.",
    disbursements: [],
    milestones: [
      { id: "m1", title: "Application Submitted", dueDate: "2024-08-01", completedDate: "2024-07-29", status: "complete", owner: "Director of Community Development" },
      { id: "m2", title: "EPA Review", dueDate: "2024-11-30", completedDate: "2024-11-30", status: "complete", owner: "EPA Region 5" },
      { id: "m3", title: "Award Decision — Not Selected", dueDate: "2024-12-05", completedDate: "2024-12-05", status: "complete", owner: "EPA Region 5" },
    ],
    compliance: [],
  },

  // ─── 7. ACTIVE: EECBG LED Streetlight Conversion ───────────────────────
  {
    id: "eecbg-streetlights-2024",
    name: "LED Streetlight Conversion — DOE EECBG",
    agency: "U.S. Department of Energy (DOE)",
    program: "Energy Efficiency and Conservation Block Grant (EECBG)",
    awardAmount: 1_600_000,
    cityMatch: 400_000,
    totalProject: 2_000_000,
    awardDate: "2024-06-20",
    startDate: "2024-08-01",
    endDate: "2026-12-31",
    status: "active",
    projectManager: "Director of Public Works",
    grantCoordinator: "Sustainability Coordinator",
    cfda: "81.128",
    primaryFocus: "Energy / Sustainability",
    summary:
      "Conversion of 3,100 village-owned streetlights and parking-lot fixtures to networked LED with adaptive dimming controls. Projected 61% energy reduction (~1,900 MWh/yr) and $240K annual utility savings. Phase 1 (arterials) complete; Phase 2 (residential) underway.",
    keyRisk:
      "Davis-Bacon prevailing-wage compliance on the residential phase contractor — first certified payroll review flagged a misclassification, corrected and resubmitted. Monitor weekly.",
    disbursements: [
      { id: "d1", label: "Design & Photometric Study", phase: "Design", amount: 180_000, status: "paid", date: "2024-10-15", invoiceNumber: "EECBG-DR-2024-001", vendor: "Clanton & Associates", description: "Photometric design, fixture spec, controls architecture, ComEd coordination.", federalSharePct: 80, checkNumber: "EFT-24-101455" },
      { id: "d2", label: "Phase 1 — Arterial Fixtures", phase: "Construction", amount: 620_000, status: "paid", date: "2025-04-30", invoiceNumber: "EECBG-DR-2025-002", vendor: "Aldridge Electric", description: "1,240 arterial/collector LED fixtures with networked controls; ComEd pole attachments.", federalSharePct: 80, checkNumber: "EFT-25-043388" },
      { id: "d3", label: "Phase 2 — Residential Fixtures", phase: "Construction", amount: 520_000, status: "pending", date: "2026-07-31", invoiceNumber: "EECBG-DR-2026-003", vendor: "Aldridge Electric", description: "1,860 residential LED conversions, adaptive dimming commissioning. Drawdown submitted 2026-06-05.", federalSharePct: 80, notes: "DOE review in progress — expected payment Aug 2026." },
      { id: "d4", label: "Controls Platform & Closeout", phase: "Closeout", amount: 280_000, status: "planned", date: "2026-12-31", description: "Central management software, M&V energy-savings report, final SF-425.", federalSharePct: 80 },
    ],
    milestones: [
      { id: "m1", title: "Grant Agreement Executed", dueDate: "2024-08-01", completedDate: "2024-08-01", status: "complete", owner: "Village Manager's Office" },
      { id: "m2", title: "Photometric Design Complete", dueDate: "2024-11-01", completedDate: "2024-10-10", status: "complete", owner: "Engineering" },
      { id: "m3", title: "Phase 1 Arterial Conversion Complete", dueDate: "2025-05-01", completedDate: "2025-04-25", status: "complete", owner: "Public Works / Contractor" },
      { id: "m4", title: "Phase 2 Residential Conversion (55%)", dueDate: "2026-08-31", status: "in-progress", progress: 55, owner: "Public Works / Contractor" },
      { id: "m5", title: "Controls Platform Go-Live", dueDate: "2026-10-31", status: "upcoming", owner: "Public Works / IT" },
      { id: "m6", title: "Measurement & Verification Report", dueDate: "2026-12-15", status: "upcoming", owner: "Sustainability Coordinator" },
      { id: "m7", title: "Final Report & SF-425 Closeout", dueDate: "2026-12-31", status: "upcoming", owner: "Finance / Sustainability Coordinator" },
    ],
    compliance: [
      { id: "c1", title: "Davis-Bacon Act Wage Compliance", type: "audit", frequency: "Ongoing — certified payrolls weekly", lastCompletedDate: "2026-05-29", status: "current", notes: "Residential-phase misclassification flagged 2026-05; corrected and resubmitted. Monitoring weekly." },
      { id: "c2", title: "Quarterly Progress Reports", type: "report", frequency: "Quarterly", dueDate: "2026-07-01", lastCompletedDate: "2026-04-01", status: "current", notes: "Q1 2026 filed; Q2 2026 due July 1." },
      { id: "c3", title: "Federal Financial Report (SF-425)", type: "report", frequency: "Semi-annual", dueDate: "2026-06-30", lastCompletedDate: "2025-12-31", status: "due-soon", notes: "Semi-annual SF-425 due June 30, 2026." },
      { id: "c4", title: "Buy America(n) Compliance — Fixtures", type: "clearance", lastCompletedDate: "2024-10-15", status: "current", notes: "Fixture vendor BABA certification on file; waiver not required." },
      { id: "c5", title: "Energy Savings M&V Plan", type: "monitoring", frequency: "Annual", lastCompletedDate: "2025-12-01", status: "current", notes: "Baseline established; Phase 1 tracking 63% reduction vs 61% target." },
    ],
  },
];

// ─── Helper: find grant by ID ────────────────────────────────────────────────
export function findGrant(id: string): ActiveGrant | undefined {
  return GRANT_PORTFOLIO.find((g) => g.id === id);
}

// ─── Helper: compute portfolio summary stats ─────────────────────────────────
export function portfolioStats() {
  const active = GRANT_PORTFOLIO.filter((g) => g.status === "active");
  // Awarded = every grant that was funded (active, in closeout, or fully closed)
  const funded = GRANT_PORTFOLIO.filter((g) => g.status === "active" || g.status === "closeout" || g.status === "closed");
  const totalAwarded = funded.reduce((s, g) => s + g.awardAmount, 0);
  const totalApplied = GRANT_PORTFOLIO.filter((g) => g.status === "applied")
    .reduce((s, g) => s + g.awardAmount, 0);
  const totalDisbursed = funded.flatMap((g) => g.disbursements)
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

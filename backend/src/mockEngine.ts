/**
 * CivicGrant IQ — Tier 3 Mock Engine
 *
 * Deterministic, zero-credential grant analysis for reliable live demonstrations.
 * The full pipeline — KB retrieval, 6-step reasoning, widget synthesis — runs in
 * under 200ms using pre-seeded Buffalo Grove grant data.
 *
 * Tier hierarchy:
 *   Tier 1: Azure AI Foundry Assistants API + Foundry IQ MCP knowledge retrieval
 *   Tier 2: Direct Azure OpenAI Chat Completions + Azure AI Search KB injection
 *   Tier 3: This engine — deterministic rule-based analysis, zero Azure credentials
 *
 * All three tiers share the same AgentRunResult contract, so downstream
 * agents and the frontend widget renderer never know which tier ran.
 */

import type { AgentRunOptions, AgentRunResult, Citation, ReasoningStep } from "./agent";

// ─── Scenario detection ───────────────────────────────────────────────────────
type MockScenario = "bric" | "raise" | "stormwater" | "generic";

function detectScenario(message: string): MockScenario {
  const m = message.toLowerCase();
  if (/\bfema\b|\bbric\b|flood|resilience|hazard|mitigation|creek|watershed/.test(m)) return "bric";
  if (/\braise\b|transportation|road|corridor|intersection|aptakisic|transit|bike\s*lane|pedestrian|safety|signal/.test(m)) return "raise";
  if (/\bstormwater\b|epa|clean\s*water|srf|wetland|culvert|northwood|drainage|runoff|ms4/.test(m)) return "stormwater";
  return "generic";
}

// ─── Pre-seeded citations ─────────────────────────────────────────────────────
const BG_CITATIONS: Citation[] = [
  {
    id: "BG-CityProfile-2026",
    title: "BG City Profile 2026 — Village of Buffalo Grove",
    excerpt: "Population 41,496 | Median HHI $103,847 | Moody's Aa2 | CRS Class 7 | $15.4M capital reserves | $89.4M in active CIP projects | 100% grant compliance record on $14.8M in prior federal awards.",
    source: "foundry_iq",
  },
  {
    id: "BG-CapitalImprovementPlan-2026-2030",
    title: "BG Capital Improvement Plan 2026–2030",
    excerpt: "15 priority projects totaling $89.4M, of which $34.4M is in active federal/state grant pursuit. Key projects: Aptakisic Road ($18.2M), Northwood Stormwater ($8.1M), Buffalo Creek Watershed ($6.8M), Long Grove Trail ($2.3M).",
    source: "foundry_iq",
  },
  {
    id: "BG-PastApplication-BRIC-BuffaloCreek-2025",
    title: "BG Past Application — FEMA BRIC Buffalo Creek 2025",
    excerpt: "FEMA BRIC FY2025 sub-application: $3.4M request, Buffalo Creek watershed flood-warning sensor network, green infrastructure retrofit, lift-station hardening. Demonstrates BG's proven technical capacity for climate resilience infrastructure.",
    source: "foundry_iq",
  },
  {
    id: "BG-PastApplication-RAISE-Aptakisic-IL83-2024",
    title: "BG Past Application — RAISE Aptakisic/IL-83 2024",
    excerpt: "USDOT RAISE FY2024: $5.0M request for Aptakisic Road/IL-83 intersection reconstruction, adaptive signal timing, protected bike lane, and stormwater BMP integration. Strong safety + equity narrative with 12-year crash history data.",
    source: "foundry_iq",
  },
  {
    id: "BG-PastApplication-Northwood-Stormwater-SMC-2024",
    title: "BG Past Application — SMC SIIP Northwood Stormwater 2024",
    excerpt: "AWARDED $5.5M — SMC SIIP grant for Northwood neighborhood stormwater wetland, culvert replacement, and Hastings Drive road reconstruction. Confirms BG's track record of delivering complex stormwater projects on time and on budget.",
    source: "foundry_iq",
  },
];

// ─── SCENARIO: FEMA BRIC ──────────────────────────────────────────────────────
const BRIC_RESPONSE = `## Step 1 — Parse the Grant

**Grant Name:** FEMA Building Resilient Infrastructure and Communities (BRIC)
**Funding Agency:** Federal Emergency Management Agency (FEMA), DHS
**Total Available Funding:** $1.16 billion (FY2026 appropriation)
**Award Range:** $500,000–$50,000,000 per sub-applicant; no per-project ceiling for capability and capacity building activities
**Application Deadline:** 2026-09-30 (anticipated; FY2025 closed Jan 2026)
**Eligible Applicants:** State, territorial, tribal, and local governments through a state sub-applicant process; Illinois sub-applicants apply through IEMA
**Focus Area:** Climate resilience, hazard mitigation, flood risk reduction, green infrastructure, warning systems
**Matching Requirement:** 25% non-federal cost-share (may include in-kind; BRIC allows stacking with other non-federal funds)
**Key Eligibility Criteria:** Must have FEMA-approved Hazard Mitigation Plan; project must reduce documented hazard risk; preference for nature-based solutions

---

## Step 2 — Match City Projects

**Overall Match Rating: 91%** — CONFIRMED (corroborated by BG-PastApplication-BRIC-BuffaloCreek-2025 AND BG-CapitalImprovementPlan-2026-2030)

Buffalo Grove has a near-perfect alignment with BRIC objectives:

- **Buffalo Creek Watershed Resilience (CIP Priority #3, $6.8M total):** Green infrastructure retrofit, flood-warning IoT sensor network, and lift-station hardening directly match BRIC's nature-based solutions priority and warning-system subcategory. The FY2025 $3.4M sub-application for this project is already in IEMA's pipeline — a FY2026 resubmission with enhanced scope is the recommended path.
- **Northwood Stormwater Detention Expansion ($2.1M, CIP Priority #7):** Expands on the AWARDED SMC SIIP project with an additional upstream detention basin, eligible under BRIC's flood-damage reduction subcategory.
- **CRS Class 7 rating** confirms FEMA recognizes BG's floodplain management program — a scoring advantage in BRIC's benefit-cost ratio calculation.

---

## Step 3 — Verify Financial Capacity

Buffalo Grove's financial profile comfortably meets BRIC's 25% match requirement:

- **Capital Reserves:** $15.4M (BG City Profile 2026) — sufficient to cover the $850,000 match on a $3.4M request without bonding
- **Moody's Aa2 rating** signals strong debt capacity for any supplemental financing
- **CIP already allocates $6.8M to Buffalo Creek** — the local-share portion is already budgeted, eliminating a major application risk
- **Precedent:** BG executed the $5.5M SMC SIIP award with zero compliance findings, demonstrating financial management capacity FEMA evaluators will scrutinize

Financial Capacity: **CONFIRMED** — no gaps in cost-share coverage.

---

## Step 4 — Gap Analysis

**Overall Match Rating: 91%**

- **Gap: Updated Benefit-Cost Analysis** — Severity: moderate. Suggestion: Commission a FEMA-compliant BCA using HazusMH for the Buffalo Creek watershed; Public Works should engage a certified FEMA BCA consultant by Week 2 to ensure the ratio exceeds the 1.0 threshold (prior FY2025 analysis showed 1.4).
- **Gap: IEMA Sub-Applicant Pre-Application Coordination** — Severity: moderate. Suggestion: IEMA requires sub-applicant intent forms 90 days before the federal deadline; City Manager's Office should submit the intent form within 30 days and schedule a pre-application call with IEMA's Hazard Mitigation branch.
- **Gap: Engineering Final Design Scope** — Severity: minor. Suggestion: BRIC scoring rewards projects at 30%+ design completion; Public Works should advance the Buffalo Creek sensor-network design to schematic level before submission to earn the design-readiness bonus points.

---

## Step 5 — Draft Project Narrative

Based on Buffalo Grove's FY2025 BRIC sub-application for the Buffalo Creek Watershed, which demonstrated the Village's capacity to deliver complex green-infrastructure and early-warning systems, this application applies the same proven approach to an expanded flood-resilience scope.

Buffalo Grove, Illinois (pop. 41,496, Lake/Cook County border) faces recurring flood risk along the 4.2-mile Buffalo Creek corridor, with 347 NFIP-insured properties and $89M in documented structure exposure. The FY2026 project expands the FY2025 scope to include: (1) a 12-node IoT flood-warning sensor network with 30-minute advance notification capability; (2) 2.3 acres of bioswale and native prairie green infrastructure reducing peak runoff by 38%; and (3) structural hardening of Lift Station 7, which serves 1,200 households at highest flood risk.

Buffalo Grove's 100% grant compliance record across $14.8M in prior federal awards — including the FY2024 SMC SIIP $5.5M award — demonstrates the financial management and project delivery capacity that FEMA evaluators prioritize. The Village's CRS Class 7 designation and FEMA-approved Hazard Mitigation Plan satisfy all statutory prerequisites.

---

## Step 6 — Application Strategy & Winning Edge

**Priority Action Items (next 30 days):**
- **Week 1:** City Manager's Office submits IEMA sub-applicant intent form and schedules pre-application meeting with IEMA Hazard Mitigation; Finance confirms 25% match allocation in FY2027 budget amendment
- **Week 2:** Public Works commissions updated FEMA-compliant Benefit-Cost Analysis (HazusMH); obtains quotes from FEMA BCA-certified consultants
- **Week 3:** Public Works advances Buffalo Creek sensor-network design to 30% schematic level; coordinates with Lake County SWCD for nature-based solutions technical review
- **Week 4:** City Manager's Office drafts project narrative using FY2025 sub-application as baseline; legal team confirms IEMA sub-applicant agreement terms

**Winning Differentiator:** Buffalo Grove is the only Lake County municipality with a current FEMA-approved HMP, an active BRIC application in IEMA's pipeline, AND an AWARDED stormwater grant in the same watershed — a triple-verified track record that dramatically reduces evaluator risk perception.

**Competition Level:** High (BRIC FY2025 received 1,227 sub-applications nationally for $1.16B in funding; Illinois typically submits 40–60 sub-applications). BG's resubmission with an enhanced scope and updated BCA positions it in the top quartile based on prior scoring feedback.

**4-Week Milestone Timeline:**
- Week 1: IEMA intent form + match confirmation — City Manager's Office
- Week 2: BCA commission + design scope — Public Works
- Week 3: 30% design + Lake County coordination — Public Works / Engineering
- Week 4: Narrative draft + legal review — City Manager's Office / Legal

\`\`\`widget
{
  "type": "grant_match",
  "data": {
    "grantName": "FEMA BRIC — Building Resilient Infrastructure and Communities",
    "agency": "Federal Emergency Management Agency (FEMA)",
    "fundingAmount": 1160000000,
    "awardRange": "$500K–$50M per sub-applicant",
    "deadline": "2026-09-30",
    "matchScore": 91,
    "gaps": [
      { "title": "Updated Benefit-Cost Analysis", "severity": "moderate", "suggestion": "Commission a FEMA-compliant BCA using HazusMH; Public Works should engage a certified consultant by Week 2 to confirm ratio exceeds 1.0 threshold." },
      { "title": "IEMA Sub-Applicant Intent Form", "severity": "moderate", "suggestion": "Submit IEMA intent form within 30 days; schedule pre-application call with IEMA Hazard Mitigation branch — 90-day lead time required." },
      { "title": "Engineering Design Completion", "severity": "minor", "suggestion": "Advance Buffalo Creek sensor-network design to 30% schematic level before submission to earn BRIC design-readiness bonus points." }
    ],
    "strengths": [
      "CRS Class 7 designation — FEMA-recognized floodplain management program",
      "FEMA-approved Hazard Mitigation Plan already on file — statutory prerequisite satisfied",
      "FY2025 BRIC sub-application already in IEMA pipeline — resubmission reduces prep time by 60%",
      "100% grant compliance record across $14.8M in prior federal awards"
    ],
    "narrativeDraft": "Buffalo Grove (pop. 41,496) faces recurring flood risk along the 4.2-mile Buffalo Creek corridor with 347 NFIP-insured properties and $89M in structure exposure. The FY2026 project delivers: a 12-node IoT flood-warning sensor network (30-min advance notification), 2.3 acres of bioswale green infrastructure (38% peak runoff reduction), and Lift Station 7 hardening serving 1,200 households. Buffalo Grove's 100% compliance record across $14.8M in federal awards and CRS Class 7 designation confirm delivery capacity.",
    "strategy": {
      "actionItems": [
        "Week 1 — Submit IEMA intent form and schedule pre-application meeting — City Manager's Office",
        "Week 2 — Commission FEMA-compliant BCA (HazusMH) and confirm 25% match in budget — Public Works / Finance",
        "Week 3 — Advance Buffalo Creek design to 30% schematic and coordinate with Lake County SWCD — Public Works",
        "Week 4 — Draft narrative from FY2025 baseline and complete legal review of IEMA agreement — City Manager's Office"
      ],
      "winningDifferentiator": "Buffalo Grove is the only Lake County municipality with an approved HMP, an active BRIC application in IEMA's pipeline, and an AWARDED stormwater grant in the same watershed — a triple-verified track record that sharply reduces evaluator risk.",
      "competitionLevel": "high",
      "weeklyMilestones": [
        { "week": 1, "task": "IEMA intent form submission + match budget confirmation", "owner": "City Manager's Office / Finance" },
        { "week": 2, "task": "Commission FEMA BCA consultant; scope updated HazusMH analysis", "owner": "Public Works" },
        { "week": 3, "task": "Advance design to 30% schematic; Lake County SWCD coordination", "owner": "Public Works / Engineering" },
        { "week": 4, "task": "Narrative draft, legal review, and IEMA pre-application meeting", "owner": "City Manager's Office" }
      ]
    }
  }
}
\`\`\``;

// ─── SCENARIO: RAISE Transportation ──────────────────────────────────────────
const RAISE_RESPONSE = `## Step 1 — Parse the Grant

**Grant Name:** RAISE — Rebuilding American Infrastructure with Sustainability and Equity
**Funding Agency:** U.S. Department of Transportation (USDOT)
**Total Available Funding:** $1.5 billion (FY2026 appropriation)
**Award Range:** $5M–$25M for rural projects; $25M–$50M for urban projects; minimum $1M
**Application Deadline:** 2026-07-15 (anticipated FY2026 NOFO; FY2025 closed April 2025)
**Eligible Applicants:** State, local governments, transit agencies, tribes, MPOs, port authorities
**Focus Area:** Surface transportation safety, equity, climate resilience, economic competitiveness, state of good repair
**Matching Requirement:** 20% non-federal (waivable for projects in areas of persistent poverty or rural areas)
**Key Eligibility Criteria:** Significant local or regional impact; safety, equity, or climate benefits; benefit-cost ratio > 1.0

---

## Step 2 — Match City Projects

**Overall Match Rating: 88%** — CONFIRMED (corroborated by BG-PastApplication-RAISE-Aptakisic-IL83-2024 AND BG-CapitalImprovementPlan-2026-2030)

Buffalo Grove has direct precedent for RAISE funding:

- **Aptakisic Road / IL-83 Corridor Reconstruction ($18.2M, CIP Priority #1):** The FY2024 RAISE application ($5M request) for this project established a strong baseline — adaptive signal timing, protected bike lane, stormwater BMPs, and crash-reduction improvements at a corridor with 12-year documented crash history. A FY2026 resubmission with IDOT partnership and updated safety data significantly strengthens the package.
- **Long Grove Road Multimodal Trail Extension ($2.3M, CIP Priority #8):** Eligible as a standalone RAISE application or as part of the larger Aptakisic corridor package, adding active-transportation and climate equity scoring dimensions.
- **Proximity to Metra / Pace connections** strengthens the equity and transit-access narrative required by USDOT's FY2026 scoring criteria.

---

## Step 3 — Verify Financial Capacity

- **Capital Reserves:** $15.4M — covers the $3.6M match on a $18M project without borrowing
- **IDOT Partnership:** BG's existing MOU with IDOT for the IL-83 overlay creates a pathway for IDOT to co-fund the state match, reducing BG's direct exposure
- **Moody's Aa2 / $89.4M CIP** confirms financial capacity for a project of this scale
- **FY2024 RAISE application** — already completed environmental review and preliminary engineering, reducing duplicative costs for FY2026 resubmission

---

## Step 4 — Gap Analysis

**Overall Match Rating: 88%**

- **Gap: Updated Safety Data (KABCO crash analysis)** — Severity: moderate. Suggestion: Public Works should pull current IDOT crash data for Aptakisic/IL-83 for the most recent 5-year period; a higher injury rate strengthens the safety scoring category, which USDOT weights at 20% of total score.
- **Gap: Equity Analysis (EJ/DAC designation)** — Severity: moderate. Suggestion: Finance/Planning should confirm whether any project census tracts qualify as Disadvantaged Communities (DAC) under the Justice40 framework; DAC designation unlocks a 20% match waiver and adds equity scoring points.
- **Gap: Benefit-Cost Analysis refresh** — Severity: minor. Suggestion: Update the FY2024 BCA with current construction costs (ENR index) and updated KABCO crash values; USDOT expects BCA to reflect current dollars.

---

## Step 5 — Draft Project Narrative

Based on Buffalo Grove's FY2024 RAISE application for the Aptakisic Road/IL-83 corridor — which demonstrated the Village's capacity to deliver complex multi-modal reconstructions with documented safety and equity impacts — this application advances an expanded scope targeting the full 1.8-mile corridor with IDOT as a co-applicant.

The Aptakisic Road/IL-83 corridor in Buffalo Grove, IL carries 22,400 AADT and has recorded 147 crashes over 12 years, including 23 injury-level events. The proposed reconstruction delivers: (1) complete signal replacement with adaptive timing reducing average vehicle delay by 31%; (2) a 1.8-mile protected bike lane connecting two Metra station catchment areas; (3) stormwater BMPs eliminating a Class C flooding hot-spot affecting 4 residential blocks; and (4) ADA-compliant pedestrian infrastructure closing a documented gap in Buffalo Grove's ADA Transition Plan.

Buffalo Grove's $5.0M FY2024 RAISE application — supported by 30% preliminary engineering, a completed environmental review, and an IDOT right-of-way agreement — positions this FY2026 resubmission as an implementation-ready project with minimal pre-award risk.

---

## Step 6 — Application Strategy & Winning Edge

**Priority Action Items (next 30 days):**
- **Week 1:** Public Works pulls 5-year IDOT KABCO crash data for Aptakisic/IL-83; Planning confirms Justice40 / DAC census tract status
- **Week 2:** Finance updates BCA with current ENR construction indices; Engineering advances design to 60% plans (reuses FY2024 30% design)
- **Week 3:** City Manager's Office confirms IDOT co-applicant status and executes updated MOU; Law Department clears ROW status
- **Week 4:** City Manager's Office drafts narrative from FY2024 baseline; prepares Letters of Support from Lake County, CMAP, and Metra

**Winning Differentiator:** Buffalo Grove's FY2024 RAISE application is the only known Lake County sub-urban resubmission with completed environmental review, 30% design, and an IDOT partnership — compressing the typical 18-month pre-application phase to near-zero and dramatically reducing USDOT's implementation-risk score.

**Competition Level:** High (RAISE FY2025 received 900+ applications for $1.5B; USDOT funded approximately 160 projects). BG's resubmission with a completed environmental review scores in the top quartile for project readiness.

\`\`\`widget
{
  "type": "grant_match",
  "data": {
    "grantName": "RAISE — Rebuilding American Infrastructure with Sustainability and Equity",
    "agency": "U.S. Department of Transportation (USDOT)",
    "fundingAmount": 1500000000,
    "awardRange": "$5M–$25M (suburban); $1M minimum",
    "deadline": "2026-07-15",
    "matchScore": 88,
    "gaps": [
      { "title": "Updated KABCO Crash Safety Data", "severity": "moderate", "suggestion": "Pull current 5-year IDOT crash data for Aptakisic/IL-83; higher injury rate improves safety scoring weight (20% of total USDOT score)." },
      { "title": "Justice40 / DAC Equity Analysis", "severity": "moderate", "suggestion": "Confirm DAC census tract designation; qualifies BG for 20% match waiver and adds equity scoring points under USDOT FY2026 criteria." },
      { "title": "Benefit-Cost Analysis Refresh", "severity": "minor", "suggestion": "Update FY2024 BCA with current ENR construction cost indices and updated KABCO crash values." }
    ],
    "strengths": [
      "FY2024 RAISE application with 30% preliminary engineering and completed environmental review",
      "IDOT co-applicant partnership — state MOU already executed",
      "147 documented crashes over 12 years — quantified safety benefit for BCA",
      "Active-transportation and Metra connectivity — strong equity narrative"
    ],
    "narrativeDraft": "The Aptakisic/IL-83 corridor (22,400 AADT, 147 crashes/12 years) delivers adaptive signal timing (31% delay reduction), a 1.8-mile protected bike lane connecting Metra catchment areas, stormwater BMPs, and ADA-compliant pedestrian infrastructure. Buffalo Grove's FY2024 RAISE application with 30% design and completed environmental review positions this resubmission as implementation-ready with minimal USDOT pre-award risk.",
    "strategy": {
      "actionItems": [
        "Week 1 — Pull 5-year IDOT KABCO crash data and confirm Justice40/DAC status — Public Works / Planning",
        "Week 2 — Update BCA with ENR indices; advance design to 60% plans — Finance / Engineering",
        "Week 3 — Confirm IDOT co-applicant MOU and clear ROW status — City Manager's Office / Law",
        "Week 4 — Draft narrative from FY2024 baseline; collect Letters of Support — City Manager's Office"
      ],
      "winningDifferentiator": "Only Lake County sub-urban RAISE resubmission with completed environmental review, 30% design, and IDOT partnership — compressing pre-application prep time to near-zero.",
      "competitionLevel": "high",
      "weeklyMilestones": [
        { "week": 1, "task": "IDOT crash data pull + DAC census tract analysis", "owner": "Public Works / Planning" },
        { "week": 2, "task": "BCA refresh + design advancement to 60%", "owner": "Finance / Engineering" },
        { "week": 3, "task": "IDOT MOU confirmation + ROW clearance", "owner": "City Manager's Office / Law" },
        { "week": 4, "task": "Narrative draft + Letters of Support collection", "owner": "City Manager's Office" }
      ]
    }
  }
}
\`\`\``;

// ─── SCENARIO: Stormwater / EPA SRF ──────────────────────────────────────────
const STORMWATER_RESPONSE = `## Step 1 — Parse the Grant

**Grant Name:** EPA Clean Water State Revolving Fund (CWSRF) — Illinois EPA SRF Green Infrastructure Set-Aside
**Funding Agency:** U.S. Environmental Protection Agency (EPA) / Illinois Environmental Protection Agency (IEPA)
**Total Available Funding:** $3.2 billion nationally; Illinois SRF capitalization ~$180M/year; green infrastructure set-aside ~$18M
**Award Range:** $500,000–$15,000,000 (low-interest loans, often forgivable up to 30% for green infrastructure)
**Application Deadline:** 2026-03-31 (IEPA SRF project priority list cycle; rolling applications accepted)
**Eligible Applicants:** Municipalities, sanitary districts, and intergovernmental entities in Illinois
**Focus Area:** Stormwater infrastructure, green infrastructure, CSO/SSO elimination, MS4 compliance, water quality improvement
**Matching Requirement:** None for SRF loans; principal forgiveness (grant-equivalent) available for green infrastructure up to 30%
**Key Eligibility Criteria:** Must be on IEPA's Project Priority List; must have MS4 NPDES permit in compliance; project must improve water quality

---

## Step 2 — Match City Projects

**Overall Match Rating: 93%** — CONFIRMED (corroborated by BG-PastApplication-Northwood-Stormwater-SMC-2024 AND BG-CapitalImprovementPlan-2026-2030)

Buffalo Grove has an exceptionally strong stormwater grant profile:

- **AWARDED FY2024 SMC SIIP ($5.5M):** Northwood neighborhood stormwater wetland, culvert replacement, and Hastings Drive reconstruction — confirms project delivery capacity and establishes Buffalo Grove as a proven IEPA/SMC partner.
- **Northwood Phase 2 Detention Basin ($2.1M, CIP Priority #7):** Natural upstream extension of the AWARDED project; IEPA will give prioritization credit for projects that expand completed work.
- **Buffalo Grove MS4 NPDES Permit (#ILR400261):** Active and in compliance — a statutory prerequisite that competitors without an MS4 permit cannot satisfy.
- **CRS Class 7 designation** reinforces stormwater management program quality recognized by both FEMA and EPA.

---

## Step 3 — Verify Financial Capacity

- The CWSRF is a **low-interest loan program** (current Illinois rate: 1.5%); principal forgiveness of up to 30% makes it functionally a 70% loan / 30% grant
- **$15.4M capital reserves** comfortably service the loan portion of a $2.1M Northwood Phase 2 project
- **Precedent:** BG executed the $5.5M SMC SIIP award with zero compliance findings, demonstrating financial management capacity IEPA evaluators will prioritize
- **No match requirement** eliminates the primary financial barrier that often disqualifies smaller municipalities

---

## Step 4 — Gap Analysis

**Overall Match Rating: 93%**

- **Gap: IEPA Project Priority List (PPL) Submission** — Severity: moderate. Suggestion: Public Works must submit a PPL application to IEPA's Division of Water Pollution Control by the quarterly deadline; without PPL listing, projects are ineligible for SRF funding in the current cycle.
- **Gap: Green Infrastructure Technical Documentation** — Severity: minor. Suggestion: Prepare a green infrastructure performance worksheet documenting the detention basin's pollutant load reduction (lbs/year) and volume reduction (acre-feet/year) — IEPA requires this for the 30% principal forgiveness category.
- **Gap: MS4 Annual Report Currency** — Severity: minor. Suggestion: Confirm the FY2025 MS4 annual report was submitted to IEPA on time; late or missing reports disqualify projects from the green infrastructure set-aside.

---

## Step 5 — Draft Project Narrative

Based on Buffalo Grove's FY2024 SMC SIIP application for the Northwood Stormwater project — which demonstrated the Village's capacity to deliver complex stormwater wetland and culvert reconstruction projects — this CWSRF application extends the same proven approach to the upstream Northwood Phase 2 detention basin.

Buffalo Grove's Northwood neighborhood drains 287 acres of mixed residential and commercial impervious surface into the West Branch of Buffalo Creek, contributing 4.2 million gallons annually to combined-sewer overflow events. The proposed Northwood Phase 2 detention basin — a 1.8-acre constructed wetland with an 18-acre-foot storage capacity — will reduce peak runoff by 42%, remove an estimated 1,240 lbs/year of suspended solids, and eliminate the Hastings/Dundee flooding hot-spot that has triggered 14 property-damage claims since 2019.

The Village's $5.5M SMC SIIP AWARD for the adjacent Northwood Phase 1 confirms IEPA's confidence in BG's project delivery capability. Phase 2 leverages the same engineering consultant, procurement pathway, and project management team — reducing implementation risk to the lowest possible level.

---

## Step 6 — Application Strategy & Winning Edge

**Priority Action Items (next 30 days):**
- **Week 1:** Public Works submits IEPA PPL application for Northwood Phase 2; Engineering prepares green infrastructure performance worksheet (pollutant load reduction, volume reduction)
- **Week 2:** Finance confirms debt service capacity for SRF loan portion; Public Works verifies FY2025 MS4 annual report submission to IEPA
- **Week 3:** Engineering finalizes 30% design for detention basin; coordinates with West Branch Buffalo Creek watershed council for co-benefit documentation
- **Week 4:** City Manager's Office drafts SRF application narrative using Phase 1 application as template; prepares SMC co-funding letter

**Winning Differentiator:** Buffalo Grove is the only Lake County municipality with an AWARDED stormwater grant (Phase 1) and an active NPDES MS4 permit in compliance immediately adjacent to the proposed Phase 2 project — creating an IEPA-recognized project-continuation pathway that scores in the top 5% of all SRF applications in Illinois.

**Competition Level:** Medium (Illinois SRF receives ~80–120 applications per cycle; green infrastructure set-aside is oversubscribed 2:1 on average). BG's Phase 1 award and Phase 2 continuation status places it at the front of the queue.

\`\`\`widget
{
  "type": "grant_match",
  "data": {
    "grantName": "EPA CWSRF — Illinois Clean Water SRF Green Infrastructure Set-Aside",
    "agency": "Illinois Environmental Protection Agency (IEPA) / U.S. EPA",
    "fundingAmount": 180000000,
    "awardRange": "$500K–$15M (30% principal forgiveness on green infrastructure)",
    "deadline": "2026-03-31",
    "matchScore": 93,
    "gaps": [
      { "title": "IEPA Project Priority List Submission", "severity": "moderate", "suggestion": "Submit PPL application to IEPA Division of Water Pollution Control by quarterly deadline — PPL listing is a prerequisite for SRF eligibility in the current cycle." },
      { "title": "Green Infrastructure Technical Documentation", "severity": "minor", "suggestion": "Prepare pollutant load reduction worksheet (lbs/year) and volume reduction (acre-feet/year) for the 30% principal forgiveness category." },
      { "title": "MS4 Annual Report Currency Verification", "severity": "minor", "suggestion": "Confirm FY2025 MS4 annual report was submitted on time; late reports disqualify projects from the green infrastructure set-aside." }
    ],
    "strengths": [
      "AWARDED $5.5M SMC SIIP Phase 1 in the same watershed — Phase 2 continuation pathway",
      "Active NPDES MS4 permit in compliance — statutory prerequisite satisfied",
      "CRS Class 7 designation — FEMA/EPA-recognized stormwater management program",
      "Same engineering team and procurement pathway as Phase 1 — near-zero implementation risk"
    ],
    "narrativeDraft": "Northwood Phase 2: a 1.8-acre constructed wetland with 18-acre-foot storage capacity reduces peak runoff 42%, removes 1,240 lbs/year suspended solids, and eliminates a flooding hot-spot with 14 property-damage claims since 2019. Leverages the same consultant, procurement, and PM team as the AWARDED $5.5M Phase 1 — demonstrating an IEPA-recognized project-continuation pathway.",
    "strategy": {
      "actionItems": [
        "Week 1 — Submit IEPA PPL application + prepare GI performance worksheet — Public Works / Engineering",
        "Week 2 — Confirm SRF debt service capacity + verify MS4 annual report — Finance / Public Works",
        "Week 3 — Finalize 30% design + watershed council co-benefit documentation — Engineering",
        "Week 4 — Draft SRF application narrative from Phase 1 template + SMC co-funding letter — City Manager's Office"
      ],
      "winningDifferentiator": "Only Lake County municipality with an AWARDED Phase 1 grant and active MS4 permit adjacent to the Phase 2 site — IEPA project-continuation pathway scores in the top 5% of all SRF applications.",
      "competitionLevel": "medium",
      "weeklyMilestones": [
        { "week": 1, "task": "IEPA PPL submission + GI performance worksheet", "owner": "Public Works / Engineering" },
        { "week": 2, "task": "SRF debt service analysis + MS4 report verification", "owner": "Finance / Public Works" },
        { "week": 3, "task": "30% design finalization + watershed co-benefit docs", "owner": "Engineering" },
        { "week": 4, "task": "SRF narrative draft + SMC co-funding letter", "owner": "City Manager's Office" }
      ]
    }
  }
}
\`\`\``;

// ─── SCENARIO: Generic (CDBG / EDA) ──────────────────────────────────────────
const GENERIC_RESPONSE = BRIC_RESPONSE; // default to BRIC as the most demo-relevant scenario

// ─── Mock widget extraction ───────────────────────────────────────────────────
function extractMockWidget(text: string): { type: string; data: unknown } | undefined {
  try {
    const m = text.match(/```widget\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1]) as { type: string; data: unknown };
  } catch { /* skip */ }
  return undefined;
}

// ─── Mock reasoning steps ─────────────────────────────────────────────────────
function buildMockSteps(response: string): ReasoningStep[] {
  const LABELS = [
    "Parse the Grant",
    "Match City Projects",
    "Verify Financial Capacity",
    "Gap Analysis",
    "Draft Project Narrative",
    "Application Strategy & Winning Edge",
  ];
  return LABELS.map((label, i) => {
    const step = i + 1;
    const regex = new RegExp(
      `## Step ${step}[^\\n]*\\n([\\s\\S]*?)(?=## Step ${step + 1}|\`\`\`widget|$)`,
      "i"
    );
    const m = response.match(regex);
    return { step, label, content: m ? m[1].trim() : "", completed: true };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────
const MOCK_RESPONSES: Record<MockScenario, string> = {
  bric: BRIC_RESPONSE,
  raise: RAISE_RESPONSE,
  stormwater: STORMWATER_RESPONSE,
  generic: GENERIC_RESPONSE,
};

const MOCK_CITATIONS_BY_SCENARIO: Record<MockScenario, Citation[]> = {
  bric:       [BG_CITATIONS[0], BG_CITATIONS[1], BG_CITATIONS[2]],
  raise:      [BG_CITATIONS[0], BG_CITATIONS[1], BG_CITATIONS[3]],
  stormwater: [BG_CITATIONS[0], BG_CITATIONS[1], BG_CITATIONS[4]],
  generic:    BG_CITATIONS,
};

/**
 * Run the grant analysis via the deterministic mock engine (Tier 3).
 * Zero Azure credentials required. Full pipeline in <200ms.
 * Emits reasoning steps and chunks via the same callbacks as Tier 1/2.
 */
export async function runViaMockEngine(
  options: AgentRunOptions,
  t0: number
): Promise<AgentRunResult & { tier: 3 }> {
  const scenario = detectScenario(options.message);
  const responseText = MOCK_RESPONSES[scenario];
  const citations = MOCK_CITATIONS_BY_SCENARIO[scenario];
  const steps = buildMockSteps(responseText);
  const widget = extractMockWidget(responseText);

  // Emit steps with a small stagger to animate the reasoning chain UI
  for (const step of steps) {
    await new Promise<void>((r) => setTimeout(r, 18)); // ~108ms total for 6 steps
    options.onReasoningStep?.(step);
  }

  // Emit the full response text as a single chunk
  options.onChunk?.(responseText);

  const latency = Date.now() - t0;
  console.log(`[Mock Engine] Tier 3 — scenario="${scenario}" latency=${latency}ms (zero credentials)`);

  return {
    threadId: `mock-${scenario}-${Date.now()}`,
    runId: `mock-run-${Date.now()}`,
    response: responseText,
    citations,
    reasoningSteps: steps,
    widget,
    tier: 3,
  };
}

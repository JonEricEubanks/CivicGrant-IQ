# Fabric IQ — Grant Lifecycle Intelligence Layer

> **Third Microsoft IQ layer for CivicGrant IQ.** Foundry IQ grounds *analysis*; Work IQ
> grounds *city context*; **Fabric IQ grounds the post-award *admin lifecycle*** — the state
> of every grant in the portfolio, modeled as business entities, not tables.
>
> This satisfies the Agents League requirement (*integrate ≥1 Microsoft IQ layer*) — and
> CivicGrant IQ now integrates **all three**, with Fabric IQ powering the Grant Admin Hub.

---

## Why Fabric IQ here (the one-paragraph pitch)

The Grant Admin Hub tracks grants through their lifecycle — Submitted → Awarded → Active →
Closeout — with disbursements, milestones, and compliance deadlines. That is *exactly* the
"context on the state of your business" Fabric IQ exists to provide. We lift the app's
operational data into **OneLake**, declare a grant-lifecycle **ontology** (Customer-style
business concepts: `Grant`, `Disbursement`, `ComplianceItem`…), and expose **measures** via a
**Power BI semantic model** — so the same trusted definitions ground the dashboard, a Fabric
**operations agent** that watches for overdue compliance, and Copilot. One definition of
"Total Disbursed" or "Overdue Compliance," used everywhere.

---

## What's in this folder

```
fabric/
├── README.md                            ← you are here (load guide + rubric map)
├── data/                                ← OneLake Lakehouse tables (generated, do not hand-edit)
│   ├── dim_city.csv          dim_agency.csv     dim_program.csv     dim_grant.csv
│   ├── fact_disbursement.csv  fact_milestone.csv  fact_compliance.csv
│   └── fact_lifecycle_event.csv         ← the audit timeline that "shows the lifecycle"
├── ontology/
│   ├── grant-lifecycle-ontology.json    ← entity types, relationships, rules, agent actions
│   └── grant-lifecycle-ontology.md      ← human-readable spec
└── semantic-model/
    └── measures.md                      ← star schema + DAX KPIs + report pages
```

**Regenerate the data** any time the live portfolio changes — it reads `grantPortfolio.ts`,
the same source the running app uses, so Fabric never drifts from the app:

```sh
cd backend
npm run fabric:data        # → writes the 8 CSVs into fabric/data/
```

---

## What data goes into Fabric (and why these tables)

A **star schema** — the shape Fabric semantic models and ontologies expect — plus one event
table that is the heart of the "lifecycle / admin tracking" story.

| Table | Grain | Why it's in Fabric |
|---|---|---|
| `dim_city` | 1 row / city | The applicant entity; carries Moody's rating (eligibility driver) |
| `dim_agency` | 1 row / funder | Federal vs. state/regional grouping |
| `dim_program` | 1 row / program | CFDA #, focus area |
| `dim_grant` | 1 row / grant | **Carries `lifecycle_state` + `pct_disbursed`** — the spine |
| `fact_disbursement` | 1 row / drawdown | Money out, federal vs. city split |
| `fact_milestone` | 1 row / milestone | Schedule + progress + at-risk flags |
| `fact_compliance` | 1 row / obligation | Deadlines that drive the alert strip |
| **`fact_lifecycle_event`** | 1 row / state change | **The audit timeline** — every stage transition, milestone, payment, and filing, unioned into one chronological stream per grant |

`fact_lifecycle_event` is what you visualize to literally *show the lifecycle* (see the
"Lifecycle timeline" report page in [`semantic-model/measures.md`](semantic-model/measures.md)).

---

## Load it into Fabric — step by step

> Prereq: a Microsoft Fabric workspace with capacity (Trial capacity is fine). You already
> have the Azure footprint (`rg-skillsfest`); Fabric is a separate SaaS surface at
> <https://app.fabric.microsoft.com> — it does **not** need to live in that resource group.

### 1. Create the Lakehouse (OneLake)
1. In your Fabric workspace → **+ New → Lakehouse** → name it `civicgrant_lakehouse`.
2. In the Lakehouse, open the **Files** area → **Upload** → upload all 8 CSVs from `fabric/data/`.
3. For each CSV: right-click → **Load to Tables → New table**. Fabric infers the schema and
   writes a Delta table. (Or drop them in a `raw/` folder and load all at once with a notebook.)

### 2. Build the semantic model (business intelligence)
1. In the Lakehouse → **New semantic model** → select all 8 tables.
2. In **Model view**, draw the relationships from
   [`semantic-model/measures.md`](semantic-model/measures.md) (all many-to-one into `dim_grant`).
3. Add the DAX **measures** from that file (`Total Disbursed`, `Pct Disbursed`,
   `Compliance Overdue`, `Days To Next Deadline`, …).
4. Build the 4 report pages — the **Lifecycle timeline** page is your demo money-shot.

### 3. Create the ontology (operational intelligence — *preview*)
1. Fabric workspace → **+ New → Ontology (preview)**.
2. Easiest path: **Generate from semantic model** → pick the model from step 2. Fabric seeds
   entity types from your tables; then refine to match
   [`ontology/grant-lifecycle-ontology.json`](ontology/grant-lifecycle-ontology.json):
   - Confirm the 8 **entity types** and their keys.
   - Add the **relationships** (`hasDisbursement`, `hasMilestone`, `hasObligation`, `hasEvent`, `awardedBy`, `fundedUnder`).
   - Add the `lifecycle_state` enum on `Grant` and the **rules** (e.g. `DisbursementCannotExceedAward`).
   - Register the **actions** (`RequestDrawdown`, `FileSF425`, …) — these mirror the buttons
     already in `GrantAdminDashboard.tsx`.
3. Open the **Graph** view on the ontology to get the visual entity map for your demo video.

### 4. (Optional, high-impact) Operations agent
Add an **Operations agent (preview)** over the ontology with a monitoring rule like
*"alert when any `ComplianceItem.is_overdue` or a `Milestone` goes `at-risk`"* → recommend the
matching governed action. This is the live, agentic Fabric IQ moment for the demo.

---

## Wire it back into the app (make the integration *load-bearing*, not just docs)

Pick the depth that fits your remaining time before **June 14**:

- **Tier A — Badge + provenance (30 min).** Add a `Fabric IQ` badge to the Admin Hub header
  (mirroring the Foundry/Work IQ badges in `README.md`) and a one-liner: *"Lifecycle grounded
  in Fabric IQ ontology."* Cite `fabric/ontology/...` in the UI tooltip. Cheapest credible claim.
- **Tier B — Read the ontology in the backend (2–3 hrs).** Add `backend/src/fabricIq.ts` that
  loads `grant-lifecycle-ontology.json`, and have `routes/adminChat.ts` inject the ontology's
  entity/relationship vocabulary + governance rules into the admin agent's system prompt. Now
  the admin agent literally reasons in the ontology's business language. (Recommended — biggest
  judging payoff for least Azure risk; works in mock mode with zero Fabric credentials.)
- **Tier C — Live OneLake query (1+ day).** Have the backend query the Lakehouse/semantic model
  via the Fabric SQL analytics endpoint for portfolio stats instead of the static array. Most
  "real," but adds a live dependency — keep the static array as the Tier-3 fallback.

> **Recommendation:** do **Tier B now**, demo **Tier B + the Fabric report pages / Graph view +
> operations agent** in the video. That shows Fabric IQ as a genuine reasoning layer while
> keeping the never-fail 3-tier fallback the README already promises.

---

## How this maps to the judging rubric

| Criterion (weight) | What Fabric IQ adds |
|---|---|
| **Accuracy & Relevance (20%)** | Satisfies the "integrate a Microsoft IQ" requirement — now all 3 IQs, with Fabric IQ owning a distinct surface (post-award admin) |
| **Reasoning & Multi-step (20%)** | Ontology graph traversal (`Grant ▶ Milestone ▶ Disbursement`) + governance rules = defensible, governed reasoning, not prose |
| **Creativity & Originality (15%)** | Modeling the *grant lifecycle as a business ontology* is a novel, on-theme use of the newest IQ layer |
| **User Experience (15%)** | The Lifecycle-timeline report + ontology Graph view are strong, demoable visuals |
| **Reliability & Safety (20%)** | Ontology **rules** enforce data-quality invariants; static CSV + array stay as fallback so the demo never breaks |

---

## TL;DR

1. `cd backend && npm run fabric:data` → 8 CSVs appear in `fabric/data/`.
2. Upload to a Fabric Lakehouse, load to tables.
3. Build the semantic model (measures) → generate the ontology from it → refine to the JSON spec.
4. Do **Tier B** wiring so the admin agent reasons in the ontology's language.
5. Demo the Lifecycle-timeline report + ontology Graph + an operations agent watching compliance.

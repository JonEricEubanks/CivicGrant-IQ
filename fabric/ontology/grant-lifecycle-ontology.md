# Grant Lifecycle Ontology — Fabric IQ

> The shared business vocabulary that grounds CivicGrant IQ's admin agents in **Fabric IQ**.
> Machine-readable definition: [`grant-lifecycle-ontology.json`](grant-lifecycle-ontology.json).

Fabric IQ's job is to elevate raw data *up to the language of the business*. A grant
coordinator doesn't think in tables and joins — they think in **grants, drawdowns,
milestones, and compliance deadlines moving through a lifecycle**. This ontology declares
exactly those concepts once, so every agent, report, and dashboard interprets them the same way.

---

## The lifecycle (macro states)

Every grant moves through an ordered set of stages. The ordinal lets the ontology reason
about progression ("which grants are stuck in UnderReview?") and regression.

```
1 Identified → 2 Drafting → 3 Submitted → 4 UnderReview → 5 Awarded → 6 Active → 7 Closeout → 8 Closed
                                                   └────────────────────────→ 9 Declined
```

| State | Meaning | In our data |
|---|---|---|
| **Identified** | CivicGrant IQ matched the city to a NOFO | (pre-application) |
| **Drafting** | Application being written | (history on every grant) |
| **Submitted** | Application filed with the agency | RAISE, FEMA BRIC |
| **UnderReview** | Agency technical review | RAISE, FEMA BRIC |
| **Awarded** | Award notification received | Northwood SMC, EECBG, CMAQ, AFG |
| **Active** | Period of performance — drawdowns + compliance | Northwood SMC, EECBG Streetlights |
| **Closeout** | Final report, retention release, SF-425 | AFG SCBA (Fire Dept) |
| **Closed** | Fully reconciled and archived | CMAQ Lake-Cook Signals |
| **Declined** | Not selected | EPA Brownfields |

> 7 grants now span all post-application states — so the Fabric lifecycle timeline and
> ontology Graph show a complete arc (Submitted → Closed) plus the Declined branch, instead
> of only the in-flight grants.

---

## Entity types

| Entity | Bound table | Key | Role |
|---|---|---|---|
| **City** | `dim_city` | `city_id` | The applicant (Buffalo Grove, IL) |
| **Agency** | `dim_agency` | `agency_id` | Federal/state funder (FEMA, USDOT, SMC) |
| **Program** | `dim_program` | `program_id` | Specific program + CFDA (BRIC, RAISE, SIIP) |
| **Grant** | `dim_grant` | `grant_id` | The award/application — carries `lifecycle_state` |
| **Disbursement** | `fact_disbursement` | `disbursement_id` | A drawdown/reimbursement, federal vs. city split |
| **Milestone** | `fact_milestone` | `milestone_id` | A schedule milestone with progress + owner |
| **ComplianceItem** | `fact_compliance` | `compliance_id` | A reporting/audit/clearance obligation |
| **LifecycleEvent** | `fact_lifecycle_event` | `event_id` | One immutable entry in the audit timeline |

## Relationships (the graph)

```
City ──appliedFor──▶ Grant ──awardedBy──▶ Agency ◀──offeredBy── Program
                       │
        ┌──────────────┼───────────────┬───────────────┐
   hasDisbursement  hasMilestone   hasObligation     hasEvent
        ▼               ▼               ▼               ▼
  Disbursement      Milestone     ComplianceItem   LifecycleEvent
```

This is the **cross-domain reasoning** Fabric IQ enables. An agent can traverse
`Grant ▶ Milestone(in-progress) ▶ Disbursement(none pending)` to conclude *"this grant has
completed work that hasn't been reimbursed — initiate a drawdown,"* and cite every hop —
exactly the GraphRAG pattern CivicGrant IQ already uses, now governed by a shared ontology.

## Governance rules (data-quality + trust)

| Rule | Guarantees |
|---|---|
| `MatchCoverageInvariant` | `total_project = award + city_match` always holds |
| `DisbursementCannotExceedAward` | You can't draw down more than the award |
| `ActiveGrantMustHaveOpenCompliance` | Active grants are always being monitored |
| `NoOverdueComplianceBeforeCloseout` | Nothing closes with an open obligation |

## Agent actions (operational intelligence)

The ontology tells agents **what they can do and when** — each action has a `guard` so an
operations agent only offers it when the live data warrants it.

| Action | Fires when | Wires to existing code |
|---|---|---|
| `RequestDrawdown` | in-progress milestone + no pending disbursement | the "Reimbursement opportunity" insight in `GrantAdminDashboard.tsx` |
| `FileSF425` | SF-425 obligation due-soon/overdue | the **SF-425** button → `routes/generateReport.ts` |
| `FileQuarterlyReport` | quarterly obligation due-soon | the **Q2 Report** button → `routes/generateReport.ts` |
| `FlagAtRiskMilestone` | milestone past due or at-risk | the at-risk insight in `computeInsights()` |
| `AdvanceLifecycleState` | manual/agent transition | appends a `StageTransition` event |

> **Why this matters for judging:** the admin dashboard's proactive insights are currently
> computed client-side. The ontology re-expresses each one as a *governed, reusable action*
> grounded in Fabric IQ — so the same logic powers a Fabric **operations agent**, a Copilot
> Studio agent, and the app, all from one definition.

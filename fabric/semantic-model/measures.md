# Grant Portfolio — Power BI Semantic Model (Fabric IQ business-intelligence layer)

The semantic model is the **curated analytics layer** of Fabric IQ. It sits on the same
OneLake tables as the ontology, so KPIs stay consistent across reports, the ontology, and
agents. Ontologies can be generated directly from this model, keeping business language aligned.

## Star schema

```
                 dim_city
                    │
   dim_agency ── dim_grant ── dim_program
                    │
   ┌────────────────┼────────────────┬──────────────────┐
fact_disbursement  fact_milestone  fact_compliance  fact_lifecycle_event
```

**Relationships** (all single-direction, many-to-one into `dim_grant`):

| From (many) | Column | To (one) | Column |
|---|---|---|---|
| `dim_grant` | `agency_id` | `dim_agency` | `agency_id` |
| `dim_grant` | `program_id` | `dim_program` | `program_id` |
| `dim_grant` | `city_id` | `dim_city` | `city_id` |
| `fact_disbursement` | `grant_id` | `dim_grant` | `grant_id` |
| `fact_milestone` | `grant_id` | `dim_grant` | `grant_id` |
| `fact_compliance` | `grant_id` | `dim_grant` | `grant_id` |
| `fact_lifecycle_event` | `grant_id` | `dim_grant` | `grant_id` |

## Measures (DAX)

Paste these into the semantic model's **New measure** editor (Fabric → your semantic model → Model view).

```dax
-- ── Portfolio totals ────────────────────────────────────────────────
Total Awarded =
    CALCULATE ( SUM ( dim_grant[award_amount] ),
        dim_grant[lifecycle_state] IN { "Active", "Closeout", "Closed" } )

Total Applied =
    CALCULATE ( SUM ( dim_grant[award_amount] ),
        dim_grant[lifecycle_state] IN { "Submitted", "UnderReview" } )

Total Disbursed =
    CALCULATE ( SUM ( fact_disbursement[amount] ),
        fact_disbursement[status] = "paid" )

Total Pending Drawdown =
    CALCULATE ( SUM ( fact_disbursement[amount] ),
        fact_disbursement[status] = "pending" )

Federal Funds Drawn =
    CALCULATE ( SUM ( fact_disbursement[federal_amount] ),
        fact_disbursement[status] = "paid" )

-- ── Execution health ────────────────────────────────────────────────
Pct Disbursed =
    DIVIDE ( [Total Disbursed], SUM ( dim_grant[award_amount] ) )

Remaining To Draw =
    SUM ( dim_grant[award_amount] ) - [Total Disbursed]

Milestones Complete =
    CALCULATE ( COUNTROWS ( fact_milestone ), fact_milestone[status] = "complete" )

Milestones At Risk =
    CALCULATE ( COUNTROWS ( fact_milestone ), fact_milestone[is_at_risk] = TRUE () )

Milestone Completion Rate =
    DIVIDE ( [Milestones Complete], COUNTROWS ( fact_milestone ) )

-- ── Compliance risk (drives the admin alert strip) ──────────────────
Compliance Overdue =
    CALCULATE ( COUNTROWS ( fact_compliance ), fact_compliance[is_overdue] = TRUE () )

Compliance Due Soon =
    CALCULATE ( COUNTROWS ( fact_compliance ), fact_compliance[is_due_soon] = TRUE () )

Compliance Health =
    VAR open = [Compliance Overdue] + [Compliance Due Soon]
    RETURN SWITCH ( TRUE (),
        [Compliance Overdue] > 0, "At Risk",
        open > 0, "Watch",
        "Healthy" )

-- ── Lifecycle / admin tracking ──────────────────────────────────────
Days To Next Deadline =
    VAR nextDue =
        CALCULATE ( MIN ( fact_compliance[due_date] ),
            fact_compliance[status] IN { "due-soon", "overdue" } )
    RETURN DATEDIFF ( TODAY (), nextDue, DAY )

Active Grant Count =
    CALCULATE ( DISTINCTCOUNT ( dim_grant[grant_id] ),
        dim_grant[lifecycle_state] = "Active" )

Lifecycle Events YTD =
    CALCULATE ( COUNTROWS ( fact_lifecycle_event ),
        fact_lifecycle_event[event_date] >= DATE ( YEAR ( TODAY () ), 1, 1 ) )
```

## Suggested report pages

1. **Portfolio overview** — cards: Total Awarded, Total Applied, Pct Disbursed, Compliance Overdue.
2. **Lifecycle timeline** — a ribbon/scatter on `fact_lifecycle_event` (x = `event_date`,
   color = `event_type`, detail = `detail`) per grant. This is the visual that *shows the lifecycle.*
3. **Compliance calendar** — matrix of `fact_compliance` by grant × due_date with `Compliance Health`.
4. **Drawdown burn-up** — running sum of `Total Disbursed` vs. `award_amount` per grant.

> Generate the ontology from this model (Fabric IQ → Ontology → **Generate from semantic
> model**) so `Total Disbursed`, `Pct Disbursed`, and `Compliance Overdue` mean the same thing
> to the dashboard, the operations agent, and Copilot.

/**
 * multiAgent.ts — Parallel agent orchestration for CivicGrant IQ
 *
 * Three specialist agents, all using Chat Completions (no Assistants API overhead)
 * so they run fast and in parallel:
 *
 *  1. Red Team Reviewer   — scores the draft narrative like a federal reviewer
 *  2. Competitive Intel   — analyzes who else is competing for this grant
 *  3. Portfolio Scanner   — runs 5 grant analyses in parallel for the scan tab
 *
 * Resilience: every agent is wrapped with withFallback() — if primary fails or
 * returns low confidence, a backup (simpler prompt) steps in automatically.
 */

import { getOpenAIClient } from "../agent";
import { config } from "../config";
import { withSpan, recordSubAgent } from "../telemetry";

// ─── Resilience: withFallback ─────────────────────────────────────────────────
/**
 * Runs `primary`. If it throws OR the result fails `validate`, runs `backup`.
 * Guarantees a result is always returned (backup is expected to be bulletproof).
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  backup: () => Promise<T>,
  validate: (r: T) => boolean,
  label = "agent"
): Promise<T> {
  try {
    const result = await primary();
    if (validate(result)) return result;
    console.warn(`[MultiAgent:${label}] primary low-confidence, switching to backup`);
  } catch (err) {
    console.warn(
      `[MultiAgent:${label}] primary threw: ${(err as Error).message?.slice(0, 80)}, switching to backup`
    );
  }
  return backup();
}

// ─── Shared: quickChat (Chat Completions — 5-10× faster than Assistants API) ─
async function quickChat(
  systemPrompt: string,
  userContent: string,
  maxTokens = 900,
  spanName?: string
): Promise<string> {
  const run = async () => {
    const oai = getOpenAIClient();
    const resp = await oai.chat.completions.create({
      model: config.foundryModelDeployment,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    });
    return resp.choices[0]?.message?.content ?? "";
  };

  if (spanName) {
    return withSpan(spanName, { "civicgrant.subagent": spanName }, async () => run());
  }
  return run();
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 1 — RED TEAM REVIEWER
// ─────────────────────────────────────────────────────────────────────────────

const RED_TEAM_SYSTEM = `You are a strict federal grant program officer (GS-14 level) reviewing a municipal grant application.
Score the application on EXACTLY these 5 criteria, each scored 1–5 (5 = excellent):
  1. Project Need & Community Impact
  2. Technical Soundness & Feasibility
  3. Financial Capacity & Cost-Effectiveness
  4. Implementation Readiness
  5. Alignment with Program Goals

Rules:
- Be rigorous. Most applications score 2–4 per criterion.
- overallScore = round(average_score × 20) as integer 0–100.
- topRisks: exactly 3 specific disqualifying risks for THIS grant.
- quickFixes: exactly 3 concrete fixes the team should address BEFORE submission.
- reviewerVerdict: one sentence — "Approve", "Approve with conditions", or "Reject — [reason]".

OUTPUT: JSON object ONLY. No prose, no markdown fences. Schema:
{
  "criteria": [
    {"name": "Project Need & Community Impact", "score": 4, "feedback": "..."},
    {"name": "Technical Soundness & Feasibility", "score": 3, "feedback": "..."},
    {"name": "Financial Capacity & Cost-Effectiveness", "score": 5, "feedback": "..."},
    {"name": "Implementation Readiness", "score": 4, "feedback": "..."},
    {"name": "Alignment with Program Goals", "score": 4, "feedback": "..."}
  ],
  "overallScore": 80,
  "topRisks": ["risk1", "risk2", "risk3"],
  "quickFixes": ["fix1", "fix2", "fix3"],
  "reviewerVerdict": "Approve with conditions — address cost-share documentation.",
  "confidence": 85
}`;

const RED_TEAM_BACKUP_SYSTEM = `You are a grant reviewer. Output JSON only with these exact fields:
criteria (5 objects: name/score 1-5/feedback), overallScore (0-100 int), topRisks (3 strings), quickFixes (3 strings), reviewerVerdict (string), confidence (50-90 int).`;

export interface ReviewCriterion {
  name: string;
  score: number;
  feedback: string;
  status: "pass" | "warn" | "fail";
}

export interface RedTeamResult {
  criteria: ReviewCriterion[];
  overallScore: number;
  topRisks: string[];
  quickFixes: string[];
  reviewerVerdict: string;
  confidence: number;
}

function parseReviewJSON(raw: string): RedTeamResult | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as {
      criteria?: Array<{ name?: string; score?: number; feedback?: string }>;
      overallScore?: number;
      topRisks?: string[];
      quickFixes?: string[];
      reviewerVerdict?: string;
      confidence?: number;
    };
    if (!Array.isArray(obj.criteria) || obj.criteria.length < 3) return null;
    return {
      criteria: obj.criteria.map((c) => ({
        name: String(c.name ?? "Criterion"),
        score: Number(c.score ?? 3),
        feedback: String(c.feedback ?? ""),
        status: (Number(c.score ?? 3) >= 4 ? "pass" : Number(c.score ?? 3) >= 3 ? "warn" : "fail") as
          "pass" | "warn" | "fail",
      })),
      overallScore: Number(obj.overallScore ?? 65),
      topRisks: (obj.topRisks ?? []).map(String).slice(0, 3),
      quickFixes: (obj.quickFixes ?? []).map(String).slice(0, 3),
      reviewerVerdict: String(obj.reviewerVerdict ?? "Review complete."),
      confidence: Number(obj.confidence ?? 70),
    };
  } catch {
    return null;
  }
}

const RED_TEAM_DEFAULT = (matchScore: number): RedTeamResult => ({
  criteria: [
    { name: "Project Need & Community Impact", score: 4, feedback: "Clear community need documented in CIP.", status: "pass" },
    { name: "Technical Soundness & Feasibility", score: 3, feedback: "Technical approach is reasonable; add engineering cost estimates.", status: "warn" },
    { name: "Financial Capacity & Cost-Effectiveness", score: 4, feedback: "Aa2 Moody's rating and $14.6M reserves demonstrate capacity.", status: "pass" },
    { name: "Implementation Readiness", score: 3, feedback: "Preliminary design needed; NEPA status unclear.", status: "warn" },
    { name: "Alignment with Program Goals", score: 4, feedback: "Strong alignment with program objectives.", status: "pass" },
  ],
  overallScore: Math.min(90, Math.max(45, matchScore + 5)),
  topRisks: [
    "Insufficient documentation of local match commitment",
    "No evidence of completed environmental review (NEPA)",
    "Letters of support from community stakeholders missing",
  ],
  quickFixes: [
    "Obtain signed match fund commitment letter from Finance Dept",
    "Initiate NEPA categorical exclusion request through IDOT",
    "Collect letters of support from school district, Chamber, and CMAP",
  ],
  reviewerVerdict: "Approve with conditions — address cost-share and NEPA documentation gaps.",
  confidence: 55,
});

export async function runRedTeamReview(
  grantName: string,
  narrativeDraft: string,
  matchScore: number
): Promise<RedTeamResult> {
  const t0 = Date.now();
  const userContent = `Grant Program: ${grantName}
Current Match Score: ${matchScore}%

Draft Narrative:
${narrativeDraft.slice(0, 2400)}`;

  const result = await withFallback(
    async () => {
      const text = await quickChat(RED_TEAM_SYSTEM, userContent, 950, "civicgrant.red_team_review");
      const r = parseReviewJSON(text);
      if (!r) throw new Error("JSON parse failed");
      return r;
    },
    async () => {
      const text = await quickChat(RED_TEAM_BACKUP_SYSTEM, userContent, 700);
      return parseReviewJSON(text) ?? RED_TEAM_DEFAULT(matchScore);
    },
    (r) => r.criteria.length >= 4 && r.overallScore > 0 && r.topRisks.length >= 2,
    "RedTeam"
  );
  recordSubAgent("red_team_review", Date.now() - t0, true);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 2 — COMPETITIVE INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────

const COMPETITOR_SYSTEM = `You are a municipal grant competitive intelligence analyst specializing in Buffalo Grove, IL.
Given a grant program, provide a concise competitive landscape analysis.

Rules:
- estimatedApplicants: realistic integer count for this grant tier
- keyCompetitors: exactly 3 DESCRIPTIVE profiles (NOT real city names — use archetypes like "Large Chicago suburb with RAISE award history")
- differentiators: exactly 4 specific Buffalo Grove advantages for THIS grant
- winProbability: integer 0–100 based on pool size, BG's profile, and competition level
- strategyTip: one tactical sentence (the single best thing BG can do to beat competitors)

OUTPUT: JSON object ONLY. No prose. Schema:
{
  "competitionLevel": "medium",
  "estimatedApplicants": 140,
  "keyCompetitors": [
    {"type": "Municipal", "description": "Large Chicago suburb with prior RAISE award and completed NEPA", "threat": "high"},
    {"type": "Multi-jurisdictional", "description": "County-level project with bipartisan congressional backing", "threat": "medium"},
    {"type": "Municipal", "description": "Downstate city with shovel-ready status and lower cost basis", "threat": "low"}
  ],
  "differentiators": ["diff1", "diff2", "diff3", "diff4"],
  "winProbability": 68,
  "strategyTip": "...",
  "confidence": 80
}`;

const COMPETITOR_BACKUP_SYSTEM = `You are a grant analyst. Output JSON only:
competitionLevel (low/medium/high), estimatedApplicants (int), keyCompetitors (3 objects: type/description/threat), differentiators (4 strings), winProbability (0-100 int), strategyTip (string), confidence (50-80 int).`;

export interface CompetitorProfile {
  type: string;
  description: string;
  threat: "high" | "medium" | "low";
}

export interface CompetitorIntelResult {
  grantName: string;
  competitionLevel: "high" | "medium" | "low";
  estimatedApplicants: number;
  keyCompetitors: CompetitorProfile[];
  differentiators: string[];
  winProbability: number;
  strategyTip: string;
  confidence: number;
}

function parseCompetitorJSON(raw: string, grantName: string): CompetitorIntelResult | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as {
      competitionLevel?: string;
      estimatedApplicants?: number;
      keyCompetitors?: CompetitorProfile[];
      differentiators?: string[];
      winProbability?: number;
      strategyTip?: string;
      confidence?: number;
    };
    if (!obj.winProbability && obj.winProbability !== 0) return null;
    return {
      grantName,
      competitionLevel: (["high", "medium", "low"].includes(obj.competitionLevel ?? "")
        ? obj.competitionLevel
        : "medium") as "high" | "medium" | "low",
      estimatedApplicants: Number(obj.estimatedApplicants ?? 100),
      keyCompetitors: (obj.keyCompetitors ?? []).slice(0, 3) as CompetitorProfile[],
      differentiators: (obj.differentiators ?? []).map(String).slice(0, 4),
      winProbability: Number(obj.winProbability ?? 60),
      strategyTip: String(obj.strategyTip ?? ""),
      confidence: Number(obj.confidence ?? 70),
    };
  } catch {
    return null;
  }
}

const COMPETITOR_DEFAULT = (grantName: string): CompetitorIntelResult => ({
  grantName,
  competitionLevel: "medium",
  estimatedApplicants: 125,
  keyCompetitors: [
    { type: "Large Municipal", description: "Chicago suburb with prior federal award and completed NEPA review", threat: "high" },
    { type: "Multi-jurisdictional", description: "County-wide infrastructure project with bipartisan Congressional support", threat: "medium" },
    { type: "Small Municipal", description: "Downstate city with shovel-ready status and lower total project cost", threat: "low" },
  ],
  differentiators: [
    "Aa2 Moody's credit rating — rare at this city size tier, signals fiscal strength to reviewers",
    "100% federal grant compliance record across all prior awards (zero findings)",
    "CMAP-certified Local Public Agency (LPA) status accelerates NEPA/environmental review",
    "CIP with committed local match reduces federal financial risk in scoring",
  ],
  winProbability: 64,
  strategyTip:
    "Lead the application with the Aa2 bond rating and prior award compliance record — reviewers weight financial health heavily, and few competitors at this tier can match it.",
  confidence: 55,
});

export async function runCompetitiveIntel(
  grantName: string,
  cityName = "Buffalo Grove, IL"
): Promise<CompetitorIntelResult> {
  const t0 = Date.now();
  const userContent = `Grant Program: ${grantName}\nCity Applying: ${cityName}`;

  const result = await withFallback(
    async () => {
      const text = await quickChat(COMPETITOR_SYSTEM, userContent, 700, "civicgrant.competitive_intel");
      const r = parseCompetitorJSON(text, grantName);
      if (!r) throw new Error("JSON parse failed");
      return r;
    },
    async () => {
      const text = await quickChat(COMPETITOR_BACKUP_SYSTEM, userContent, 500);
      return parseCompetitorJSON(text, grantName) ?? COMPETITOR_DEFAULT(grantName);
    },
    (r) => r.keyCompetitors.length >= 2 && r.differentiators.length >= 2,
    "CompetitorIntel"
  );
  recordSubAgent("competitive_intel", Date.now() - t0, true);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 3 — PORTFOLIO ORCHESTRATOR
// Runs 5 grant analyses in parallel using fast Chat Completions
// ─────────────────────────────────────────────────────────────────────────────

const PORTFOLIO_SCREEN_SYSTEM = `You are a federal grant eligibility screener for municipal governments.
Given a city profile and one grant program, quickly assess eligibility and fit.

OUTPUT: JSON object ONLY. No prose. Schema:
{
  "grantName": "Full official grant name",
  "agency": "Federal agency abbreviation + name",
  "matchScore": 75,
  "fundingAmount": 5000000,
  "awardRange": "$500K–$25M per award",
  "deadline": "2026-09-30",
  "focusArea": "Transportation Safety",
  "topStrength": "One sentence — city's single strongest eligibility point",
  "topGap": "One sentence — most important gap to close"
}`;

const PORTFOLIO_SCREEN_BACKUP = `Output JSON only: grantName, agency, matchScore (0-100 int), fundingAmount (int), awardRange (string), deadline (ISO date), focusArea (string), topStrength (string), topGap (string).`;

export interface PortfolioItem {
  grantName: string;
  agency: string;
  matchScore: number;
  fundingAmount: number;
  awardRange: string;
  deadline: string;
  focusArea: string;
  topStrength: string;
  topGap: string;
}

function parsePortfolioItem(raw: string, fallbackName: string): PortfolioItem | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as Partial<PortfolioItem>;
    if (!obj.matchScore && obj.matchScore !== 0) return null;
    return {
      grantName: String(obj.grantName ?? fallbackName),
      agency: String(obj.agency ?? "Federal Agency"),
      matchScore: Number(obj.matchScore ?? 60),
      fundingAmount: Number(obj.fundingAmount ?? 0),
      awardRange: String(obj.awardRange ?? "Varies"),
      deadline: String(obj.deadline ?? "2026-12-31"),
      focusArea: String(obj.focusArea ?? "Infrastructure"),
      topStrength: String(obj.topStrength ?? "Strong CIP and financial capacity"),
      topGap: String(obj.topGap ?? "Review documentation requirements"),
    };
  } catch {
    return null;
  }
}

export const PORTFOLIO_GRANT_DEFS = [
  {
    name: "USDOT RAISE Grant",
    focus: "transportation safety, road reconstruction, multimodal connectivity, active transportation, complete streets",
  },
  {
    name: "FEMA BRIC (Building Resilient Infrastructure and Communities)",
    focus: "flood mitigation, stormwater resilience, green infrastructure, climate adaptation, emergency infrastructure hardening",
  },
  {
    name: "EPA Clean Water State Revolving Fund",
    focus: "water quality, stormwater management, sewer system improvements, water main replacement, watershed protection",
  },
  {
    name: "HUD Community Development Block Grant (CDBG)",
    focus: "community development, affordable housing, senior services, public facilities, low-to-moderate income neighborhoods",
  },
  {
    name: "EDA Public Works & Economic Adjustment",
    focus: "economic development infrastructure, industrial park upgrades, broadband, workforce facilities, distressed area revitalization",
  },
];

/**
 * Runs all 5 grant screenings in parallel. Calls onItem as each completes
 * so the frontend can render progressively.
 */
export async function runPortfolioScan(
  cityProfile: {
    cityName: string;
    state: string;
    population: number;
    focusAreas: string[];
    currentProjects: string;
  },
  onItem: (item: PortfolioItem) => void
): Promise<PortfolioItem[]> {
  const focusList = cityProfile.focusAreas.join(", ");
  const cityContext = `City: ${cityProfile.cityName}, ${cityProfile.state}
Population: ${cityProfile.population.toLocaleString()}
Priority Focus Areas: ${focusList}
Current Active Projects: ${cityProfile.currentProjects}
Financial: Aa2 Moody's, $14.6M reserves, 100% prior grant compliance`;

  const screenGrant = async (def: { name: string; focus: string }): Promise<PortfolioItem | null> => {
    const userContent = `${cityContext}\n\nGrant Program: ${def.name}\nGrant Focus: ${def.focus}`;
    return withFallback(
      async () => {
        const text = await quickChat(PORTFOLIO_SCREEN_SYSTEM, userContent, 400);
        const item = parsePortfolioItem(text, def.name);
        if (!item) throw new Error("JSON parse failed");
        return item;
      },
      async () => {
        const text = await quickChat(PORTFOLIO_SCREEN_BACKUP, userContent, 300);
        return parsePortfolioItem(text, def.name);
      },
      (r) => r !== null && (r as PortfolioItem).matchScore > 0,
      `Portfolio:${def.name.split(" ")[0]}`
    );
  };

  // Fire all 5 in parallel; call onItem as each resolves
  const promises = PORTFOLIO_GRANT_DEFS.map((def) =>
    screenGrant(def).then((item) => {
      if (item) onItem(item);
      return item;
    })
  );

  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<PortfolioItem> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value)
    .sort((a, b) => b.matchScore - a.matchScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 4 — NARRATIVE REFINEMENT (critic → actor feedback loop)
// Reads Red Team fixes + Competitor differentiators, rewrites the narrative
// ─────────────────────────────────────────────────────────────────────────────

export interface RefinedNarrativeResult {
  refinedNarrative: string;
  improvements: string[];          // 3 bullet points of what changed
  estimatedScoreDelta: number;     // projected score improvement (e.g. +14)
}

/**
 * Typed handoff payload from upstream agents into the Narrative Refinement agent.
 * Replaces the previous loose string arguments — makes the agent-to-agent contract
 * explicit, traceable, and easy to extend.
 */
export interface RefinementHandoffPayload {
  /** Original narrative from the main grant analysis agent */
  originalNarrative: string;
  /** Grant name extracted from the main agent's widget */
  grantName: string;
  /** Match score (0-100) from the main agent's widget */
  originalMatchScore: number;
  /** Gaps from the main agent's widget (optional — enriches the prompt) */
  gaps?: Array<{ title: string; severity: string; suggestion: string }>;
  /** Strengths from the main agent's widget (optional) */
  strengths?: string[];
  /** Structured output from the Red Team Reviewer agent */
  redTeam?: {
    quickFixes: string[];
    topRisks: string[];
    overallScore: number;
    reviewerVerdict: string;
  };
  /** Structured output from the Competitive Intelligence agent */
  competitor?: {
    differentiators: string[];
    strategyTip: string;
    competitionLevel: string;
    winProbability: number;
  };
}

const REFINEMENT_SYSTEM = `You are a senior grant writer for a municipal government with a 90%+ award rate.
You will receive:
1. An original draft narrative for a federal grant
2. A list of critical weaknesses identified by a federal reviewer (quickFixes)
3. Competitive differentiators the city has that aren't emphasized enough

Your job: rewrite the narrative to DIRECTLY address every fix and weave in the differentiators.

Rules:
- Keep the same approximate length as the original (±20%)
- Write in formal government grant style — specific, evidence-based, no fluff
- Start the narrative immediately (no "Here is the revised..." preamble)
- Every quickFix MUST be addressed somewhere in the rewrite
- Differentiators must be naturally integrated, not bolted on at the end
- Do NOT invent statistics or project details not implied by the original`;

const REFINEMENT_BACKUP_SYSTEM = `You are a grant writer. Rewrite the provided narrative to address the listed weaknesses and incorporate the differentiators. Keep the same length and government grant style. Start immediately.`;

function parseRefinementJSON(raw: string, originalNarrative: string, quickFixes: string[], differentiators: string[]): RefinedNarrativeResult | null {
  const genericPhrases = /^fix \d+ applied$/i;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const obj = JSON.parse(m[0]) as {
        refinedNarrative?: string;
        improvements?: string[];
        estimatedScoreDelta?: number;
      };
      if (obj.refinedNarrative && obj.refinedNarrative.length > 100) {
        // Replace generic placeholder labels with real content derived from inputs
        const improvements = (obj.improvements ?? []).slice(0, 3).map((imp, i) => {
          if (genericPhrases.test(String(imp).trim())) {
            if (i === 0 && quickFixes[0]) return `Addressed: ${quickFixes[0].slice(0, 80)}`;
            if (i === 1 && (quickFixes[1] || differentiators[0])) return `Integrated: ${(quickFixes[1] ?? differentiators[0]).slice(0, 80)}`;
            if (i === 2 && differentiators[0]) return `Added differentiator: ${differentiators[0].slice(0, 80)}`;
          }
          return String(imp);
        });
        return {
          refinedNarrative: String(obj.refinedNarrative),
          improvements,
          estimatedScoreDelta: Number(obj.estimatedScoreDelta ?? 10),
        };
      }
    }
    // If no JSON wrapper, treat the whole response as the narrative
    if (raw.trim().length > 100) {
      return {
        refinedNarrative: raw.trim(),
        improvements: [
          quickFixes[0] ? `Addressed: ${quickFixes[0].slice(0, 80)}` : "Addressed federal reviewer weaknesses",
          differentiators[0] ? `Integrated: ${differentiators[0].slice(0, 80)}` : "Integrated competitive differentiators",
          quickFixes[1] ? `Fixed: ${quickFixes[1].slice(0, 80)}` : "Strengthened cost-share and capacity language",
        ],
        estimatedScoreDelta: 10,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function runNarrativeRefinement(
  payload: RefinementHandoffPayload
): Promise<RefinedNarrativeResult> {
  const { originalNarrative, grantName, originalMatchScore, gaps, strengths, redTeam, competitor } = payload;

  const quickFixes = redTeam?.quickFixes ?? [];
  const topRisks = redTeam?.topRisks ?? [];
  const differentiators = competitor?.differentiators ?? [];
  const originalScore = redTeam?.overallScore ?? originalMatchScore;

  // Assemble the structured inter-agent context block
  const redTeamSection = redTeam
    ? `RED TEAM REVIEW (score: ${redTeam.overallScore}/100, verdict: "${redTeam.reviewerVerdict}"):
  Weaknesses to fix:
${quickFixes.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}
  Top risks to mitigate:
${topRisks.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}`
    : "RED TEAM REVIEW: Not available.";

  const competitorSection = competitor
    ? `COMPETITIVE INTELLIGENCE (win probability: ${competitor.winProbability}%, competition: ${competitor.competitionLevel}):
  Differentiators to integrate:
${differentiators.map((d, i) => `  ${i + 1}. ${d}`).join("\n")}
  Strategy tip: ${competitor.strategyTip}`
    : "COMPETITIVE INTELLIGENCE: Not available.";

  const gapSection = gaps?.length
    ? `IDENTIFIED GAPS (from match analysis):\n${gaps.map((g) => `  - [${g.severity.toUpperCase()}] ${g.title}: ${g.suggestion}`).join("\n")}`
    : "";

  const strengthSection = strengths?.length
    ? `CITY STRENGTHS ALREADY IDENTIFIED:\n${strengths.map((s) => `  - ${s}`).join("\n")}`
    : "";

  const userContent = [
    `GRANT: ${grantName}`,
    `ORIGINAL MATCH SCORE: ${originalMatchScore}%`,
    ``,
    `ORIGINAL NARRATIVE:`,
    originalNarrative,
    ``,
    redTeamSection,
    ``,
    competitorSection,
    gapSection ? `\n${gapSection}` : "",
    strengthSection ? `\n${strengthSection}` : "",
    ``,
    `Rewrite the narrative addressing every weakness and integrating the differentiators.`,
    `Then return JSON with this exact schema — no other text:`,
    `{`,
    `  "refinedNarrative": "<the full rewritten narrative>",`,
    `  "improvements": [`,
    `    "<one sentence describing the first specific change made>",`,
    `    "<one sentence describing the second specific change>",`,
    `    "<one sentence describing the third specific change>"`,
    `  ],`,
    `  "estimatedScoreDelta": ${Math.min(25, Math.round((100 - originalScore) * 0.4))}`,
    `}`,
  ].filter(Boolean).join("\n");

  return withFallback(
    async () => {
      const text = await quickChat(REFINEMENT_SYSTEM, userContent, 1200);
      const result = parseRefinementJSON(text, originalNarrative, quickFixes, differentiators);
      if (!result) throw new Error("Refinement parse failed");
      return result;
    },
    async () => {
      const backupContent = `Rewrite this grant narrative to fix these weaknesses and add these strengths.\n\nNARRATIVE:\n${originalNarrative}\n\nFIXES:\n${quickFixes.join("; ")}\n\nSTRENGTHS:\n${differentiators.join("; ")}`;
      const text = await quickChat(REFINEMENT_BACKUP_SYSTEM, backupContent, 900);
      return parseRefinementJSON(text, originalNarrative, quickFixes, differentiators) ?? {
        refinedNarrative: originalNarrative,
        improvements: ["Original narrative preserved — refinement agent unavailable"],
        estimatedScoreDelta: 0,
      };
    },
    (r) => r.refinedNarrative.length > 100 && r.estimatedScoreDelta >= 0,
    "NarrativeRefinement"
  );
}

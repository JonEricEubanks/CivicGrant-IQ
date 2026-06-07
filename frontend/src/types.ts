export interface ReasoningStep {
  step: number;
  label: string;
  content: string;
  completed: boolean;
}

export interface Citation {
  id: string;
  title: string;
  url?: string;
  excerpt: string;
  source: "municipal_docs" | "web" | "foundry_iq";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  threadId?: string;
  citations?: Citation[];
  reasoningSteps?: ReasoningStep[];
  timestamp: Date;
}

export interface CityProfile {
  cityName: string;
  state: string;
  population: number;
  focusAreas: string[];
  currentProjects: string;
}

export interface ScanResult {
  threadId: string;
  content: string;
  citations: Citation[];
  reasoningSteps: ReasoningStep[];
}

// ─── Red Team Reviewer ────────────────────────────────────────────────────────
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

// ─── Competitive Intelligence ────────────────────────────────────────────────
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

// ─── Narrative Refinement (feedback loop) ───────────────────────────────────
export interface RefinedNarrativeResult {
  refinedNarrative: string;
  improvements: string[];       // what the agent changed
  estimatedScoreDelta: number;  // projected score gain
}

// ─── Portfolio Orchestrator ──────────────────────────────────────────────────
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

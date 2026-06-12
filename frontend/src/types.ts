export interface ScanActivity {
  type: "orchestrator" | "foundry_iq" | "work_iq" | "agent" | "grants_gov";
  label: string;
  detail?: string;
}

export interface ReasoningStep {
  step: number;
  label: string;
  content: string;
  completed: boolean;
}

export interface GraphHop {
  fromLabel: string;
  rel: string;
  toLabel: string;
  evidence: string;
  source: string;
  weight: number;
}

export interface GraphPath {
  grantId: string;
  grantLabel: string;
  hops: GraphHop[];
  totalScore: number;
  confidence: "CONFIRMED" | "LIKELY" | "POSSIBLE";
  narrative: string;
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

export interface CityContextProject {
  name: string;
  budget?: string;
  status?: string;
}

export interface WorkIqCityContext {
  source: "sharepoint" | "local-kb";
  pulledAt: string;
  siteUrl?: string;
  libraryName?: string;
  filesRead: string[];
  priorityThemes: string[];
  activeProjects: CityContextProject[];
  fundingTypes: string[];
  riskSignals: string[];
  matchableGrants: string[];
  narrative: string;
  /** Upcoming grant-related calendar events from M365 (Calendars.Read) */
  calendarEvents?: string[];
  /** Recent Teams channel messages related to grants (ChannelMessage.Read.All) */
  teamsInsights?: string[];
  /** Recent grant-related emails from the user mailbox (Mail.Read) */
  mailSignals?: string[];
  error?: string;
}

// ─── Dynamic Orchestration Router ─────────────────────────────────────────────
export interface OrchestrationDecision {
  id: string;
  kind: "route" | "requery";
  label: string;
  detail: string;
  signal: { matchScore: number; grounding: number; threshold: number };
  branch?: string;
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
  /** True when the Red Team agent was unreachable — UI renders an honest "unavailable" state */
  unavailable?: boolean;
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
  /** True when the Competitive Intel agent was unreachable — UI renders an honest "unavailable" state */
  unavailable?: boolean;
}

// ─── Narrative Refinement (feedback loop) ───────────────────────────────────
export interface RefinedNarrativeResult {
  refinedNarrative: string;
  improvements: string[];       // what the agent changed
  estimatedScoreDelta: number;  // projected score gain
}

// ─── A2A Agent Handoff Trace ─────────────────────────────────────────────────
export interface AgentHandoff {
  from: string;
  to: string;
  timestampMs: number;
  payload: {
    grantName?: string;
    matchScore?: number;
    originalMatchScore?: number;
    redTeamScore?: number;
    redTeamVerdict?: string;
    quickFixes?: string[];
    topRisks?: string[];
    competitionLevel?: string;
    winProbability?: number;
    differentiators?: string[];
    strategyTip?: string;
    gapCount?: number;
    narrativeLength?: number;
    trigger?: string;
  };
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
  /** Present when the scan agent sourced this from the live grants.gov API */
  grantsGovUrl?: string;
  /** True when fundingAmount is real published program funding, not an AI estimate */
  fundingVerified?: boolean;
}

/** Raw grant opportunity from the /api/grants-live proxy */
export interface LiveGrant {
  id: string;
  opportunityNumber: string;
  title: string;
  agency: string;
  agencyCode: string;
  openDate: string;
  closeDate: string;
  status: string;
  cfda: string[];
  grantsGovUrl: string;
}

export interface LiveGrantsResponse {
  totalHits: number;
  returned: number;
  keyword: string;
  source: string;
  grants: LiveGrant[];
}

// ─── Grant Administration ────────────────────────────────────────────────────
export interface AdminDisbursement {
  id: string;
  label: string;
  phase: string;
  amount: number;
  status: "paid" | "pending" | "planned";
  date: string;
  invoiceNumber?: string;
  vendor?: string;
  description?: string;
  federalSharePct?: number;
  checkNumber?: string;
  notes?: string;
}

export interface AdminMilestone {
  id: string;
  title: string;
  dueDate: string;
  completedDate?: string;
  status: "complete" | "in-progress" | "upcoming" | "at-risk";
  progress?: number;
  owner: string;
}

export interface AdminComplianceItem {
  id: string;
  title: string;
  type: "report" | "audit" | "clearance" | "monitoring";
  dueDate?: string;
  lastCompletedDate?: string;
  status: "current" | "due-soon" | "overdue" | "complete";
  frequency?: string;
  notes?: string;
}

export interface AdminGrant {
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
  closeoutDate?: string;
  closedDate?: string;
  declinedDate?: string;
  projectManager: string;
  grantCoordinator: string;
  cfda: string;
  primaryFocus: string;
  disbursements: AdminDisbursement[];
  milestones: AdminMilestone[];
  compliance: AdminComplianceItem[];
  summary: string;
  keyRisk?: string;
}

export interface AdminPortfolioStats {
  totalAwarded: number;
  totalApplied: number;
  totalDisbursed: number;
  overdueTasks: number;
  dueSoonTasks: number;
}

export interface AdminWidgetData {
  grantId: string;
  grantName: string;
  pctDisbursed: number;
  activeMilestone: string;
  nextDeadline: { label: string; date: string; urgency: "critical" | "warning" | "normal" };
  complianceAlerts: string[];
  disbursedAmount: number;
  remainingAmount: number;
}

export interface AdminChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  widget?: AdminWidgetData;
}


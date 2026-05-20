// Types for GCC Milestone Agent

export interface VerificationRequest {
  repo: string;
  milestone: string;
  since?: string;
  profile?: string;
  providers?: string;
  output_dir?: string;
}

export interface VerificationResult {
  success: boolean;
  summary: string;
  report_path?: string;
  json_path?: string;
  html_path?: string;
  error?: string;
}

export interface ReportSummary {
  id: string;
  repo: string;
  milestone: string;
  score: number;
  status: "met" | "partially_met" | "not_met";
  date: string;
  report_path: string;
  json_path?: string;
}

export interface EvidenceCounts {
  commits: number;
  pulls: number;
  issues: number;
  releases: number;
}

export interface SemanticVerdict {
  verdict: "met" | "partially_met" | "not_met";
  confidence: number;
  rationale: string;
  semanticCoverage: number;
  keywordCoverage: number;
  sourceDiversity: number;
}

export interface RuleResult {
  matched: boolean;
  hitCount: number;
  sampleLinks: { url: string; matchedKeywords: string[] }[];
  explainability: {
    url: string;
    source: string;
    matchedKeywords: string[];
    snippet: string;
  }[];
  semantic: SemanticVerdict;
}

export interface Rule {
  id: string;
  text: string;
  source?: string;
  keywords: string[];
  result: RuleResult;
}

export interface ProviderBonusBreakdown {
  ci: number;
  community: number;
  npm: number;
  url: number;
}

export interface Report {
  generatedAt: string;
  repo: string;
  milestone: string;
  profile?: string;
  providers: string[];
  since?: string;
  status: "met" | "partially_met" | "not_met";
  score: number;
  activityScore: number;
  baseScore: number;
  providerBonus: number;
  providerBonusBreakdown: ProviderBonusBreakdown;
  semanticMode: string;
  semanticWarnings: string[];
  rulePassRate: number;
  ruleStats: { passed: number; total: number };
  evidenceCounts: EvidenceCounts;
  evidenceLinks: {
    commits: string[];
    pulls: string[];
    issues: string[];
    releases: string[];
  };
  rules: Rule[];
  providerErrors: { provider: string; message: string }[];
  providerMeta: Record<string, unknown>;
}

export interface AppConfig {
  reports_dir: string;
  github_token?: string;
}

export interface Project {
  id?: number;
  repo: string;
  name: string;
  description: string;
  config_yaml: string;
  created_at: string;
}

export interface MilestonePhase {
  id?: number;
  project_id: number;
  phase_id: string;
  title: string;
  depends_on: string; // JSON string of phase_ids
  rules_profile?: string;
  created_at: string;
}

export interface ProjectWithPhases {
  project: Project;
  phases: MilestonePhase[];
}

export interface VerificationRun {
  id?: number;
  project_id: number;
  phase_id?: string;
  status: "met" | "partially_met" | "not_met" | "failed";
  score: number;
  rule_pass_rate: number;
  commits_count: number;
  pulls_count: number;
  issues_count: number;
  releases_count: number;
  stars?: number;
  forks?: number;
  contributors?: number;
  json_path: string;
  html_path: string;
  markdown_path: string;
  error_message?: string;
  generated_at: string;
}

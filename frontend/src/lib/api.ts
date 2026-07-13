import { invoke } from "@tauri-apps/api/core";
import type {
  VerificationRequest,
  VerificationResult,
  ReportSummary,
  Report,
  AppConfig,
  Project,
  MilestonePhase,
  ProjectWithPhases,
  VerificationRun,
  ProfileSummary,
  ProfileRule,
} from "./types";

/**
 * Run a milestone verification
 */
export async function runVerification(
  request: VerificationRequest
): Promise<VerificationResult> {
  return invoke<VerificationResult>("run_verification", { request });
}

/**
 * List all saved reports
 */
export async function listReports(): Promise<ReportSummary[]> {
  return invoke<ReportSummary[]>("list_reports");
}

/**
 * Read a markdown report file
 */
export async function readReport(reportPath: string): Promise<string> {
  return invoke<string>("read_report", { reportPath });
}

/**
 * Read a JSON report file
 */
export async function readReportJson(jsonPath: string): Promise<Report> {
  return invoke<Report>("read_report_json", { jsonPath });
}

/**
 * Delete a report (markdown, json, html)
 */
export async function deleteReport(
  reportPath: string,
  jsonPath?: string,
  htmlPath?: string
): Promise<void> {
  return invoke<void>("delete_report", { reportPath, jsonPath, htmlPath });
}

/**
 * Export a report as PDF
 */
export async function exportPdfReport(
  reportId: string,
  destPath: string
): Promise<void> {
  return invoke<void>("export_pdf_report", { reportId, destPath });
}

/**
 * Get application config
 */
export async function getAppConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_app_config");
}

/**
 * Save application config
 */
export async function saveAppConfig(config: AppConfig): Promise<void> {
  return invoke<void>("save_app_config", { config });
}

/**
 * Create a new project with phases
 */
export async function createProject(
  project: Omit<Project, "id" | "created_at">,
  phases: Omit<MilestonePhase, "id" | "project_id" | "created_at">[]
): Promise<number> {
  return invoke<number>("create_project", { project, phases });
}

/**
 * List all projects with their phases
 */
export async function listProjects(): Promise<ProjectWithPhases[]> {
  return invoke<ProjectWithPhases[]>("list_projects");
}

/**
 * Delete a project by ID
 */
export async function deleteProject(id: number): Promise<void> {
  return invoke<void>("delete_project", { id });
}

/**
 * Save a verification run result
 */
export async function saveRunResult(
  projectId: number,
  phaseId: string | null,
  jsonPath: string,
  htmlPath: string,
  markdownPath: string
): Promise<number> {
  return invoke<number>("save_run_result", {
    projectId,
    phaseId,
    jsonPath,
    htmlPath,
    markdownPath,
  });
}

/**
 * Get verification runs for a project
 */
export async function getProjectRuns(projectId: number): Promise<VerificationRun[]> {
  return invoke<VerificationRun[]>("get_project_runs", { projectId });
}

/**
 * Backup SQLite database to a custom destination file path
 */
export async function backupDatabase(destPath: string): Promise<void> {
  return invoke<void>("backup_database", { destPath });
}

/**
 * Restore SQLite database from a backup file path
 */
export async function restoreDatabase(srcPath: string): Promise<void> {
  return invoke<void>("restore_database", { srcPath });
}

/**
 * List all rules profiles (both builtin and custom)
 */
export async function listProfiles(): Promise<ProfileSummary[]> {
  return invoke<ProfileSummary[]>("list_profiles");
}

/**
 * Save a rules profile as a custom YAML file
 */
export async function saveProfile(name: string, rules: ProfileRule[]): Promise<string> {
  return invoke<string>("save_profile", { name, rules });
}

/**
 * Delete a custom rules profile
 */
export async function deleteProfile(name: string): Promise<void> {
  return invoke<void>("delete_profile", { name });
}

/**
 * Convert a list of rules to YAML string using Rust
 */
export async function rulesToYaml(rules: ProfileRule[]): Promise<string> {
  return invoke<string>("rules_to_yaml", { rules });
}

/**
 * Convert a YAML string to a list of rules using Rust
 */
export async function yamlToRules(yaml: string): Promise<ProfileRule[]> {
  return invoke<ProfileRule[]>("yaml_to_rules", { yaml });
}

/*
__ai_context__
本模块负责前端 React 对接 Rust Tauri 后端的全量 IPC 接口包装，包括项目管理、历史运行、校验触发和新增的规则集管理功能。
*/

// [For Future AI]
// 1. Key assumptions made:
//    - listProfiles, saveProfile, and deleteProfile map directly to commands of the same snake_case names in Rust.
// 2. Potential edge cases to watch:
//    - deleteProfile will fail (Rust returns Err) if called for "gcc-allocation".
// 3. Dependencies on other modules:
//    - Invoked by Zustand store actions in store.ts.

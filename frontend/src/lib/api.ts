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



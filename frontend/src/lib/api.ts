import { invoke } from "@tauri-apps/api/core";
import type {
  VerificationRequest,
  VerificationResult,
  ReportSummary,
  Report,
  AppConfig,
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

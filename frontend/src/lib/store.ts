import { create } from "zustand";
import type {
  ReportSummary,
  Report,
  VerificationRequest,
  VerificationResult,
  AppConfig,
} from "./types";
import * as api from "./api";

interface AppState {
  // Reports
  reports: ReportSummary[];
  currentReport: Report | null;
  currentReportMarkdown: string | null;
  isLoadingReports: boolean;
  isLoadingReport: boolean;

  // Verification
  isRunning: boolean;
  lastResult: VerificationResult | null;

  // Config
  config: AppConfig | null;

  // Actions
  loadReports: () => Promise<void>;
  loadReport: (id: string) => Promise<void>;
  runVerification: (request: VerificationRequest) => Promise<VerificationResult>;
  deleteReport: (id: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  reports: [],
  currentReport: null,
  currentReportMarkdown: null,
  isLoadingReports: false,
  isLoadingReport: false,
  isRunning: false,
  lastResult: null,
  config: null,

  // Load all reports
  loadReports: async () => {
    set({ isLoadingReports: true });
    try {
      const reports = await api.listReports();
      set({ reports, isLoadingReports: false });
    } catch (error) {
      console.error("Failed to load reports:", error);
      set({ isLoadingReports: false });
    }
  },

  // Load a specific report
  loadReport: async (id: string) => {
    const { reports } = get();
    const reportSummary = reports.find((r) => r.id === id);

    if (!reportSummary) {
      console.error("Report not found:", id);
      return;
    }

    set({ isLoadingReport: true, currentReport: null, currentReportMarkdown: null });

    try {
      // Load JSON report if available
      if (reportSummary.json_path) {
        const report = await api.readReportJson(reportSummary.json_path);
        set({ currentReport: report });
      }

      // Load markdown report
      const markdown = await api.readReport(reportSummary.report_path);
      set({ currentReportMarkdown: markdown, isLoadingReport: false });
    } catch (error) {
      console.error("Failed to load report:", error);
      set({ isLoadingReport: false });
    }
  },

  // Run verification
  runVerification: async (request: VerificationRequest) => {
    set({ isRunning: true, lastResult: null });
    try {
      const result = await api.runVerification(request);
      set({ isRunning: false, lastResult: result });

      // Reload reports list
      if (result.success) {
        get().loadReports();
      }

      return result;
    } catch (error) {
      const result: VerificationResult = {
        success: false,
        summary: "",
        error: String(error),
      };
      set({ isRunning: false, lastResult: result });
      return result;
    }
  },

  // Delete a report
  deleteReport: async (id: string) => {
    const { reports } = get();
    const report = reports.find((r) => r.id === id);

    if (!report) {
      console.error("Report not found:", id);
      return;
    }

    try {
      await api.deleteReport(
        report.report_path,
        report.json_path
      );

      // Reload reports list
      get().loadReports();
    } catch (error) {
      console.error("Failed to delete report:", error);
    }
  },

  // Load config
  loadConfig: async () => {
    try {
      const config = await api.getAppConfig();
      set({ config });
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  },

  // Save config
  saveConfig: async (config: AppConfig) => {
    try {
      await api.saveAppConfig(config);
      set({ config });
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  },
}));

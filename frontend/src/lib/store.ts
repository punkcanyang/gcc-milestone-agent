import { create } from "zustand";
import type {
  ReportSummary,
  Report,
  VerificationRequest,
  VerificationResult,
  AppConfig,
  Project,
  MilestonePhase,
  ProjectWithPhases,
  VerificationRun,
} from "./types";
import * as api from "./api";

interface AppState {
  // Reports
  reports: ReportSummary[];
  currentReport: Report | null;
  currentReportMarkdown: string | null;
  isLoadingReports: boolean;
  isLoadingReport: boolean;

  // Projects & DB Runs
  projects: ProjectWithPhases[];
  currentProject: ProjectWithPhases | null;
  projectRuns: VerificationRun[];
  isLoadingProjects: boolean;
  isLoadingRuns: boolean;

  // Verification
  isRunning: boolean;
  lastResult: VerificationResult | null;

  // Config
  config: AppConfig | null;

  // Actions
  loadReports: () => Promise<void>;
  loadReport: (id: string) => Promise<void>;
  runVerification: (
    request: VerificationRequest,
    projectId?: number,
    phaseId?: string
  ) => Promise<VerificationResult>;
  deleteReport: (id: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;

  // Project Actions
  loadProjects: () => Promise<void>;
  createProject: (
    project: Omit<Project, "id" | "created_at">,
    phases: Omit<MilestonePhase, "id" | "project_id" | "created_at">[]
  ) => Promise<number>;
  deleteProject: (id: number) => Promise<void>;
  setCurrentProject: (project: ProjectWithPhases | null) => void;
  loadProjectRuns: (projectId: number) => Promise<void>;
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

  projects: [],
  currentProject: null,
  projectRuns: [],
  isLoadingProjects: false,
  isLoadingRuns: false,

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
  runVerification: async (
    request: VerificationRequest,
    projectId?: number,
    phaseId?: string
  ) => {
    set({ isRunning: true, lastResult: null });
    try {
      const result = await api.runVerification(request);
      set({ isRunning: false, lastResult: result });

      // Reload reports list
      if (result.success) {
        get().loadReports();

        // 如果有关联项目，自动将结果沉淀进本地数据库
        if (
          projectId &&
          result.json_path &&
          result.html_path &&
          result.report_path
        ) {
          try {
            await api.saveRunResult(
              projectId,
              phaseId || null,
              result.json_path,
              result.html_path,
              result.report_path
            );
            // 重新加载该项目的 runs 历史
            get().loadProjectRuns(projectId);
          } catch (dbErr) {
            console.error("Failed to save run result to database:", dbErr);
          }
        }
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

  // Load projects from database
  loadProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const projects = await api.listProjects();
      set({ projects, isLoadingProjects: false });
    } catch (error) {
      console.error("Failed to load projects:", error);
      set({ isLoadingProjects: false });
    }
  },

  // Create project with phases
  createProject: async (project, phases) => {
    try {
      const id = await api.createProject(project, phases);
      get().loadProjects();
      return id;
    } catch (error) {
      console.error("Failed to create project:", error);
      throw error;
    }
  },

  // Delete project
  deleteProject: async (id) => {
    try {
      await api.deleteProject(id);
      
      // 如果当前项目是被删除的项目，清空当前项目状态
      const { currentProject } = get();
      if (currentProject && currentProject.project.id === id) {
        set({ currentProject: null, projectRuns: [] });
      }

      get().loadProjects();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  },

  // Set current active project
  setCurrentProject: (project) => {
    set({ currentProject: project });
    if (project && project.project.id) {
      get().loadProjectRuns(project.project.id);
    } else {
      set({ projectRuns: [] });
    }
  },

  // Load runs history for a project
  loadProjectRuns: async (projectId) => {
    set({ isLoadingRuns: true });
    try {
      const projectRuns = await api.getProjectRuns(projectId);
      set({ projectRuns, isLoadingRuns: false });
    } catch (error) {
      console.error("Failed to load project runs:", error);
      set({ isLoadingRuns: false });
    }
  },
}));

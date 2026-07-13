import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { PlayCircle, Loader2, CheckCircle2, XCircle, FolderKanban, Info, Terminal } from "lucide-react";
import { useStore } from "../lib/store";
import VerificationConsole from "../components/VerificationConsole";
import type { VerificationRequest } from "../lib/types";

export default function NewVerification() {
  const navigate = useNavigate();
  const {
    isRunning,
    lastResult,
    runVerification,
    projects,
    loadProjects,
    profiles,
    loadProfiles,
  } = useStore();

  const [useManagedProject, setUseManagedProject] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  const [form, setForm] = useState<VerificationRequest>({
    repo: "",
    milestone: "",
    since: "",
    profile: "",
    providers: "github-api",
  });

  useEffect(() => {
    loadProjects();
    loadProfiles();
  }, [loadProjects, loadProfiles]);

  // Handle project selection change
  useEffect(() => {
    if (!useManagedProject || !selectedProjectId) return;

    const projWithPhases = projects.find((p) => p.project.id === selectedProjectId);
    if (!projWithPhases) return;

    // Prefill repository name
    setForm((prev) => ({
      ...prev,
      repo: projWithPhases.project.repo,
    }));

    // If there are phases, select the first one by default
    const firstPhase = projWithPhases.phases[0];
    if (firstPhase) {
      setSelectedPhaseId(firstPhase.phase_id);
    } else {
      setSelectedPhaseId("");
    }
  }, [useManagedProject, selectedProjectId, projects]);

  // Handle phase selection change
  useEffect(() => {
    if (!useManagedProject || !selectedProjectId || !selectedPhaseId) return;

    const projWithPhases = projects.find((p) => p.project.id === selectedProjectId);
    if (!projWithPhases) return;

    const phase = projWithPhases.phases.find((ph) => ph.phase_id === selectedPhaseId);
    if (!phase) return;

    // Prefill profile and description if available
    setForm((prev) => ({
      ...prev,
      profile: phase.rules_profile || "gcc-allocation",
      milestone: phase.title || `Verification for Phase ${phase.phase_id}`,
    }));
  }, [useManagedProject, selectedProjectId, selectedPhaseId, projects]);

  // Set initial selected project if projects exist
  useEffect(() => {
    if (projects.length > 0 && selectedProjectId === null) {
      setSelectedProjectId(projects[0].project.id || null);
    }
  }, [projects, selectedProjectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requestParams: VerificationRequest = {
      ...form,
      since: form.since || undefined,
      providers: form.providers || undefined,
    };

    const selectedProfileName = form.profile;
    const profileSummary = profiles.find((p) => p.name === selectedProfileName);
    if (profileSummary) {
      if (profileSummary.is_builtin) {
        requestParams.profile = profileSummary.name;
        requestParams.rules_file = undefined;
      } else {
        requestParams.profile = undefined;
        requestParams.rules_file = profileSummary.file_path;
      }
    } else if (selectedProfileName) {
      requestParams.profile = selectedProfileName;
      requestParams.rules_file = undefined;
    }

    // If utilizing database project integration, pass project details for auto-saves
    const projId = useManagedProject && selectedProjectId ? selectedProjectId : undefined;
    const phId = useManagedProject && selectedPhaseId ? selectedPhaseId : undefined;

    setIsConsoleOpen(true);
    const result = await runVerification(requestParams, projId, phId);

    if (result.success) {
      // Navigate to dashboard or history after a short delay
      setTimeout(() => {
        if (projId) {
          navigate("/");
        } else {
          navigate("/history");
        }
      }, 2000);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">新建审计校验</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          触发 GitHub 仓库里程碑的自动化多维度审计与分析任务
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Parameters Form */}
        <Card className="lg:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" />
              审计任务参数
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mode selection toggle */}
            <div className="flex gap-2 mb-6 bg-accent/20 p-1 rounded-md max-w-sm">
              <Button
                type="button"
                variant={useManagedProject ? "default" : "ghost"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setUseManagedProject(true)}
              >
                关联列管项目
              </Button>
              <Button
                type="button"
                variant={!useManagedProject ? "default" : "ghost"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setUseManagedProject(false)}
              >
                手动自由验证
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {useManagedProject ? (
                <div className="grid gap-4 md:grid-cols-2 bg-accent/10 p-4 rounded-lg border mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="projectSelect">选择列管项目 *</Label>
                    <select
                      id="projectSelect"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedProjectId || ""}
                      onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                      required
                    >
                      {projects.map((p) => (
                        <option key={p.project.id} value={p.project.id}>
                          {p.project.name} ({p.project.repo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phaseSelect">选择审计里程碑阶段 *</Label>
                    <select
                      id="phaseSelect"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedPhaseId}
                      onChange={(e) => setSelectedPhaseId(e.target.value)}
                      required
                    >
                      {projects
                        .find((p) => p.project.id === selectedProjectId)
                        ?.phases.map((ph) => (
                          <option key={ph.id} value={ph.phase_id}>
                            {ph.phase_id} - {ph.title}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="repo">Repository 代码仓库 (owner/repo) *</Label>
                <Input
                  id="repo"
                  placeholder="gcc-foundation/gcc-openclaw-grants"
                  value={form.repo}
                  onChange={(e) => setForm({ ...form, repo: e.target.value })}
                  disabled={useManagedProject}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="milestone">Milestone 验收标准目标 *</Label>
                <Textarea
                  id="milestone"
                  placeholder="请输入本次验收的里程碑达成规则或描述文本..."
                  value={form.milestone}
                  onChange={(e) =>
                    setForm({ ...form, milestone: e.target.value })
                  }
                  required
                  rows={4}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="since">起始过滤时间 (Since Date, 可选)</Label>
                  <Input
                    id="since"
                    type="date"
                    value={form.since}
                    onChange={(e) => setForm({ ...form, since: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile">规则集 Profile (可选)</Label>
                  <select
                    id="profile"
                    value={form.profile || ""}
                    onChange={(e) =>
                      setForm({ ...form, profile: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">-- 选择规则集 (默认 gcc-allocation) --</option>
                    {profiles.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.is_builtin ? "(内置)" : "(自定义)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="providers">校验数据源 Providers (逗号分隔)</Label>
                <Input
                  id="providers"
                  placeholder="github-api,github-actions,github-community"
                  value={form.providers}
                  onChange={(e) =>
                    setForm({ ...form, providers: e.target.value })
                  }
                />
              </div>

              <Button type="submit" disabled={isRunning} className="w-full">
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在拉取 GitHub 数据并进行多维审计评级...
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    启动里程碑审计
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Tip Box & Realtime Results */}
        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-primary">
                <Info className="h-4 w-4" />
                审计提示说明
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                <b>关联列管项目</b> 后，校验引擎产生的数据报表不仅会生成物理文件，还会由 Tauri 后端提取关键 KPI 指标（如得分、PR数、Commit数等）沉淀至本地 SQLite 数据库中，用于在仪表盘渲染里程碑阶段的演进状态。
              </p>
              <p>
                <b>自由手动模式</b> 适合临时性审计非列管的开源仓库，校验结果只会保存在输出目录的物理文件中，不会污染本地项目数据库。
              </p>
            </CardContent>
          </Card>

          {lastResult && (
            <Card className="border-border/60 shadow-sm animate-in zoom-in-95 duration-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  {lastResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  最近执行结果
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-xs">
                  <div>
                    <Badge variant={lastResult.success ? "default" : "destructive"}>
                      {lastResult.success ? "Success" : "Failed"}
                    </Badge>
                  </div>
                  <p className="leading-relaxed">{lastResult.summary}</p>
                  {lastResult.error && (
                    <pre className="text-[10px] text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded overflow-auto max-h-[150px]">
                      {lastResult.error}
                    </pre>
                  )}
                  {lastResult.report_path && (
                    <p className="text-muted-foreground break-all">
                      报告路径: <br />
                      <span className="font-mono text-[10px]">{lastResult.report_path}</span>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {/* Floating terminal toggle button */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="h-12 w-12 rounded-full shadow-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-primary"
          title="Toggle Terminal Console"
        >
          <Terminal className="h-6 w-6" />
        </Button>
      </div>

      <VerificationConsole isOpen={isConsoleOpen} onClose={() => setIsConsoleOpen(false)} />
    </div>
  );
}

/*
__ai_context__
本组件为手动/项目触发验证的表单页面，负责选择项目和里程碑阶段、配置过滤时间和自定义规则集，并在终端中动态反馈校验日志。
*/

// [For Future AI]
// 1. Key Assumptions:
//    - `projects` loaded from global Zustand store represents all sqlite-registered entities. Selecting a project auto-prefills its repository name into the form input.
//    - Clicking a phase dynamically sets target rules_profile and milestone description text fields.
//    - Spawning `runVerification` executes the CLI command under the hood. If `projectId` and `phaseId` are defined, they are passed as secondary args to trigger sqlite db record insertions automatically.
//    - Profile dropdown resolves custom profile YAML paths disk locations dynamically.
// 2. Dependencies on other modules:
//    - useStore hooks, VerificationConsole.

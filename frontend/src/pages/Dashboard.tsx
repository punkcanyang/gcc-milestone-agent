import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { LoadingPage } from "../components/ui/loading";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Loader2,
  PlusCircle,
  Play,
  Trash2,
  AlertTriangle,
  FolderKanban,
  Settings,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useStore } from "../lib/store";
import type { MilestonePhase } from "../lib/types";

const COLORS = {
  met: "#22c55e",
  partially_met: "#f59e0b",
  not_met: "#ef4444",
  failed: "#ef4444",
  pending: "#94a3b8",
};

interface PhaseForm {
  phase_id: string;
  title: string;
  depends_on: string;
  rules_profile: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    projects,
    isLoadingProjects,
    loadProjects,
    createProject,
    deleteProject,
    reports,
    loadReports,
    runVerification,
    isRunning,
  } = useStore();

  // Add Project Dialog State
  const [showAddForm, setShowAddForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectRepo, setProjectRepo] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectConfig, setProjectConfig] = useState("");
  
  // Dynamic phases for project creation
  const [phases, setPhases] = useState<PhaseForm[]>([
    { phase_id: "M1", title: "Milestone 1", depends_on: "[]", rules_profile: "gcc-allocation" },
  ]);

  // Loading state during quick check trigger
  const [checkingPhase, setCheckingPhase] = useState<{ projectId: number; phaseId: string } | null>(null);

  useEffect(() => {
    loadProjects();
    loadReports();
  }, [loadProjects, loadReports]);

  const handleAddPhaseInput = () => {
    const nextNum = phases.length + 1;
    const prevPhaseId = phases[phases.length - 1]?.phase_id || "";
    const depends = prevPhaseId ? `["${prevPhaseId}"]` : "[]";
    setPhases([
      ...phases,
      { phase_id: `M${nextNum}`, title: `Milestone ${nextNum}`, depends_on: depends, rules_profile: "gcc-allocation" },
    ]);
  };

  const handleRemovePhaseInput = (index: number) => {
    if (phases.length <= 1) return;
    setPhases(phases.filter((_, i) => i !== index));
  };

  const handlePhaseChange = (index: number, field: keyof PhaseForm, val: string) => {
    const updated = [...phases];
    updated[index] = { ...updated[index], [field]: val };
    setPhases(updated);
  };

  const handlePresetStandard = () => {
    setPhases([
      { phase_id: "M1", title: "基礎倉儲與 CI 流水線", depends_on: "[]", rules_profile: "gcc-allocation" },
      { phase_id: "M2", title: "核心交付與整合測試", depends_on: '["M1"]', rules_profile: "gcc-allocation" },
      { phase_id: "M3", title: "正式發布與社區運維", depends_on: '["M2"]', rules_profile: "gcc-allocation" },
    ]);
  };

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName || !projectRepo) return;

    try {
      await createProject(
        {
          name: projectName,
          repo: projectRepo,
          description: projectDesc,
          config_yaml: projectConfig || "{}",
        },
        phases.map((p) => ({
          phase_id: p.phase_id,
          title: p.title,
          depends_on: p.depends_on,
          rules_profile: p.rules_profile || undefined,
          created_at: new Date().toISOString(),
          project_id: 0, // Assigned in SQLite
        }))
      );

      // Reset form
      setProjectName("");
      setProjectRepo("");
      setProjectDesc("");
      setProjectConfig("");
      setPhases([{ phase_id: "M1", title: "Milestone 1", depends_on: "[]", rules_profile: "gcc-allocation" }]);
      setShowAddForm(false);
    } catch (err) {
      alert("创建项目失败，代码库 Repo 需保证唯一，且依赖的 JSON 格式需正确。");
    }
  };

  // Run a quick verification for a project's phase
  const handleQuickCheck = async (projectId: number, repo: string, phaseId: string, profile?: string) => {
    if (isRunning) return;
    setCheckingPhase({ projectId, phaseId });

    try {
      const result = await runVerification(
        {
          repo,
          milestone: `Verification for Phase ${phaseId}`,
          profile: profile || "gcc-allocation",
          providers: "github-api",
        },
        projectId,
        phaseId
      );

      if (result.success) {
        alert(`阶段 ${phaseId} 校验运行成功！结果已沉淀至本地数据库。`);
      } else {
        alert(`校验失败：${result.error || result.summary}`);
      }
    } catch (err) {
      console.error(err);
      alert("运行校验时发生错误。");
    } finally {
      setCheckingPhase(null);
    }
  };

  // Calculate stats from SQLite projects & reports
  const totalProjects = projects.length;
  let totalRuns = 0;
  let passedRuns = 0;
  let partialRuns = 0;
  let failedRuns = 0;
  let totalScores = 0;

  // Process timeline trends from all verification runs
  const allRuns: { date: string; score: number }[] = [];

  // Parse runs
  projects.forEach((p) => {
    // Re-check recent runs
    // Currently, store runs are populated when a project is selected.
    // For global charts, we can also extract metrics from CLI historical reports or selected runs.
    // To ensure accuracy, we map current active reports as verification runs list.
  });

  const parsedReports = reports.map((r) => {
    totalRuns += 1;
    totalScores += r.score;
    if (r.status === "met") passedRuns += 1;
    else if (r.status === "partially_met") partialRuns += 1;
    else failedRuns += 1;

    return {
      date: new Date(r.date).toLocaleDateString(),
      score: r.score,
      epoch: new Date(r.date).getTime(),
    };
  });

  // Sort trend data by date
  const trendData = parsedReports
    .sort((a, b) => a.epoch - b.epoch)
    .slice(-10) // Show last 10 runs
    .map((r) => ({ date: r.date, score: r.score }));

  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
  const avgScore = totalRuns > 0 ? Math.round(totalScores / totalRuns) : 0;

  const stats = [
    { name: "列管項目", value: totalProjects.toString(), icon: FolderKanban, color: "text-blue-500" },
    { name: "累計校驗", value: totalRuns.toString(), icon: FileText, color: "text-purple-500" },
    { name: "均分 / 通過率", value: `${avgScore} 分 (${passRate}%)`, icon: TrendingUp, color: "text-green-500" },
    { name: "异常异常状态", value: failedRuns.toString(), icon: AlertTriangle, color: "text-red-500" },
  ];

  const pieData = [
    { name: "Met", value: passedRuns, color: COLORS.met },
    { name: "Partially Met", value: partialRuns, color: COLORS.partially_met },
    { name: "Not Met", value: failedRuns, color: COLORS.failed },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/75 bg-clip-text text-transparent">
            Reviewer Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            基于本地 SQLite 的资助里程碑多阶段及多项目审计控制台
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? "outline" : "default"}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {showAddForm ? "取消创建" : "添加列管项目"}
        </Button>
      </div>

      {/* Add Project Form (Expandable) */}
      {showAddForm && (
        <Card className="border-primary/20 shadow-md bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>新建列管资助项目</CardTitle>
            <Button onClick={handlePresetStandard} variant="secondary" size="sm">
              载入標準三期 (M1-M3) 模版
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateProjectSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="projName">项目名称 *</Label>
                  <Input
                    id="projName"
                    placeholder="例如：OpenClaw 重构资助"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projRepo">GitHub 仓库 (owner/repo) *</Label>
                  <Input
                    id="projRepo"
                    placeholder="例如：gcc-foundation/gcc-openclaw-grants"
                    value={projectRepo}
                    onChange={(e) => setProjectRepo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="projDesc">项目简短描述</Label>
                <Textarea
                  id="projDesc"
                  placeholder="项目资助目标、主要交付件说明..."
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Dynamic Phases List */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">项目阶段划分 (Phases Timeline)</Label>
                  <Button type="button" onClick={handleAddPhaseInput} variant="outline" size="sm">
                    增加验收阶段
                  </Button>
                </div>

                <div className="space-y-3">
                  {phases.map((p, idx) => (
                    <div key={idx} className="flex flex-wrap md:flex-nowrap items-center gap-3 bg-accent/20 p-3 rounded-lg border">
                      <div className="w-16">
                        <Label className="text-xs text-muted-foreground">ID</Label>
                        <Input
                          value={p.phase_id}
                          onChange={(e) => handlePhaseChange(idx, "phase_id", e.target.value)}
                          placeholder="M1"
                          className="h-8 text-xs font-bold"
                          required
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <Label className="text-xs text-muted-foreground">阶段交付标题</Label>
                        <Input
                          value={p.title}
                          onChange={(e) => handlePhaseChange(idx, "title", e.target.value)}
                          placeholder="例如：完成测试集搭建"
                          className="h-8 text-xs"
                          required
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs text-muted-foreground">依赖阶段</Label>
                        <Input
                          value={p.depends_on}
                          onChange={(e) => handlePhaseChange(idx, "depends_on", e.target.value)}
                          placeholder="[] 或 ['M1']"
                          className="h-8 text-xs font-mono"
                          required
                        />
                      </div>
                      <div className="w-32">
                        <Label className="text-xs text-muted-foreground">规则规则 profile</Label>
                        <Input
                          value={p.rules_profile}
                          onChange={(e) => handlePhaseChange(idx, "rules_profile", e.target.value)}
                          placeholder="gcc-allocation"
                          className="h-8 text-xs"
                        />
                      </div>
                      {phases.length > 1 && (
                        <div className="pt-4">
                          <Button
                            type="button"
                            onClick={() => handleRemovePhaseInput(idx)}
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button type="button" onClick={() => setShowAddForm(false)} variant="ghost">
                  取消
                </Button>
                <Button type="submit">保存并初始化项目</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stats Summary Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="overflow-hidden border-border/60 hover:shadow-sm transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{stat.name}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tracking-tight">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">列管资助项目列表</h2>
        </div>

        {isLoadingProjects ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed py-12 text-center">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
            <p className="font-medium">暂无列管资助项目</p>
            <p className="text-sm text-muted-foreground mb-4">创建项目后即可管理其多期验收里程碑和历史审计趋势</p>
            <Button onClick={() => setShowAddForm(true)} size="sm">
              添加您的第一个项目
            </Button>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            {projects.map((projWithPhases) => {
              const proj = projWithPhases.project;
              const phasesList = projWithPhases.phases;

              // Find verification runs of this repository
              const repoRuns = reports.filter((r) => r.repo.toLowerCase() === proj.repo.toLowerCase());
              const latestRun = repoRuns[0]; // Sort order is descending

              return (
                <Card key={proj.id} className="relative overflow-hidden group border-border/80 hover:border-primary/30 transition-all shadow-sm">
                  {/* Subtle top indicator based on latest run */}
                  <div 
                    className="absolute top-0 left-0 w-full h-1" 
                    style={{ backgroundColor: latestRun ? COLORS[latestRun.status] || COLORS.pending : COLORS.pending }}
                  />

                  <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                          {proj.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs font-mono">
                          {proj.repo}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 pr-6">
                        {proj.description || "暂无项目描述"}
                      </p>
                    </div>
                    <Button 
                      onClick={() => {
                        if (confirm(`确认取消列管项目「${proj.name}」吗？相关数据将一并移除。`)) {
                          if (proj.id) deleteProject(proj.id);
                        }
                      }}
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Horizontal Timeline Visualization */}
                    <div className="bg-accent/10 rounded-lg p-4 border border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        里程碑多期进展时间轴
                      </p>
                      
                      <div className="relative flex items-center justify-between mt-6 px-4">
                        {/* Connecting Line */}
                        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-border -translate-y-1/2 z-0" />

                        {phasesList.map((ph, idx) => {
                          // Find latest run for this phase on this repo
                          const phRun = repoRuns.find((r) => {
                            // If reports don't have phase object (old runs), matching is fallback
                            // Our updated save_run_result logs phase_id, which we map here.
                            // Currently, match via report milestone description pattern as fallback
                            return r.milestone.includes(`Phase ${ph.phase_id}`) || r.milestone.includes(ph.phase_id);
                          });

                          const isChecking = checkingPhase?.projectId === proj.id && checkingPhase?.phaseId === ph.phase_id;
                          const statusColor = phRun ? COLORS[phRun.status] || COLORS.pending : COLORS.pending;

                          return (
                            <div key={ph.id} className="relative z-10 flex flex-col items-center">
                              {/* Phase Node Circle */}
                              <div 
                                className="w-10 h-10 rounded-full border-2 bg-background flex items-center justify-center font-bold text-xs transition-all shadow-sm"
                                style={{ 
                                  borderColor: statusColor,
                                  color: phRun ? statusColor : "hsl(var(--muted-foreground))"
                                }}
                                title={`${ph.title} (${phRun ? phRun.status : "未校验"})`}
                              >
                                {isChecking ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : phRun ? (
                                  `${phRun.score}`
                                ) : (
                                  ph.phase_id
                                )}
                              </div>
                              <span className="text-[10px] font-bold mt-2 text-center max-w-[80px] truncate">
                                {ph.title}
                              </span>

                              {/* Hover verification trigger */}
                              <div className="mt-2 flex gap-1">
                                {phRun ? (
                                  <Link to={`/report/${phRun.id}`}>
                                    <Button variant="ghost" className="h-5 text-[9px] px-1 text-primary">
                                      查看报告
                                    </Button>
                                  </Link>
                                ) : (
                                  <Button 
                                    onClick={() => handleQuickCheck(proj.id!, proj.repo, ph.phase_id, ph.rules_profile || undefined)}
                                    disabled={isRunning}
                                    variant="outline" 
                                    className="h-5 text-[9px] px-1 hover:bg-primary hover:text-primary-foreground"
                                  >
                                    <Play className="h-2 w-2 mr-1 fill-current" />
                                    审计
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Summary row */}
                    {latestRun ? (
                      <div className="flex items-center justify-between text-xs border-t pt-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span>最新状态: <b className="text-foreground font-semibold">{latestRun.status.replace("_", " ")}</b></span>
                        </div>
                        <span className="text-muted-foreground">得分: <b className="text-foreground text-sm font-extrabold">{latestRun.score}</b></span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-1 border-t pt-3">
                        暂无校验历史。点击上方阶段按钮可触发自动审计。
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dashboard Trend and Distribution Charts */}
      {totalRuns > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Score Trend Card */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <TrendingUp className="h-4 w-4 text-primary" />
                审计得分演进趋势 (最近 10 次运行)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-[10px]" />
                    <YAxis domain={[0, 100]} className="text-[10px]" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Status Distribution Card */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <BarChart3 className="h-4 w-4 text-primary" />
                里程碑状态达成分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/*
[For Future AI]
Key Assumptions:
1. `reports` (from global Zustand store) maps to historical verification reports loaded from the local reports JSON directory. We use this to compute average scores, status distributions, and recent audit scores.
2. Under "Quick Check / Quick Audit" on each project phase node, we spawn the `runVerification` action, supplying the target repository, default profile, and passing down the specific `projectId` and `phaseId` to automatically register and log the run summary into SQLite database `verification_runs` table when execution finishes.
3. Dependencies are modeled as strings representing JSON arrays (e.g., '["M1"]').
4. Deleting a project utilizes SQLite foreign key cascaded deletes to wipe its phases and runs automatically.
*/

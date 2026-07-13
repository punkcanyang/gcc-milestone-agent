import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { useStore } from "../lib/store";
import {
  FileCode2,
  Plus,
  Trash2,
  Save,
  Sliders,
  AlertTriangle,
  CheckCircle,
  X,
  FileDown,
  Clipboard,
} from "lucide-react";
import * as api from "../lib/api";
import type { ProfileSummary, ProfileRule } from "../lib/types";

export default function ProfilesPage() {
  const { profiles, isLoadingProfiles, loadProfiles, saveProfile, deleteProfile } = useStore();
  const [selectedProfile, setSelectedProfile] = useState<ProfileSummary | null>(null);

  // Form states for the currently selected profile
  const [profileName, setProfileName] = useState("");
  const [rules, setRules] = useState<ProfileRule[]>([]);
  const [nameError, setNameError] = useState("");
  
  // Feedback alerts
  const [alertInfo, setAlertInfo] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // YAML Modal state
  const [isYamlModalOpen, setIsYamlModalOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");

  // Keyword input state helper
  const [keywordInputs, setKeywordInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Handle auto-selecting the first profile when loaded
  useEffect(() => {
    if (profiles.length > 0 && !selectedProfile) {
      handleSelectProfile(profiles[0]);
    }
  }, [profiles, selectedProfile]);

  const handleSelectProfile = (profile: ProfileSummary) => {
    setSelectedProfile(profile);
    setProfileName(profile.name);
    setRules(JSON.parse(JSON.stringify(profile.rules))); // deep clone
    setNameError("");
    setAlertInfo(null);
  };

  const handleNameChange = (val: string) => {
    setProfileName(val);
    if (!val) {
      setNameError("规则集名称不能为空");
      return;
    }
    const isValid = val.split("").every(c => /[a-zA-Z0-9_-]/.test(c));
    if (!isValid) {
      setNameError("名称仅允许字母、数字、中划线(-)和下划线(_)");
    } else {
      setNameError("");
    }
  };

  // Add a new rule item to the list
  const handleAddRule = () => {
    const nextIndex = rules.length + 1;
    const newRule: ProfileRule = {
      id: `RULE-${nextIndex}`,
      text: "",
      keywords: [],
    };
    setRules([...rules, newRule]);
  };

  // Update specific fields of a rule
  const handleUpdateRule = (index: number, key: keyof ProfileRule, value: any) => {
    const updated = [...rules];
    updated[index] = {
      ...updated[index],
      [key]: value,
    };
    setRules(updated);
  };

  // Delete specific rule from the list
  const handleDeleteRule = (index: number) => {
    const updated = [...rules];
    updated.splice(index, 1);
    setRules(updated);
  };

  // Add a keyword keyword tag
  const handleAddKeyword = (ruleIndex: number) => {
    const input = keywordInputs[ruleIndex] || "";
    const cleanInput = input.trim().toLowerCase();
    if (!cleanInput) return;

    const currentRule = rules[ruleIndex];
    if (!currentRule.keywords.includes(cleanInput)) {
      const updatedKeywords = [...currentRule.keywords, cleanInput];
      handleUpdateRule(ruleIndex, "keywords", updatedKeywords);
    }
    
    // Clear input
    setKeywordInputs(prev => ({
      ...prev,
      [ruleIndex]: "",
    }));
  };

  // Remove specific keyword tag
  const handleRemoveKeyword = (ruleIndex: number, keywordIndex: number) => {
    const currentRule = rules[ruleIndex];
    const updatedKeywords = [...currentRule.keywords];
    updatedKeywords.splice(keywordIndex, 1);
    handleUpdateRule(ruleIndex, "keywords", updatedKeywords);
  };

  // Create a brand new custom ruleset template
  const handleCreateNewProfile = () => {
    const newSummary: ProfileSummary = {
      name: `custom-${Date.now().toString().slice(-4)}`,
      is_builtin: false,
      rules: [
        {
          id: "CUSTOM-R1",
          text: "这里是您自定义的校验规则说明",
          keywords: ["custom", "milestone"],
        }
      ],
    };
    handleSelectProfile(newSummary);
  };

  // Trigger profile save
  const handleSaveProfile = async () => {
    if (!profileName) {
      setAlertInfo({ type: "error", message: "规则集名称不能为空！" });
      return;
    }
    if (nameError) {
      setAlertInfo({ type: "error", message: nameError });
      return;
    }
    if (rules.length === 0) {
      setAlertInfo({ type: "error", message: "规则集必须包含至少一条规则！" });
      return;
    }
    // Check duplicates in rule IDs
    const ids = rules.map(r => r.id.trim());
    const hasDuplicates = ids.some((id, index) => ids.indexOf(id) !== index);
    if (hasDuplicates) {
      setAlertInfo({ type: "error", message: "规则 ID 不能重复，请确保每个 Rule ID 唯一！" });
      return;
    }

    try {
      const physicalPath = await saveProfile(profileName, rules);
      setAlertInfo({
        type: "success",
        message: `规则集「${profileName}」已成功保存至本地：${physicalPath}`,
      });
      // Refresh select target with updated store items
      const updatedProfile = profiles.find(p => p.name === profileName);
      if (updatedProfile) {
        setSelectedProfile(updatedProfile);
      }
    } catch (err) {
      setAlertInfo({ type: "error", message: `保存失败: ${String(err)}` });
    }
  };

  // Trigger profile delete
  const handleDeleteProfile = async (name: string) => {
    if (confirm(`确定要彻底删除规则集「${name}」吗？该操作不可逆，将直接删除物理磁盘文件。`)) {
      try {
        await deleteProfile(name);
        setAlertInfo({ type: "success", message: `规则集「${name}」已成功删除。` });
        setSelectedProfile(null);
      } catch (err) {
        setAlertInfo({ type: "error", message: `删除失败: ${String(err)}` });
      }
    }
  };

  // Show YAML Export view
  const handleOpenExportYaml = async () => {
    try {
      const yaml = await api.rulesToYaml(rules);
      setYamlContent(yaml);
      setYamlError("");
      setIsYamlModalOpen(true);
    } catch (err) {
      alert("生成 YAML 失败: " + String(err));
    }
  };

  // Copy YAML to Clipboard
  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(yamlContent);
    alert("YAML 已复制到剪贴板！");
  };

  // Parse YAML in Modal and apply rules
  const handleApplyYaml = async () => {
    try {
      const parsedRules = await api.yamlToRules(yamlContent);
      if (parsedRules.length === 0) {
        setYamlError("YAML 必须包含至少一条规则");
        return;
      }
      setRules(parsedRules);
      setIsYamlModalOpen(false);
      setAlertInfo({ type: "success", message: "YAML 已成功解析并载入至编辑区，请记得保存！" });
    } catch (err) {
      setYamlError(`解析 YAML 发生错误，请检查语法:\n${String(err)}`);
    }
  };

  const providersList = [
    { value: "", label: "全局规则 (无数据源过滤)" },
    { value: "github-api", label: "GitHub API" },
    { value: "github-actions", label: "GitHub Actions" },
    { value: "discord-api", label: "Discord API" },
    { value: "url-checker", label: "URL Checker" },
    { value: "npm-registry", label: "NPM Registry" },
    { value: "github-community", label: "GitHub Community" },
    { value: "github-discussions", label: "GitHub Discussions" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Title Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">规则集管理 (Profiles)</h1>
          <p className="text-muted-foreground mt-1">
            在此管理、在线编辑以及导入导出各里程碑校验规则集合。内置规则集只读，自定义规则集将以 YAML 格式保存在本地 App Data 目录中。
          </p>
        </div>
        <Button onClick={handleCreateNewProfile} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium shadow-md">
          <Plus className="h-4 w-4" /> 新建规则集
        </Button>
      </div>

      {alertInfo && (
        <div className={`p-4 rounded-lg flex items-start gap-3 border ${
          alertInfo.type === "success" 
            ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300" 
            : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
        }`}>
          {alertInfo.type === "success" ? <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-semibold text-sm">{alertInfo.type === "success" ? "操作成功" : "发生错误"}</p>
            <p className="text-xs opacity-90 mt-1 break-all">{alertInfo.message}</p>
          </div>
          <button onClick={() => setAlertInfo(null)} className="ml-auto text-current opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Split Screen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Side Pane: Rulesets List */}
        <div className="md:col-span-1 space-y-4">
          <Card className="h-full border border-border bg-card/60 backdrop-blur-md shadow-sm">
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                规则集列表
              </CardTitle>
              <CardDescription>选择一个规则集进行浏览或修改</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingProfiles ? (
                <div className="p-8 text-center text-sm text-muted-foreground">正在加载规则集...</div>
              ) : profiles.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">无可用的规则集</div>
              ) : (
                <div className="divide-y divide-border">
                  {profiles.map((p) => {
                    const isSelected = selectedProfile?.name === p.name;
                    return (
                      <div
                        key={p.name}
                        onClick={() => handleSelectProfile(p)}
                        className={`w-full flex items-center justify-between p-3.5 text-left transition-all cursor-pointer border-l-2 ${
                          isSelected
                            ? "bg-accent/40 border-l-primary"
                            : "hover:bg-accent/20 border-l-transparent"
                        }`}
                      >
                        <div className="space-y-1 pr-2 overflow-hidden flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">{p.name}</span>
                            {p.is_builtin ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-indigo-200 text-indigo-700 bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:bg-indigo-950">
                                内置
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-teal-200 text-teal-700 bg-teal-50 dark:border-teal-900 dark:text-teal-300 dark:bg-teal-950">
                                自定义
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            包含 {p.rules?.length || 0} 个判定规则
                          </p>
                        </div>
                        {!p.is_builtin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProfile(p.name);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side Pane: Detailed Form */}
        <div className="md:col-span-3">
          {selectedProfile ? (
            <Card className="border border-border bg-card/60 backdrop-blur-md shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{profileName || "未命名规则集"}</CardTitle>
                    {selectedProfile.is_builtin ? (
                      <Badge variant="secondary">内置只读</Badge>
                    ) : (
                      <Badge variant="default" className="bg-teal-600 hover:bg-teal-700 text-white">自定义</Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {selectedProfile.is_builtin
                      ? "内置规则集只能进行预览或导出，如需修改，请点击右上角「新建规则集」创建新规则。"
                      : "您可以直接在下方在线增加、删除判定规则，也可以通过 YAML 面板进行批量导入导出。"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleOpenExportYaml} className="gap-1.5">
                    <FileDown className="h-4 w-4" /> {selectedProfile.is_builtin ? "查看/导出 YAML" : "导入/导出 YAML"}
                  </Button>
                  {!selectedProfile.is_builtin && (
                    <Button onClick={handleSaveProfile} size="sm" className="gap-1.5 bg-primary text-primary-foreground">
                      <Save className="h-4 w-4" /> 保存规则集
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Ruleset attributes */}
                <div className="grid grid-cols-1 gap-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label htmlFor="ruleset-name">规则集名称 (Name)</Label>
                    <Input
                      id="ruleset-name"
                      value={profileName}
                      disabled={selectedProfile.is_builtin}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="例如: custom-profile-audit"
                      className={nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {nameError && <p className="text-[11px] text-red-500">{nameError}</p>}
                    {!selectedProfile.is_builtin && (
                      <p className="text-[11px] text-muted-foreground">
                        名称将作为物理 YAML 保存时的文件名，保存后不可更改文件名本身。
                      </p>
                    )}
                  </div>
                </div>

                {/* Rules List Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-semibold text-sm">判定规则列表 ({rules.length})</h3>
                    {!selectedProfile.is_builtin && (
                      <Button onClick={handleAddRule} variant="outline" size="sm" className="h-8 gap-1">
                        <Plus className="h-3.5 w-3.5" /> 新增单条规则
                      </Button>
                    )}
                  </div>

                  {rules.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                      无任何规则，请点击上方「新增单条规则」
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {rules.map((rule, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-lg border bg-card/40 hover:bg-card/70 transition-colors shadow-xs space-y-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-grow">
                              <div className="sm:col-span-1 space-y-1.5">
                                <Label className="text-xs">规则 ID</Label>
                                <Input
                                  value={rule.id}
                                  disabled={selectedProfile.is_builtin}
                                  onChange={(e) => handleUpdateRule(idx, "id", e.target.value)}
                                  placeholder="GCC-A1"
                                  className="h-8 text-xs font-mono uppercase"
                                />
                              </div>
                              <div className="sm:col-span-2 space-y-1.5">
                                <Label className="text-xs">验证数据源 (Source Filter)</Label>
                                <select
                                  value={rule.source || ""}
                                  disabled={selectedProfile.is_builtin}
                                  onChange={(e) => handleUpdateRule(idx, "source", e.target.value || undefined)}
                                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {providersList.map((p) => (
                                    <option key={p.value} value={p.value}>
                                      {p.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {!selectedProfile.is_builtin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-1"
                                onClick={() => handleDeleteRule(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>

                          {/* Text description */}
                          <div className="space-y-1.5">
                            <Label className="text-xs">规则判定描述 (Text)</Label>
                            <Textarea
                              value={rule.text}
                              disabled={selectedProfile.is_builtin}
                              onChange={(e) => handleUpdateRule(idx, "text", e.target.value)}
                              placeholder="在这里写下验证这枚里程碑的具体文字标准..."
                              className="min-h-[50px] text-xs"
                            />
                          </div>

                          {/* Keywords Tagging */}
                          <div className="space-y-2">
                            <Label className="text-xs">触发匹配关键词 (Keywords)</Label>
                            <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background/50 min-h-[38px] items-center">
                              {rule.keywords.length === 0 ? (
                                <span className="text-[11px] text-muted-foreground px-1">无匹配词</span>
                              ) : (
                                rule.keywords.map((kw, kwIdx) => (
                                  <Badge
                                    key={kwIdx}
                                    variant="secondary"
                                    className="text-[10px] pr-1 gap-1 py-0.5 hover:bg-secondary/10"
                                  >
                                    {kw}
                                    {!selectedProfile.is_builtin && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveKeyword(idx, kwIdx)}
                                        className="h-3.5 w-3.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </Badge>
                                ))
                              )}
                            </div>
                            
                            {!selectedProfile.is_builtin && (
                              <div className="flex gap-2 max-w-xs">
                                <Input
                                  value={keywordInputs[idx] || ""}
                                  placeholder="输入单个词按 Add 添入"
                                  onChange={(e) => setKeywordInputs({ ...keywordInputs, [idx]: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === ",") {
                                      e.preventDefault();
                                      handleAddKeyword(idx);
                                    }
                                  }}
                                  className="h-7 text-xs flex-grow"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAddKeyword(idx)}
                                  className="h-7 text-[10px] px-2"
                                >
                                  添加
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-80 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground bg-card/20 p-8 text-center space-y-2">
              <FileCode2 className="h-10 w-10 opacity-40 text-primary" />
              <p className="font-semibold text-sm">暂无选中的规则集</p>
              <p className="text-xs opacity-80 max-w-sm">
                请在左侧列表中点击选择任一规则集。您也可以点击右上角的新建按钮来初始化一个自定义规则集。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* YAML Import / Export Modal */}
      {isYamlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-card border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b flex items-center justify-between bg-accent/20">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-5 w-5 text-primary" />
                <span className="font-semibold text-sm">YAML 代码面板</span>
              </div>
              <button
                onClick={() => setIsYamlModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {selectedProfile?.is_builtin ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-md text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>内置规则只读，下方为对应的 YAML 源码，只支持拷贝导出，不支持修改应用。</span>
                </div>
              ) : (
                <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 rounded-md text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>您可以直接在下方黏贴外部 YAML，点击下方「解析并应用」将其映射到左侧可视化编辑框中。</span>
                </div>
              )}

              {yamlError && (
                <pre className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-mono whitespace-pre-wrap">
                  {yamlError}
                </pre>
              )}

              <div className="space-y-1">
                <Label className="text-xs">YAML 内容</Label>
                <textarea
                  value={yamlContent}
                  disabled={selectedProfile?.is_builtin}
                  onChange={(e) => setYamlContent(e.target.value)}
                  className="w-full h-80 font-mono text-xs p-3 rounded-md border border-input bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={`rules:\n  - id: GCC-A1\n    text: Description\n    keywords: [keyword1]\n    source: github-api`}
                />
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-between bg-accent/10">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyToClipboard} className="gap-1">
                <Clipboard className="h-3.5 w-3.5" /> 拷贝至剪贴板
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsYamlModalOpen(false)}>
                  关闭
                </Button>
                {!selectedProfile?.is_builtin && (
                  <Button type="button" size="sm" onClick={handleApplyYaml} className="bg-primary text-primary-foreground">
                    解析并应用
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/*
__ai_context__
本组件为规则集管理（Profiles）的可视化在线编辑页面，支持规则集的增删改查、关键字 Tag 细化、
指定 Source 过滤、以及基于 Rust 后端 serde_yaml 的物理 YAML 在线批量解析导入与复制导出。
*/

// [For Future AI]
// 1. Key assumptions made:
//    - Custom profiles save to app_data_dir/profiles/{name}.yaml.
//    - Duplicated rule IDs inside a profile are rejected before saving.
//    - Profile name input only allows a-z, A-Z, 0-9, dash(-), and underscore(_) to prevent path traversal on Rust fs side.
// 2. Potential edge cases to watch:
//    - Saving an empty list of rules is forbidden.
//    - Editing the YAML via the Modal parses and applies in-memory, but requires clicking "保存规则集" to commit on disk.
// 3. Dependencies on other modules:
//    - Tauri IPC api.ts: listProfiles, saveProfile, deleteProfile, rulesToYaml, yamlToRules.
//    - Zustand store: useStore hooks.

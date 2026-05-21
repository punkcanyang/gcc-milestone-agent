import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Settings,
  Save,
  FolderOpen,
  Key,
  Github,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Download,
  Upload,
} from "lucide-react";
import { save as saveFileDialog, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../lib/store";
import * as api from "../lib/api";
import type { AppConfig } from "../lib/types";

export default function SettingsPage() {
  const { config, loadConfig, saveConfig, loadProjects } = useStore();
  const [form, setForm] = useState<AppConfig>({
    reports_dir: "reports",
    github_token: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config) {
      setForm(config);
    }
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");

    try {
      await saveConfig(form);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error) {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const [isDbBackuping, setIsDbBackuping] = useState(false);
  const [isDbRestoring, setIsDbRestoring] = useState(false);

  const handleBackupDb = async () => {
    setIsDbBackuping(true);
    try {
      const destPath = await saveFileDialog({
        filters: [{
          name: "SQLite Database",
          extensions: ["db"]
        }],
        defaultPath: "milestones_backup.db"
      });
      if (destPath) {
        await api.backupDatabase(destPath);
        alert("数据库备份导出成功！");
      }
    } catch (error) {
      console.error("Backup DB failed:", error);
      alert("数据库备份失败: " + String(error));
    } finally {
      setIsDbBackuping(false);
    }
  };

  const handleRestoreDb = async () => {
    setIsDbRestoring(true);
    try {
      const srcPath = await openFileDialog({
        filters: [{
          name: "SQLite Database",
          extensions: ["db"]
        }],
        multiple: false
      });
      if (srcPath && typeof srcPath === "string") {
        const confirmRestore = confirm(
          "⚠️ 警告: 恢复备份将会覆盖当前的数据库文件，该操作不可逆，您的现有数据将会被全部替换！\n\n确定要继续吗？"
        );
        if (confirmRestore) {
          await api.restoreDatabase(srcPath);
          await loadProjects();
          alert("数据库还原成功！");
        }
      }
    } catch (error) {
      console.error("Restore DB failed:", error);
      alert("数据库还原失败: " + String(error));
    } finally {
      setIsDbRestoring(false);
    }
  };


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your GCC Milestone Agent
        </p>
      </div>

      {/* GitHub Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Configuration
          </CardTitle>
          <CardDescription>
            Configure GitHub API access for higher rate limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github_token" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              GitHub Personal Access Token
            </Label>
            <Input
              id="github_token"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={form.github_token || ""}
              onChange={(e) =>
                setForm({ ...form, github_token: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Optional. Increases API rate limit from 60 to 5000 requests/hour.
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="ml-1 text-primary hover:underline"
              >
                Generate token →
              </a>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={form.github_token ? "default" : "secondary"}>
              {form.github_token ? "Token configured" : "No token"}
            </Badge>
            {!form.github_token && (
              <span className="text-sm text-muted-foreground">
                Using unauthenticated access (60 req/hr)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Storage Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Storage Configuration
          </CardTitle>
          <CardDescription>
            Configure where reports are stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reports_dir">Reports Directory</Label>
            <Input
              id="reports_dir"
              placeholder="reports"
              value={form.reports_dir}
              onChange={(e) =>
                setForm({ ...form, reports_dir: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Relative path for storing verification reports
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Database Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Maintenance
          </CardTitle>
          <CardDescription>
            Backup your projects data or restore from an existing database file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All your projects, milestone phases configuration, and historical runs are stored in a local SQLite database.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button
              variant="outline"
              onClick={handleBackupDb}
              disabled={isDbBackuping}
              className="flex items-center gap-2"
            >
              {isDbBackuping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Backup Database
            </Button>
            <Button
              variant="outline"
              onClick={handleRestoreDb}
              disabled={isDbRestoring}
              className="flex items-center gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isDbRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Restore Backup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>GCC Milestone Agent</strong> v0.1.0
            </p>
            <p>
              CLI agent for GCC milestone verification using multi-source evidence
              and rule evaluation.
            </p>
            <p>
              <a
                href="https://github.com/gcc-foundation/gcc-milestone-agent"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                GitHub Repository →
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>

        {saveStatus === "success" && (
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">Settings saved successfully</span>
          </div>
        )}

        {saveStatus === "error" && (
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to save settings</span>
          </div>
        )}
      </div>
    </div>
  );
}

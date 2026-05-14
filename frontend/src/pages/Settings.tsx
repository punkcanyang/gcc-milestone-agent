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
} from "lucide-react";
import { useStore } from "../lib/store";
import type { AppConfig } from "../lib/types";

export default function SettingsPage() {
  const { config, loadConfig, saveConfig } = useStore();
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

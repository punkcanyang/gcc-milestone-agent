import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { PlayCircle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useStore } from "../lib/store";
import type { VerificationRequest } from "../lib/types";

export default function NewVerification() {
  const navigate = useNavigate();
  const { isRunning, lastResult, runVerification } = useStore();
  const [form, setForm] = useState<VerificationRequest>({
    repo: "",
    milestone: "",
    since: "",
    profile: "",
    providers: "github-api",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await runVerification({
      ...form,
      since: form.since || undefined,
      profile: form.profile || undefined,
      providers: form.providers || undefined,
    });

    if (result.success) {
      // Navigate to history after a short delay
      setTimeout(() => navigate("/history"), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Verification</h1>
        <p className="text-muted-foreground">
          Create a new milestone verification task
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verification Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="repo">Repository (owner/name) *</Label>
              <Input
                id="repo"
                placeholder="gcc-foundation/gcc-openclaw-grants"
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="milestone">Milestone Definition *</Label>
              <Textarea
                id="milestone"
                placeholder="Enter milestone goals, comma or newline separated..."
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
                <Label htmlFor="since">Since Date (optional)</Label>
                <Input
                  id="since"
                  type="date"
                  value={form.since}
                  onChange={(e) => setForm({ ...form, since: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile">Profile (optional)</Label>
                <Input
                  id="profile"
                  placeholder="gcc-allocation"
                  value={form.profile}
                  onChange={(e) =>
                    setForm({ ...form, profile: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="providers">Providers (comma-separated)</Label>
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
                  Running Verification...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Run Verification
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Verification Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Badge variant={lastResult.success ? "default" : "destructive"}>
                  {lastResult.success ? "Success" : "Failed"}
                </Badge>
              </div>
              <p className="text-sm">{lastResult.summary}</p>
              {lastResult.error && (
                <pre className="text-sm text-red-500 bg-red-50 p-4 rounded-md overflow-auto">
                  {lastResult.error}
                </pre>
              )}
              {lastResult.report_path && (
                <p className="text-sm text-muted-foreground">
                  Report saved to: {lastResult.report_path}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

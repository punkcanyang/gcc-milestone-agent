import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Tag,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { useStore } from "../lib/store";
import { LoadingPage } from "../components/ui/loading";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "met":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "partially_met":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    case "not_met":
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive"> = {
    met: "default",
    partially_met: "secondary",
    not_met: "destructive",
  };
  return (
    <Badge variant={variants[status] || "default"}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export default function ReportViewer() {
  const { id } = useParams<{ id: string }>();
  const { currentReport, currentReportMarkdown, isLoadingReport, loadReport } =
    useStore();

  useEffect(() => {
    if (id) {
      loadReport(id);
    }
  }, [id, loadReport]);

  if (isLoadingReport) {
    return <LoadingPage message="Loading report..." />;
  }

  if (!currentReport && !currentReportMarkdown) {
    return (
      <div className="text-center py-16">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-lg font-medium">Report not found</p>
        <p className="text-muted-foreground mb-4">
          The report you're looking for doesn't exist or has been deleted.
        </p>
        <Link to="/history">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to History
          </Button>
        </Link>
      </div>
    );
  }

  const report = currentReport;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/history"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to History
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-2">
            Report Viewer
          </h1>
          <p className="text-muted-foreground">
            {report?.repo || "Unknown repository"}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {report && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <StatusIcon status={report.status} />
              </CardHeader>
              <CardContent>
                <StatusBadge status={report.status} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Score</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.score}/100</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Rule Pass Rate
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {report.rulePassRate}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Provider Bonus
                </CardTitle>
                <Tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  +{report.providerBonus}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Evidence Counts */}
          <Card>
            <CardHeader>
              <CardTitle>Evidence Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex items-center gap-3">
                  <GitCommit className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Commits</p>
                    <p className="text-lg font-semibold">
                      {report.evidenceCounts.commits}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <GitPullRequest className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pull Requests
                    </p>
                    <p className="text-lg font-semibold">
                      {report.evidenceCounts.pulls}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Issues</p>
                    <p className="text-lg font-semibold">
                      {report.evidenceCounts.issues}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Releases</p>
                    <p className="text-lg font-semibold">
                      {report.evidenceCounts.releases}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rules */}
          <Card>
            <CardHeader>
              <CardTitle>Rule Evaluation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {report.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon
                        status={rule.result.semantic.verdict}
                      />
                      <div>
                        <p className="font-medium">{rule.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {rule.text}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Confidence
                        </p>
                        <p className="font-semibold">
                          {rule.result.semantic.confidence}%
                        </p>
                      </div>
                      <StatusBadge
                        status={rule.result.semantic.verdict}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Evidence Links */}
          {report.evidenceLinks && (
            <Card>
              <CardHeader>
                <CardTitle>Evidence Links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.evidenceLinks.commits.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Commits</h4>
                      <ul className="space-y-1">
                        {report.evidenceLinks.commits.map((url, i) => (
                          <li key={i}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {url.split("/").pop()}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.evidenceLinks.pulls.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Pull Requests</h4>
                      <ul className="space-y-1">
                        {report.evidenceLinks.pulls.map((url, i) => (
                          <li key={i}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {url.split("/").pop()}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.evidenceLinks.issues.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Issues</h4>
                      <ul className="space-y-1">
                        {report.evidenceLinks.issues.map((url, i) => (
                          <li key={i}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {url.split("/").pop()}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Raw Markdown */}
      {currentReportMarkdown && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Report</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md overflow-auto max-h-96">
              {currentReportMarkdown}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

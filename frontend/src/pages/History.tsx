import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  History as HistoryIcon,
  ExternalLink,
  Trash2,
  FileText,
} from "lucide-react";
import { useStore } from "../lib/store";
import { LoadingPage } from "../components/ui/loading";

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

export default function History() {
  const { reports, isLoadingReports, loadReports, deleteReport } = useStore();

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this report?")) {
      await deleteReport(id);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="text-muted-foreground">
            View past verification reports
          </p>
        </div>
        <Link to="/new">
          <Button>New Verification</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5" />
            All Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingReports ? (
            <LoadingPage message="Loading history..." />
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No reports yet</p>
              <p className="text-sm">Run your first verification to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{report.repo}</p>
                    <p className="text-sm text-muted-foreground">
                      {report.milestone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(report.date).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold">{report.score}</p>
                    </div>
                    <StatusBadge status={report.status} />
                    <div className="flex gap-2">
                      <Link to={`/report/${report.id}`}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(report.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

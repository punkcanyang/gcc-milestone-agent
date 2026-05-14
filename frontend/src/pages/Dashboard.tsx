import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Loader2,
  PlusCircle,
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

// Mock trend data - in real app this would be calculated from reports
const trendData = [
  { date: "Week 1", score: 45 },
  { date: "Week 2", score: 52 },
  { date: "Week 3", score: 68 },
  { date: "Week 4", score: 75 },
  { date: "Week 5", score: 82 },
  { date: "Week 6", score: 78 },
  { date: "Week 7", score: 85 },
];

const COLORS = {
  met: "#22c55e",
  partially_met: "#f59e0b",
  not_met: "#ef4444",
};

export default function Dashboard() {
  const { reports, isLoadingReports, loadReports } = useStore();

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Calculate stats
  const totalReports = reports.length;
  const passedReports = reports.filter((r) => r.status === "met").length;
  const partialReports = reports.filter((r) => r.status === "partially_met").length;
  const failedReports = reports.filter((r) => r.status === "not_met").length;
  const passRate = totalReports > 0 ? Math.round((passedReports / totalReports) * 100) : 0;
  const avgScore =
    totalReports > 0
      ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / totalReports)
      : 0;
  const recentReports = reports.slice(0, 5);

  const stats = [
    { name: "Total Reports", value: totalReports.toString(), icon: FileText, color: "text-blue-500" },
    { name: "Pass Rate", value: `${passRate}%`, icon: CheckCircle2, color: "text-green-500" },
    { name: "Avg Score", value: avgScore.toString(), icon: TrendingUp, color: "text-purple-500" },
    { name: "Pending", value: "0", icon: Clock, color: "text-orange-500" },
  ];

  // Pie chart data
  const pieData = [
    { name: "Met", value: passedReports, color: COLORS.met },
    { name: "Partially Met", value: partialReports, color: COLORS.partially_met },
    { name: "Not Met", value: failedReports, color: COLORS.not_met },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of milestone verification activities
          </p>
        </div>
        <Link to="/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Verification
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Score Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis domain={[0, 100]} className="text-xs" />
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
                    dot={{ fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
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
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingReports ? (
            <LoadingPage message="Loading dashboard..." />
          ) : recentReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No reports yet</p>
              <p className="text-sm">Run your first verification to get started</p>
              <Link to="/new">
                <Button variant="outline" className="mt-4">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Verification
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {recentReports.map((report) => (
                <Link
                  key={report.id}
                  to={`/report/${report.id}`}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{report.repo}</p>
                    <p className="text-sm text-muted-foreground">
                      {report.milestone}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold">{report.score}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(report.date).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={report.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

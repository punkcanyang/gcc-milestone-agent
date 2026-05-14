import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import {
  LayoutDashboard,
  PlusCircle,
  History,
  FileText,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "New Verification", href: "/new", icon: PlusCircle },
  { name: "History", href: "/history", icon: History },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-16 items-center justify-between border-b px-6">
          <div className="flex items-center">
            <FileText className="h-6 w-6 text-primary" />
            <span className="ml-2 text-lg font-semibold">GCC Milestone</span>
          </div>
          <ThemeToggle />
        </div>
        <nav className="space-y-1 p-4">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

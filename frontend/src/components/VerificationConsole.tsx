import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { Terminal, Trash2, Copy, X, CornerDownRight } from "lucide-react";
import { Button } from "./ui/button";

interface VerificationConsoleProps {
  onClose: () => void;
  isOpen: boolean;
}

export default function VerificationConsole({ onClose, isOpen }: VerificationConsoleProps) {
  const { verificationLogs, clearLogs, isRunning } = useStore();
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new logs arrive
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [verificationLogs]);

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    const rawText = verificationLogs.map((l) => `[${l.stream.toUpperCase()}] ${l.line}`).join("\n");
    navigator.clipboard.writeText(rawText);
    alert("Logs copied to clipboard!");
  };

  const getLogColorClass = (line: string, stream: string) => {
    if (stream === "stderr") return "text-red-400 font-semibold";
    const lower = line.toLowerCase();
    if (lower.includes("error") || lower.includes("failed")) return "text-red-400 font-semibold";
    if (lower.includes("warning")) return "text-yellow-400";
    if (lower.includes("success") || lower.includes("pass")) return "text-green-400 font-semibold";
    if (lower.startsWith("[github-api]")) return "text-blue-300";
    if (lower.startsWith("[community-health]")) return "text-purple-300";
    if (lower.startsWith("[rule-engine]")) return "text-cyan-300";
    if (lower.startsWith("[community-health]")) return "text-indigo-300";
    return "text-slate-200";
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 h-[380px] border-t border-border bg-slate-950 shadow-2xl transition-all duration-300 ease-in-out flex flex-col">
      {/* Console Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-slate-300 select-none">
        <div className="flex items-center gap-2 font-mono text-sm font-semibold">
          <Terminal className="h-4 w-4 text-primary animate-pulse" />
          <span>Milestone Verification Live Console</span>
          {isRunning && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyLogs}
            disabled={verificationLogs.length === 0}
            className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Copy Logs"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearLogs}
            disabled={verificationLogs.length === 0}
            className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Clear Logs"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-slate-800" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
        {verificationLogs.length === 0 ? (
          <div className="text-slate-500 h-full flex flex-col items-center justify-center gap-2">
            <CornerDownRight className="h-5 w-5 animate-bounce" />
            <span>No verification process running. Run a check to view output here.</span>
          </div>
        ) : (
          verificationLogs.map((log, index) => (
            <div key={index} className="flex gap-2 leading-relaxed break-all">
              <span className="text-slate-600 select-none">
                {String(index + 1).padStart(3, "0")}
              </span>
              <span className={getLogColorClass(log.line, log.stream)}>
                {log.line}
              </span>
            </div>
          ))
        )}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
}

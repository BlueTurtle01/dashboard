import { PlanWarning } from "@/lib/planner/types";

function warningStyles(severity?: string) {
  switch (severity) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-900";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "info":
    default:
      return "border-amber-300 bg-amber-50 text-amber-900";
  }
}

// Type guard for old-style warnings
function isOldWarning(warning: any): warning is PlanWarning & { code: string; title: string; severity: string } {
  return "code" in warning && "title" in warning;
}

export default function WarningList({ warnings }: { warnings: any[] }) {
  return (
    <div className="space-y-4">
      {warnings.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">
          No warnings for this plan.
        </div>
      ) : (
        warnings.map((warning, index) => {
          // Handle both old and new warning formats
          const key = isOldWarning(warning) ? warning.code : `${warning.type}-${index}`;
          const severity = isOldWarning(warning) ? warning.severity : "warning";
          const title = isOldWarning(warning) ? warning.title : `${warning.type.replace(/_/g, " ").toUpperCase()}`;
          const message = warning.message || warning.description || "";

          return (
            <div
              key={key}
              className={`rounded-2xl border px-5 py-4 ${warningStyles(severity)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6">{message}</p>
                  {isOldWarning(warning) && warning.suggestion ? (
                    <p className="mt-3 text-sm font-medium">
                      Suggestion: {warning.suggestion}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full border border-current/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  {severity}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

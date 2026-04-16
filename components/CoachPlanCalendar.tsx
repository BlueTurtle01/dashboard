
"use client";

import Link from "next/link";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function getSessionStyle(session: PlanSession) {
  switch (session.type) {
    case "Long":
      return "border-blue-300 bg-blue-50 text-blue-900";
    case "Steady":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "Recovery":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "Gym":
      return "border-violet-300 bg-violet-50 text-violet-900";
    case "Rest":
      return "border-zinc-300 bg-zinc-100 text-zinc-700";
    case "Easy":
    default:
      return "border-zinc-300 bg-white text-zinc-900";
  }
}

export default function CoachPlanCalendar({ plan }: { plan: GeneratedPlan }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[140px_repeat(7,minmax(120px,1fr))] gap-0 border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="bg-zinc-100 border-r border-b border-zinc-200 p-3 text-sm font-semibold text-zinc-700">
            Week
          </div>

          {DAYS.map((day) => (
            <div
              key={day}
              className="bg-zinc-100 border-b border-zinc-200 p-3 text-center text-sm font-semibold text-zinc-700"
            >
              {day}
            </div>
          ))}

          {plan.weeks.map((week) => (
            <>
              <div
                key={`${week.id}-week-label`}
                className="border-r border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="text-sm font-semibold text-zinc-900">Week {week.weekNumber}</div>
                <div className="mt-1 text-xs text-zinc-500">{week.phase}</div>
                {week.isHolidayWeek ? (
                  <div className="mt-2 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
                    Holiday
                  </div>
                ) : null}
              </div>

              {DAYS.map((day) => {
                const sessions = week.sessions.filter((session) => session.dayLabel === day);

                return (
                  <div
                    key={`${week.id}-${day}`}
                    className="min-h-[150px] border-l border-t border-zinc-200 bg-white p-2"
                  >
                    <div className="flex h-full flex-col gap-2">
                      {sessions.length === 0 ? (
                        <div className="text-xs text-zinc-300">—</div>
                      ) : (
                        sessions.map((session) => (
                          <Link
                            key={session.id}
                            href={`/coach/session/${encodeURIComponent(session.id)}`}
                            className={`block rounded-xl border p-2 transition hover:shadow-sm ${getSessionStyle(session)}`}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-wide">
                              {session.type}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-5">
                              {session.name || "Untitled Session"}
                            </div>
                            <div className="mt-1 text-[11px] opacity-75">
                              {session.duration || "—"}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

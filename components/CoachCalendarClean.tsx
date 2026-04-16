
"use client";

import Link from "next/link";
import { GeneratedPlan } from "@/lib/planner/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CoachCalendarClean({ plan }: { plan: GeneratedPlan }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">

        {/* Header */}
        <div className="grid grid-cols-8">
          <div className="p-3 font-semibold">Week</div>
          {DAYS.map((d) => (
            <div key={d} className="p-3 font-semibold text-center border-l">
              {d}
            </div>
          ))}
        </div>

        {/* Body */}
        {plan.weeks.map((week) => (
          <div key={week.id} className="grid grid-cols-8 border-t">

            {/* Week label */}
            <div className="p-3 border-r">
              <div className="font-semibold">Week {week.weekNumber}</div>
              <div className="text-xs text-gray-500">{week.phase}</div>
            </div>

            {/* Days */}
            {DAYS.map((day) => {
              const sessions = week.sessions.filter(s => s.dayLabel === day);

              return (
                <div key={week.id + day} className="border-l p-2 min-h-[100px]">
                  {sessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/coach/session/${s.id}`}
                      className="block border rounded p-2 mb-2 text-xs hover:bg-gray-100"
                    >
                      <div className="font-semibold">{s.type}</div>
                      <div>{s.name}</div>
                      <div className="text-gray-500">{s.duration}</div>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ))}

      </div>
    </div>
  );
}

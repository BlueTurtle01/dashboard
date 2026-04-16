"use client";

import { WeekEntry } from "@/lib/planner/planNarrative";

type HolidayWithEquipment = {
  id: string;
  title: string;
  start: string;
  end: string;
  equipmentUnavailable: string[];
};

type TrainingCamp = {
  id: string;
  title: string;
  start: string;
  end: string;
};

const MILESTONE_COLOURS: Record<string, { bg: string; text: string; dot: string }> = {
  "Race Week":         { bg: "#fed7aa", text: "#92400e", dot: "#f97316" },
  "Prep race":         { bg: "#fed7aa", text: "#92400e", dot: "#f97316" },
  "Taper begins":      { bg: "#fef3c7", text: "#78350f", dot: "#f59e0b" },
  "Pack carrying begins": { bg: "#fde68a", text: "#78350f", dot: "#d97706" },
  "Back-to-back block": { bg: "#fde68a", text: "#78350f", dot: "#d97706" },
  "Peak training":     { bg: "#dbeafe", text: "#1e3a5f", dot: "#3b82f6" },
  "Build phase":       { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  "Terrain recce":     { bg: "#bbf7d0", text: "#14532d", dot: "#22c55e" },
  "Navigation training": { bg: "#bfdbfe", text: "#1e3a8a", dot: "#60a5fa" },
  "Heat acclimation block": { bg: "#fecaca", text: "#7f1d1d", dot: "#ef4444" },
  "Recovery week":     { bg: "#f3f4f6", text: "#374151", dot: "#9ca3af" },
  "Holiday":           { bg: "#e0e7ff", text: "#3730a3", dot: "#6366f1" },
  "Training Camp":     { bg: "#ede9fe", text: "#5b21b6", dot: "#a78bfa" },
};

function generateHolidaySummary(equipment: string[]): string {
  if (equipment.length === 0) {
    return "We've adjusted your training plan for this holiday period.";
  }

  const equipmentNames: Record<string, string> = {
    "gym": "gym facilities",
    "bicycle": "your bicycle",
    "swimming_pool": "swimming facilities",
  };

  const displayNames = equipment
    .map(eq => equipmentNames[eq] || eq)
    .join(" and ");

  if (equipment.includes("gym")) {
    return `We've ensured all sessions only use bodyweight exercises as you said you'd have no ${displayNames} access during your holiday.`;
  }

  if (equipment.includes("bicycle")) {
    return `We've replaced cycling sessions with running and strength training since you won't have access to your ${displayNames}.`;
  }

  if (equipment.includes("swimming_pool")) {
    return `We've adjusted your swimming sessions for this period as you won't have access to ${displayNames}.`;
  }

  return `We've adjusted your training plan to work around the ${displayNames} you won't have access to.`;
}

function getMilestoneColour(label: string) {
  const key = Object.keys(MILESTONE_COLOURS).find((k) => label.startsWith(k));
  return key ? MILESTONE_COLOURS[key] : { bg: "#f3f4f6", text: "#374151", dot: "#9ca3af" };
}

export default function PlanNarrativeView({ weeks, holidays = [], trainingCamps = [] }: { weeks: WeekEntry[]; holidays?: HolidayWithEquipment[]; trainingCamps?: TrainingCamp[] }) {
  // Create a combined timeline of weeks, holidays, and training camps
  const timeline: Array<{ type: 'week' | 'holiday' | 'training_camp'; data: WeekEntry | HolidayWithEquipment | TrainingCamp }> = [];

  // Add weeks
  weeks.forEach(week => {
    timeline.push({ type: 'week', data: week });
  });

  // Add holidays
  holidays.forEach(holiday => {
    timeline.push({ type: 'holiday', data: holiday });
  });

  // Add training camps
  trainingCamps.forEach(camp => {
    timeline.push({ type: 'training_camp', data: camp });
  });

  // Sort by week number (for weeks) or start date (for holidays/camps)
  timeline.sort((a, b) => {
    if (a.type === 'week' && b.type === 'week') {
      return (a.data as WeekEntry).weekNumber - (b.data as WeekEntry).weekNumber;
    }
    if ((a.type === 'holiday' || a.type === 'training_camp') && (b.type === 'holiday' || b.type === 'training_camp')) {
      const aStart = (a.data as HolidayWithEquipment | TrainingCamp).start;
      const bStart = (b.data as HolidayWithEquipment | TrainingCamp).start;
      return aStart.localeCompare(bStart);
    }
    // Compare week number to holiday/camp start date
    if (a.type === 'week' && (b.type === 'holiday' || b.type === 'training_camp')) {
      return (a.data as WeekEntry).weekNumber - parseInt((b.data as HolidayWithEquipment | TrainingCamp).start.split('-')[2] || '0');
    }
    return parseInt((a.data as HolidayWithEquipment | TrainingCamp).start.split('-')[2] || '0') - (b.data as WeekEntry).weekNumber;
  });

  if (weeks.length === 0 && holidays.length === 0 && trainingCamps.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">No plan weeks, holidays, or training camps to display.</p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div
        className="absolute left-[18px] top-0 bottom-0 w-px bg-zinc-200"
        aria-hidden
      />

      <ol className="space-y-1">
        {timeline.map((item) => {
          if (item.type === 'holiday') {
            const holiday = item.data as HolidayWithEquipment;
            const colour = MILESTONE_COLOURS["Holiday"];
            const summary = generateHolidaySummary(holiday.equipmentUnavailable);
            const startDate = new Date(holiday.start);
            const endDate = new Date(holiday.end);
            const dateRange = `${startDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;

            return (
              <li key={`holiday-${holiday.id}`} className="relative pl-12 py-3">
                {/* Dot */}
                <span
                  className="absolute left-[11px] top-[18px] h-4 w-4 rounded-full border-2 border-white"
                  style={{ background: colour.dot }}
                  aria-hidden
                />

                {/* Holiday badge + title */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block rounded-full px-3 py-0.5 text-xs font-bold"
                    style={{ background: colour.bg, color: colour.text }}
                  >
                    {holiday.title}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {dateRange}
                  </span>
                </div>

                {/* Summary */}
                <p className="mt-2 text-sm text-zinc-700 leading-relaxed max-w-2xl">
                  {summary}
                </p>
              </li>
            );
          }

          if (item.type === 'training_camp') {
            const camp = item.data as TrainingCamp;
            const colour = MILESTONE_COLOURS["Training Camp"];
            const startDate = new Date(camp.start);
            const endDate = new Date(camp.end);
            const dateRange = `${startDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;

            return (
              <li key={`camp-${camp.id}`} className="relative pl-12 py-3">
                {/* Dot */}
                <span
                  className="absolute left-[11px] top-[18px] h-4 w-4 rounded-full border-2 border-white"
                  style={{ background: colour.dot }}
                  aria-hidden
                />

                {/* Training Camp badge + title */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block rounded-full px-3 py-0.5 text-xs font-bold"
                    style={{ background: colour.bg, color: colour.text }}
                  >
                    {camp.title}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {dateRange}
                  </span>
                </div>

                {/* Summary */}
                <p className="mt-2 text-sm text-zinc-700 leading-relaxed max-w-2xl">
                  Dedicated training block with elevated focus and intensity.
                </p>
              </li>
            );
          }

          const week = item.data as WeekEntry;
          if (week.milestone) {
            const colour = getMilestoneColour(week.milestone.label);
            return (
              <li key={week.weekNumber} className="relative pl-12 py-3">
                {/* Dot */}
                <span
                  className="absolute left-[11px] top-[18px] h-4 w-4 rounded-full border-2 border-white"
                  style={{ background: colour.dot }}
                  aria-hidden
                />

                {/* Week number */}
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Week {week.weekNumber}
                </span>

                {/* Milestone badge + label */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block rounded-full px-3 py-0.5 text-xs font-bold"
                    style={{ background: colour.bg, color: colour.text }}
                  >
                    {week.milestone.label}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {week.phase} · {week.sessionCount} session{week.sessionCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Commentary */}
                <p className="mt-2 text-sm text-zinc-700 leading-relaxed max-w-2xl">
                  {week.milestone.commentary}
                </p>
              </li>
            );
          }

          // Non-milestone: compact single row
          return (
            <li key={week.weekNumber} className="relative pl-12 py-1.5">
              {/* Small dot */}
              <span
                className="absolute left-[14px] top-[10px] h-2 w-2 rounded-full bg-zinc-300"
                aria-hidden
              />
              <span className="text-sm text-zinc-500">
                <span className="font-medium text-zinc-700">Week {week.weekNumber}</span>
                {" · "}
                {week.phase}
                {" · "}
                {week.sessionCount} session{week.sessionCount !== 1 ? "s" : ""}
                {week.sessionTypes.length > 0 && (
                  <span className="text-zinc-400">
                    {" — "}
                    {week.sessionTypes.join(", ")}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

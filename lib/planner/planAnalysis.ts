import { GeneratedPlan, PlanSession, PlanWeek } from "./types";

export type WeekLoadSummary = {
  totalSessions: number;
  totalMinutes: number;
  demandingCount: number;
  loadLabel: "Low" | "Moderate" | "High";
};

export type SessionInsight = {
  sessionId: string;
  severity: "info" | "warning";
  message: string;
};

export type WeekInsight = {
  weekId: string;
  severity: "info" | "warning";
  message: string;
};

export type PlanInsights = {
  weekSummaries: Record<string, WeekLoadSummary>;
  sessionInsights: SessionInsight[];
  weekInsights: WeekInsight[];
};

export type PlanComparison = {
  sessionDelta: number;
  minuteDelta: number;
  weekCountDelta: number;
  changedWeeks: number;
};

function parseMinutes(duration: string | undefined) {
  const match = (duration ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function isDemanding(session: PlanSession) {
  return (
    session.type === "Long" ||
    session.type === "Steady" ||
    session.type === "Loaded" ||
    session.type === "Recce" ||
    session.isKeySession
  );
}

export function calculateWeekLoadSummary(week: PlanWeek): WeekLoadSummary {
  const totalSessions = week.sessions.length;
  const totalMinutes = week.sessions.reduce((sum, session) => sum + parseMinutes(session.duration), 0);
  const demandingCount = week.sessions.filter(isDemanding).length;

  const loadLabel =
    totalMinutes >= 240 || demandingCount >= 3
      ? "High"
      : totalMinutes >= 150 || demandingCount >= 2
      ? "Moderate"
      : "Low";

  return {
    totalSessions,
    totalMinutes,
    demandingCount,
    loadLabel,
  };
}

export function analysePlan(plan: GeneratedPlan): PlanInsights {
  const weekSummaries: Record<string, WeekLoadSummary> = {};
  const sessionInsights: SessionInsight[] = [];
  const weekInsights: WeekInsight[] = [];

  const weeks = [...plan.weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  for (let i = 0; i < weeks.length; i += 1) {
    const week = weeks[i];
    const summary = calculateWeekLoadSummary(week);
    weekSummaries[week.id] = summary;

    if (week.phase === "Peak" && !week.sessions.some((session) => session.type === "Long")) {
      weekInsights.push({
        weekId: week.id,
        severity: "warning",
        message: "Peak week has no long session.",
      });
    }

    if (week.phase === "Taper" && summary.demandingCount >= 2) {
      weekInsights.push({
        weekId: week.id,
        severity: "warning",
        message: "Taper week still looks demanding.",
      });
    }

    if (week.isHolidayWeek && summary.demandingCount >= 2) {
      weekInsights.push({
        weekId: week.id,
        severity: "info",
        message: "Holiday week still has demanding work.",
      });
    }

    const hardSessionsSorted = [...week.sessions]
      .filter(isDemanding)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const isBackToBackBlock = week.trainingPurpose === "Back-to-Back Block";
    for (let j = 1; j < hardSessionsSorted.length; j += 1) {
      const previous = hardSessionsSorted[j - 1];
      const current = hardSessionsSorted[j];
      if (current.sortOrder - previous.sortOrder === 1) {
        sessionInsights.push({
          sessionId: current.id,
          severity: isBackToBackBlock ? "info" : "warning",
          message: isBackToBackBlock
            ? "Consecutive demanding sessions (intentional back-to-back block)."
            : "Demanding session follows another demanding session.",
        });
      }
    }

    const longSessions = week.sessions.filter((session) => session.type === "Long");
    longSessions.forEach((session) => {
      if (session.sortOrder >= 5) {
        sessionInsights.push({
          sessionId: session.id,
          severity: "info",
          message: "Long session sits late in the week.",
        });
      }
    });

    const gymSessions = week.sessions.filter((session) => session.type === "Gym");
    gymSessions.forEach((gymSession) => {
      const laterLong = week.sessions.find(
        (session) => session.type === "Long" && session.sortOrder === gymSession.sortOrder + 1
      );
      if (laterLong) {
        sessionInsights.push({
          sessionId: gymSession.id,
          severity: "info",
          message: "Gym session immediately before a long session.",
        });
      }
    });

    if (i > 0) {
      const previousSummary = weekSummaries[weeks[i - 1].id];
      if (previousSummary.totalMinutes > 0) {
        const jump = (summary.totalMinutes - previousSummary.totalMinutes) / previousSummary.totalMinutes;
        if (jump > 0.3) {
          weekInsights.push({
            weekId: week.id,
            severity: "warning",
            message: "Weekly duration jumps more than 30% from the previous week.",
          });
        }
      }
    }
  }

  return {
    weekSummaries,
    sessionInsights,
    weekInsights,
  };
}

function getPlanTotalMinutes(plan: GeneratedPlan) {
  return plan.weeks.reduce(
    (sum, week) => sum + week.sessions.reduce((acc, session) => acc + parseMinutes(session.duration), 0),
    0
  );
}

function getPlanSessionCount(plan: GeneratedPlan) {
  return plan.weeks.reduce((sum, week) => sum + week.sessions.length, 0);
}

export function comparePlans(current: GeneratedPlan, baseline: GeneratedPlan): PlanComparison {
  const currentWeeks = current.weeks.length;
  const baselineWeeks = baseline.weeks.length;

  const currentSessions = getPlanSessionCount(current);
  const baselineSessions = getPlanSessionCount(baseline);

  const currentMinutes = getPlanTotalMinutes(current);
  const baselineMinutes = getPlanTotalMinutes(baseline);

  const changedWeeks = current.weeks.reduce((sum, week) => {
    const other = baseline.weeks.find((item) => item.weekNumber === week.weekNumber);
    if (!other) return sum + 1;

    const currentSignature = week.sessions
      .map((session) => `${session.dayLabel}:${session.type}:${session.name}:${session.duration}`)
      .join("|");
    const otherSignature = other.sessions
      .map((session) => `${session.dayLabel}:${session.type}:${session.name}:${session.duration}`)
      .join("|");

    return currentSignature === otherSignature ? sum : sum + 1;
  }, 0);

  return {
    sessionDelta: currentSessions - baselineSessions,
    minuteDelta: currentMinutes - baselineMinutes,
    weekCountDelta: currentWeeks - baselineWeeks,
    changedWeeks,
  };
}

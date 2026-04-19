"use client";

import React from "react";
import Link from "next/link";
import { GeneratedPlan, PlanSession, PlanWeek } from "@/lib/planner/types";
import { calculateWeekLoadSummary, analysePlan } from "@/lib/planner/planAnalysis";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayLabel = (typeof DAYS)[number];

function getSessionColor(type: PlanSession["type"]) {
  switch (type) {
    case "Long":
      return "#dbeafe";
    case "Steady":
      return "#fef3c7";
    case "Recovery":
      return "#d1fae5";
    case "Gym":
      return "#ede9fe";
    case "Rest":
      return "#e5e7eb";
    case "Loaded":
      return "#fde68a";
    case "Recce":
      return "#bbf7d0";
    case "Navigation":
      return "#bfdbfe";
    case "Easy":
    default:
      return "#f8fafc";
  }
}

function getWeekWarning(week: PlanWeek) {
  const summary = calculateWeekLoadSummary(week);
  const hasLong = week.sessions.some((session) => session.type === "Long");

  if (week.phase === "Peak" && !hasLong) {
    return "Peak week has no long session";
  }

  if (week.phase === "Taper" && summary.demandingCount >= 2) {
    return "Taper week still looks demanding";
  }

  if (week.isHolidayWeek && summary.demandingCount >= 2) {
    return "Holiday week still has demanding work";
  }

  return "";
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMondayOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const jsDay = copy.getDay(); // Sun=0
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // Monday start
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date: Date, days: number) {
  if (isNaN(date.getTime())) {
    console.error("addDays called with invalid date:", date, "days:", days);
    return new Date(NaN);
  }
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getPlanWeekStartDates(plan: GeneratedPlan) {
  try {
    if (!plan.eventDate) {
      console.warn("Plan has no eventDate");
      return [];
    }

    // Try to parse the eventDate robustly
    let eventDate = new Date(plan.eventDate);

    // If parsing failed, try removing time component if present
    if (isNaN(eventDate.getTime()) && plan.eventDate.includes("T")) {
      const dateOnly = plan.eventDate.split("T")[0];
      eventDate = new Date(dateOnly);
    }

    if (isNaN(eventDate.getTime())) {
      console.error("Invalid eventDate format:", plan.eventDate);
      return [];
    }

    const eventWeekMonday = getMondayOfWeek(eventDate);
    if (isNaN(eventWeekMonday.getTime())) {
      console.error("Could not compute event week monday");
      return [];
    }

    // Validate weeksAvailable is a valid number
    const weeksAvailable = typeof plan.weeksAvailable === 'number' ? plan.weeksAvailable : plan.weeks?.length ?? 0;
    if (!weeksAvailable || weeksAvailable < 1) {
      console.warn("Plan has no weeksAvailable, using weeks array length:", plan.weeks?.length);
    }

    const firstWeekMonday = addDays(eventWeekMonday, -(Math.max(weeksAvailable - 1, 0) * 7));
    if (isNaN(firstWeekMonday.getTime())) {
      console.error("Could not compute first week monday", {
        eventWeekMonday: eventWeekMonday.toISOString(),
        weeksAvailable,
        daysToSubtract: -(Math.max(weeksAvailable - 1, 0) * 7),
      });
      return [];
    }

    return plan.weeks
      .slice()
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((week, index) => {
        const monday = addDays(firstWeekMonday, index * 7);
        return {
          weekId: week.id,
          monday: isNaN(monday.getTime()) ? new Date() : monday,
        };
      })
      .filter((w) => !isNaN(w.monday.getTime()));
  } catch (error) {
    console.error("Error computing plan week start dates:", error, plan);
    return [];
  }
}

function getCellDate(plan: GeneratedPlan, weekId: string, day: DayLabel) {
  try {
    const weekStarts = getPlanWeekStartDates(plan);
    if (weekStarts.length === 0) {
      console.warn("No week starts computed for plan");
      return "";
    }

    const found = weekStarts.find((item) => item.weekId === weekId);
    if (!found) return "";

    const dayIndex = DAYS.indexOf(day);
    if (dayIndex === -1) return "";

    const cellDate = addDays(found.monday, dayIndex);
    if (isNaN(cellDate.getTime())) {
      console.error("Invalid cell date computed");
      return "";
    }

    return toIsoDate(cellDate);
  } catch (error) {
    console.error("Error computing cell date:", error);
    return "";
  }
}

function getBlockedDates(): string[] {
  // loadAthleteProfile is async; blocked dates are managed at the page level
  return [];
}

function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  try {
    const d = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return d >= start && d <= end;
  } catch {
    return false;
  }
}

export default function CoachSessionGrid({
  plan,
  editable = true,
  enableSessionLinks = false,
  sessionLinkPrefix = "/coach/session/",
  onMoveSession,
  onCreateSession,
  onDuplicateSession,
  onDeleteSession,
  prepRaceMarkers,
  showRestDays = false,
  blockedDates: passedBlockedDates = [],
  holidayDateRanges = [],
  trainingCampDateRanges = [],
  completedSessionIds = new Set(),
}: {
  plan: GeneratedPlan;
  editable?: boolean;
  enableSessionLinks?: boolean;
  sessionLinkPrefix?: string;
  onMoveSession?: (sessionId: string, targetWeekId: string, targetDay: DayLabel) => void;
  onCreateSession?: (weekId: string, dayLabel: DayLabel) => void;
  onDuplicateSession?: (sessionId: string, weekId: string, dayLabel: DayLabel) => void;
  onDeleteSession?: (sessionId: string) => void;
  prepRaceMarkers?: Array<{ weekNumber: number; name: string; date: string }>;
  showRestDays?: boolean;
  blockedDates?: string[];
  holidayDateRanges?: Array<{ start: string; end: string }>;
  trainingCampDateRanges?: Array<{ start: string; end: string }>;
  completedSessionIds?: Set<string>;
}) {
  const insights = analysePlan(plan);
  const blockedDates = passedBlockedDates || [];
  const weekStarts = getPlanWeekStartDates(plan); // Cache to avoid recomputing

  // Map prep race markers by week-day for quick lookup
  const prepRacesByWeekDay = React.useMemo(() => {
    const map = new Map<string, { weekNumber: number; name: string; date: string }>();
    (prepRaceMarkers ?? []).forEach((marker) => {
      const raceDate = new Date(marker.date);
      const dayOfWeek = (raceDate.getDay() + 6) % 7; // Convert JS 0=Sun to Mon=0
      const key = `${marker.weekNumber}-${dayOfWeek}`;
      map.set(key, marker);
    });
    return map;
  }, [prepRaceMarkers]);

  // Check if a date is within any holiday range
  const isDateInHoliday = React.useCallback((date: string) => {
    return (holidayDateRanges ?? []).some((range) =>
      isDateInRange(date, range.start, range.end)
    );
  }, [holidayDateRanges]);

  // Check if a date is within any training camp range
  const isDateInTrainingCamp = React.useCallback((date: string) => {
    return (trainingCampDateRanges ?? []).some((range) =>
      isDateInRange(date, range.start, range.end)
    );
  }, [trainingCampDateRanges]);

  // If we couldn't compute week starts, show a helpful message
  if (weekStarts.length === 0 && plan.weeks.length > 0) {
    console.warn(
      "Could not compute week start dates. Plan eventDate:",
      plan.eventDate,
      "weeksAvailable:",
      plan.weeksAvailable
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "170px repeat(7, 1fr)",
          gap: "8px",
          minWidth: "1200px",
        }}
      >
        <div />
        {(() => {
          // Compute actual day headers from the first week's dates
          const weekStarts = getPlanWeekStartDates(plan);
          const firstWeek = weekStarts[0];
          const headerDays = firstWeek
            ? DAYS.map((_, idx) => {
                const date = addDays(firstWeek.monday, idx);
                const jsDay = date.getDay(); // 0=Sun, 1=Mon, etc.
                const actualDayIndex = (jsDay + 6) % 7; // Convert to Mon=0
                return DAYS[actualDayIndex];
              })
            : DAYS;

          return headerDays.map((day) => (
            <div
              key={day}
              style={{
                fontWeight: "bold",
                textAlign: "center",
                padding: "10px",
                background: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
              }}
            >
              {day}
            </div>
          ));
        })()}

        {(() => {
          const firstWeekStart = weekStarts[0];
          const daysBeforeMonday = firstWeekStart ? firstWeekStart.monday.getDay() - 1 : 0;
          return Array.from({ length: Math.max(0, daysBeforeMonday) }).map((_, idx) => (
            <div key={`empty-${idx}`} />
          ));
        })()}

        {plan.weeks.map((week) => {
          const summary = calculateWeekLoadSummary(week);
          const weekWarning = getWeekWarning(week);
          const weekBorder = weekWarning ? "2px solid #f59e0b" : "1px solid #d1d5db";

          return (
            <div key={week.id} style={{ display: "contents" }}>
              <div
                style={{
                  border: weekBorder,
                  borderRadius: "8px",
                  padding: "10px",
                  background: week.isHolidayWeek ? "#fef3c7" : "#f9fafb",
                }}
              >
                <div style={{ fontWeight: "bold" }}>Week {week.weekNumber}</div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                  {week.phase}
                </div>
                <div style={{ fontSize: "12px", color: "#374151", marginTop: "8px" }}>
                  {summary.totalSessions} sessions
                </div>
                <div style={{ fontSize: "12px", color: "#374151", marginTop: "2px" }}>
                  {summary.totalMinutes} min
                </div>
                <div style={{ fontSize: "12px", color: "#374151", marginTop: "2px" }}>
                  {summary.loadLabel} load
                </div>
                {weekWarning ? (
                  <div style={{ fontSize: "11px", marginTop: "8px", color: "#92400e" }}>
                    {weekWarning}
                  </div>
                ) : null}
              </div>

              {DAYS.map((day) => {
                const sessions = week.sessions.filter((s) => s.dayLabel === day);
                const cellDate = getCellDate(plan, week.id, day);
                const isBlocked = blockedDates.includes(cellDate);
                const isInHoliday = cellDate && isDateInHoliday(cellDate);
                const isInTrainingCamp = cellDate && isDateInTrainingCamp(cellDate);

                // Compute actual day of week from the cell date
                let displayDay = day;
                if (cellDate) {
                  const dateObj = new Date(cellDate);
                  if (!isNaN(dateObj.getTime())) {
                    const jsDay = dateObj.getDay(); // 0=Sun, 1=Mon, etc.
                    const actualDayIndex = (jsDay + 6) % 7; // Convert to Mon=0
                    displayDay = DAYS[actualDayIndex];
                  }
                }

                return (
                  <div
                    key={`${week.id}-${day}`}
                    onDragOver={(e) => {
                      if (!editable || !onMoveSession || isBlocked) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!editable || !onMoveSession || isBlocked) return;
                      e.preventDefault();
                      const sessionId = e.dataTransfer.getData("text/session-id");
                      if (sessionId) {
                        onMoveSession(sessionId, week.id, day);
                      }
                    }}
                    style={{
                      minHeight: "190px",
                      border: isBlocked
                        ? "2px solid #dc2626"
                        : weekWarning
                        ? "2px solid #fde68a"
                        : "1px solid #d1d5db",
                      borderRadius: "8px",
                      padding: "8px",
                      background: isBlocked ? "#fef2f2" : isInTrainingCamp ? "#ede9fe" : isInHoliday ? "#fef3c7" : "white",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", gap: "8px" }}>
                      <div>
                        <div style={{ fontSize: "11px", color: "#9ca3af" }}>{displayDay}</div>
                        <div style={{ fontSize: "11px", color: isBlocked ? "#b91c1c" : "#6b7280", marginTop: "2px" }}>
                          {cellDate || "—"}
                        </div>
                        {isInTrainingCamp && (
                          <div style={{ fontSize: "9px", color: "#7c3aed", marginTop: "4px", fontWeight: "600" }}>
                            Training Camp
                          </div>
                        )}
                        {isInHoliday && !isInTrainingCamp && (
                          <div style={{ fontSize: "9px", color: "#b45309", marginTop: "4px", fontWeight: "600" }}>
                            Holiday
                          </div>
                        )}
                      </div>

                      {editable && onCreateSession && !isBlocked ? (
                        <button
                          type="button"
                          onClick={() => onCreateSession(week.id, day)}
                          style={{
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            background: "#ffffff",
                            cursor: "pointer",
                            height: "fit-content",
                          }}
                        >
                          + Add
                        </button>
                      ) : null}
                    </div>


                    {/* Prep race badge if this day has one */}
                    {(() => {
                      const dayOfWeek = DAYS.indexOf(day);
                      const race = prepRacesByWeekDay.get(`${week.weekNumber}-${dayOfWeek}`);
                      if (!race) return null;
                      return (
                        <div
                          style={{
                            marginBottom: "8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            borderRadius: "9999px",
                            backgroundColor: "#fed7aa",
                            paddingLeft: "8px",
                            paddingRight: "8px",
                            paddingTop: "2px",
                            paddingBottom: "2px",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#92400e",
                          }}
                        >
                          Race: {race.name} — {new Date(race.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </div>
                      );
                    })()}

                    {sessions.length === 0 ? (
                      showRestDays ? (
                        <div
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            padding: "8px",
                            background: "#f9fafb",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>
                            {isBlocked ? "UNAVAILABLE" : "Rest"}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: "#9ca3af", fontSize: "12px" }}>—</div>
                      )
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {sessions.map((session) => {
                          const sessionInsight = insights.sessionInsights.find(
                            (item) => item.sessionId === session.id
                          );

                          return (
                            <div
                              key={session.id}
                              draggable={editable && !isBlocked}
                              onDragStart={(e) => {
                                if (!editable || isBlocked) return;
                                e.dataTransfer.setData("text/session-id", session.id);
                              }}
                              style={{
                                border: sessionInsight ? "2px solid #f59e0b" : "1px solid #cbd5e1",
                                borderRadius: "8px",
                                padding: "8px",
                                background: getSessionColor(session.type),
                                cursor: editable && !isBlocked ? "grab" : "default",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                <Link
                                  href={`${sessionLinkPrefix}${encodeURIComponent(session.id)}`}
                                  style={{
                                    display: "block",
                                    textDecoration: "none",
                                    color: "inherit",
                                    minWidth: 0,
                                    flex: 1,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    {session.type}
                                  </div>

                                  <div
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: 600,
                                      lineHeight: 1.3,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {session.name || "Untitled Session"}
                                    {(session as any).isInsertedAlternative && (
                                      <span style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        background: "#dbeafe",
                                        color: "#1e40af",
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        flexShrink: 0,
                                        border: "1px solid #93c5fd",
                                      }}>
                                        ALT
                                      </span>
                                    )}
                                    {completedSessionIds.has(session.id) && (
                                      <span style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "50%",
                                        background: "#10b981",
                                        color: "white",
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        flexShrink: 0,
                                      }}>
                                        ✓
                                      </span>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#6b7280",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {session.duration || "—"}
                                  </div>

                                  {sessionInsight ? (
                                    <div style={{ fontSize: "11px", color: "#92400e", marginTop: "6px" }}>
                                      {sessionInsight.message}
                                    </div>
                                  ) : null}
                                </Link>

                                {editable ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
                                    {onDuplicateSession && !isBlocked ? (
                                      <button
                                        type="button"
                                        onClick={() => onDuplicateSession(session.id, week.id, day)}
                                        style={{
                                          border: "1px solid #d1d5db",
                                          borderRadius: "6px",
                                          padding: "3px 6px",
                                          fontSize: "11px",
                                          background: "#ffffff",
                                          cursor: "pointer",
                                        }}
                                      >
                                        Copy
                                      </button>
                                    ) : null}

                                    {onDeleteSession ? (
                                      <button
                                        type="button"
                                        onClick={() => onDeleteSession(session.id)}
                                        style={{
                                          border: "1px solid #fca5a5",
                                          borderRadius: "6px",
                                          padding: "3px 6px",
                                          fontSize: "11px",
                                          background: "#ffffff",
                                          color: "#b91c1c",
                                          cursor: "pointer",
                                        }}
                                      >
                                        Delete
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Placeholder rows for weeks not yet built out */}
        {showRestDays && (() => {
          const builtWeeks = plan.weeks.length;
          const totalWeeks = plan.weeksAvailable ?? builtWeeks;
          const remainingCount = totalWeeks - builtWeeks;
          if (remainingCount <= 0) return null;

          return Array.from({ length: remainingCount }, (_, i) => {
            const weekNumber = builtWeeks + i + 1;
            return (
              <div key={`placeholder-${weekNumber}`} style={{ display: "contents" }}>
                <div
                  style={{
                    border: "1px dashed #d1d5db",
                    borderRadius: "8px",
                    padding: "10px",
                    background: "#f9fafb",
                  }}
                >
                  <div style={{ fontWeight: "bold", color: "#9ca3af" }}>Week {weekNumber}</div>
                  <div style={{ fontSize: "11px", color: "#d1d5db", marginTop: "4px", fontStyle: "italic" }}>
                    Coming soon
                  </div>
                </div>
                {DAYS.map((day) => (
                  <div
                    key={`placeholder-${weekNumber}-${day}`}
                    style={{
                      minHeight: "80px",
                      border: "1px dashed #e5e7eb",
                      borderRadius: "8px",
                      background: "#fafafa",
                    }}
                  />
                ))}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

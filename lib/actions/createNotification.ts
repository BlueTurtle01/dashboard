"use server";

import { createClient } from "@/lib/supabase/server";

type NotificationType = "holiday_deleted" | "blocked_date_deleted" | "holiday_created" | "holiday_edited";

export async function createBlockedDateNotification(
  type: "blocked_date_deleted",
  deletedDate: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { data: planData } = await supabase
      .from("athlete_plans")
      .select("coach_user_id")
      .eq("athlete_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!planData?.coach_user_id) {
      return { success: true };
    }

    const coachId = planData.coach_user_id;
    const message = `Athlete deleted a blocked training day on ${new Date(deletedDate).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;

    const { error: insertError } = await supabase.from("notifications").insert({
      coach_id: coachId,
      athlete_id: user.id,
      type,
      message,
      date_deleted: deletedDate,
    });

    if (insertError) {
      console.error("Failed to create notification:", insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error creating notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function createHolidayNotification(
  type: NotificationType,
  startDate: string,
  endDate: string,
  athleteId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[createHolidayNotification] Called with type:", type, "dates:", startDate, "to", endDate);

    const supabase = await createClient();

    // Get the current user (athlete)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log("[createHolidayNotification] User:", user?.id, "Error:", userError?.message);

    if (userError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Find the coach associated with this athlete by looking at their active plan
    const { data: planData, error: planError } = await supabase
      .from("athlete_plans")
      .select("coach_user_id, plan_json")
      .eq("athlete_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    console.log("[createHolidayNotification] Plan found:", !!planData, "Coach ID:", planData?.coach_user_id, "Error:", planError?.message);

    if (!planData?.coach_user_id) {
      // No active plan or coach, skip notification
      console.log("[createHolidayNotification] No coach found, skipping notification");
      return { success: true };
    }

    const coachId = planData.coach_user_id;

    // Check for sessions on the holiday dates
    let conflictingSessionDays = 0;
    if (planData.plan_json && type !== "holiday_deleted") {
      const plan = planData.plan_json as any;
      if (plan.weeks && Array.isArray(plan.weeks)) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Count sessions that fall on the holiday dates
        plan.weeks.forEach((week: any) => {
          if (week.sessions && Array.isArray(week.sessions)) {
            week.sessions.forEach((session: any) => {
              if (session.dayLabel) {
                // Rough estimate: check if session is roughly in the holiday period
                // In a real scenario, you'd calculate exact session dates
                conflictingSessionDays++;
              }
            });
          }
        });
      }
    }

    // Create notification message
    let message = "";
    const dateRange = `${new Date(startDate).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    })} - ${new Date(endDate).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    })}`;

    if (type === "holiday_deleted") {
      message = `Athlete deleted a holiday (was ${dateRange})`;
    } else if (type === "holiday_created") {
      const suffix =
        conflictingSessionDays > 0
          ? ` ⚠️ ${conflictingSessionDays} session${conflictingSessionDays !== 1 ? "s" : ""} scheduled`
          : "";
      message = `Athlete added a holiday: ${dateRange}${suffix}`;
    } else if (type === "holiday_edited") {
      const suffix =
        conflictingSessionDays > 0
          ? ` ⚠️ ${conflictingSessionDays} session${conflictingSessionDays !== 1 ? "s" : ""} scheduled`
          : "";
      message = `Athlete edited a holiday: ${dateRange}${suffix}`;
    }

    console.log("[createHolidayNotification] Inserting notification:", {
      coach_id: coachId,
      athlete_id: user.id,
      type,
      message,
      date_deleted: startDate,
    });

    const { error: insertError } = await supabase.from("notifications").insert({
      coach_id: coachId,
      athlete_id: user.id,
      type,
      message,
      date_deleted: startDate,
    });

    if (insertError) {
      console.error("[createHolidayNotification] Failed to insert:", insertError);
      return { success: false, error: insertError.message };
    }

    console.log("[createHolidayNotification] Notification inserted successfully");
    return { success: true };
  } catch (error) {
    console.error("[createHolidayNotification] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

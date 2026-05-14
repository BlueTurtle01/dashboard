import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedPlan } from "@/lib/planner/types";
import {
  buildGoogleCalendarEvent,
  findSessionInPlan,
  getValidGoogleCalendarAccessToken,
  insertGoogleCalendarEvent,
} from "@/lib/googleCalendar";

type RequestBody = {
  sessionId?: string;
  mode?: "single" | "all";
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const mode = body.mode ?? (body.sessionId ? "single" : "all");

    const { data: planRow, error: planError } = await supabase
      .from("athlete_plans")
      .select("id, plan_json")
      .eq("athlete_user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError || !planRow?.plan_json) {
      return NextResponse.json({ error: "No active plan found" }, { status: 404 });
    }

    const plan = planRow.plan_json as GeneratedPlan;
    const accessToken = await getValidGoogleCalendarAccessToken(user.id);

    const targets = [];
    if (mode === "single") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
      }

      const found = findSessionInPlan(plan, body.sessionId);
      if (!found) {
        return NextResponse.json({ error: "Session not found in active plan" }, { status: 404 });
      }
      targets.push(found);
    } else {
      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          if (session.type === "Rest") continue;
          targets.push({ week, session });
        }
      }
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: "No sessions to send" }, { status: 400 });
    }

    let createdCount = 0;
    const failures: Array<{ sessionId: string; message: string }> = [];

    for (const target of targets) {
      try {
        const event = buildGoogleCalendarEvent(plan, target.week, target.session);
        await insertGoogleCalendarEvent(accessToken, event);
        createdCount += 1;
      } catch (error) {
        failures.push({
          sessionId: target.session.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    if (createdCount === 0 && failures.length > 0) {
      return NextResponse.json(
        { error: failures[0]?.message ?? "Could not send sessions", failures },
        { status: 400 },
      );
    }

    return NextResponse.json({
      createdCount,
      failedCount: failures.length,
      failures,
    });
  } catch (error) {
    console.error("Error sending sessions to Google Calendar:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

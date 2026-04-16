import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recalculateCoachScore } from "@/lib/coachPerformance";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify admin role
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check if user is admin
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError || !roles?.some((r) => r.role === "admin")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    // Fetch all coaches
    const { data: coaches, error: coachError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "coach");

    if (coachError || !coaches) {
      return NextResponse.json(
        { error: "Failed to fetch coaches" },
        { status: 500 }
      );
    }

    const coachIds = coaches.map((c) => c.user_id);
    const results: { success: number; failed: number; errors: string[] } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Recalculate scores for each coach
    for (const coachId of coachIds) {
      try {
        await recalculateCoachScore(coachId, supabase);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(
          `${coachId}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json({
      message: "Coach scores recalculated",
      ...results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "An error occurred while recalculating scores",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

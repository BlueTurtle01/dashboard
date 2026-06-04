import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

const LARGE_RACE_THRESHOLD = 50; // require ?confirm=true when deleting races with many results

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const confirmed = req.nextUrl.searchParams.get("confirm") === "true";
  const supabase = await createClient();

  // Safety: refuse to delete published races
  const { data: race } = await supabase
    .from("races")
    .select("is_published, name")
    .eq("id", id)
    .maybeSingle();

  if (!race) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }
  if (race.is_published) {
    return NextResponse.json({ error: "Cannot delete a published race via this endpoint" }, { status: 409 });
  }

  // Count results so we can warn before destroying significant data
  const { count } = await supabase
    .from("race_results")
    .select("*", { count: "exact", head: true })
    .eq("race_id", id);

  const resultCount = count ?? 0;

  // Require explicit confirmation for races with substantial result data
  if (resultCount >= LARGE_RACE_THRESHOLD && !confirmed) {
    return NextResponse.json(
      { error: `CONFIRM_REQUIRED`, result_count: resultCount, race_name: race.name },
      { status: 422 }
    );
  }

  // Delete results first (in case FK lacks ON DELETE CASCADE)
  await supabase.from("race_results").delete().eq("race_id", id);
  await supabase.from("race_result_imports").delete().eq("race_id", id);

  const { error } = await supabase.from("races").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted_results: resultCount });
}

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: sourceId } = await params;
  const { target_race_id } = (await req.json()) as { target_race_id?: string };

  if (!target_race_id) {
    return NextResponse.json({ error: "target_race_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Safety: refuse to operate on a published race as source
  const { data: source } = await supabase
    .from("races")
    .select("is_published")
    .eq("id", sourceId)
    .maybeSingle();

  if (!source) {
    return NextResponse.json({ error: "Source race not found" }, { status: 404 });
  }
  if (source.is_published) {
    return NextResponse.json({ error: "Source race is already published — use the admin UI to manage it" }, { status: 409 });
  }

  // Verify target exists
  const { data: target } = await supabase
    .from("races")
    .select("id")
    .eq("id", target_race_id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Target race not found" }, { status: 404 });
  }

  // Move results and import records to target race
  const { error: rrErr } = await supabase
    .from("race_results")
    .update({ race_id: target_race_id })
    .eq("race_id", sourceId);

  if (rrErr) {
    return NextResponse.json({ error: rrErr.message }, { status: 500 });
  }

  await supabase
    .from("race_result_imports")
    .update({ race_id: target_race_id })
    .eq("race_id", sourceId);

  // Delete the now-empty source race row
  await supabase.from("races").delete().eq("id", sourceId);

  return NextResponse.json({ ok: true, target_race_id });
}

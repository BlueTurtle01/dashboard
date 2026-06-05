import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: sourceId } = await params;
  const { new_name } = (await req.json()) as { new_name?: string };

  if (!new_name?.trim()) {
    return NextResponse.json({ error: "new_name is required" }, { status: 400 });
  }

  const newName = new_name.trim();
  const newSlug = slugify(newName);
  const supabase = await createClient();

  // Fetch source race
  const { data: source } = await supabase
    .from("races")
    .select("id, name, slug")
    .eq("id", sourceId)
    .maybeSingle();

  if (!source) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }

  // Check whether another race already has the same name (case-insensitive)
  const { data: existing } = await supabase
    .from("races")
    .select("id, name, slug")
    .ilike("name", newName)
    .neq("id", sourceId)
    .maybeSingle();

  if (existing) {
    // Merge: move all results and import records to the existing race, then delete source
    const { error: rrErr } = await supabase
      .from("race_results")
      .update({ race_id: existing.id })
      .eq("race_id", sourceId);

    if (rrErr) {
      return NextResponse.json({ error: rrErr.message }, { status: 500 });
    }

    await supabase
      .from("race_result_imports")
      .update({ race_id: existing.id })
      .eq("race_id", sourceId);

    await supabase.from("races").delete().eq("id", sourceId);

    return NextResponse.json({
      action: "merged",
      target_id: existing.id,
      target_name: existing.name,
    });
  }

  // Simple rename — update name and slug in place
  const { error: updateErr } = await supabase
    .from("races")
    .update({ name: newName, slug: newSlug })
    .eq("id", sourceId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ action: "renamed", id: sourceId, name: newName });
}

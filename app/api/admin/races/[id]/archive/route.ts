import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: race } = await supabase
    .from("races")
    .select("id, name, is_archived")
    .eq("id", id)
    .maybeSingle();

  if (!race) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }

  const newArchived = !race.is_archived;

  const { error } = await supabase
    .from("races")
    .update({ is_archived: newArchived })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id, name: race.name, is_archived: newArchived });
}

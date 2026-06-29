import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: race } = await supabase
    .from("races")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!race) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }

  const { error } = await adminSupabase.rpc("admin_delete_race", { p_race_id: id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action: "deleted", id, name: race.name });
}

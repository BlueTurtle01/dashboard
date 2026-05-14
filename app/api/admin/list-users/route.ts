import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError || !roles?.some((r) => r.role === "admin")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('auth.users')
    .select('id, email');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data as any[])?.map((u) => ({ id: u.id, email: u.email ?? null })) ?? [];
  return NextResponse.json({ users });
}

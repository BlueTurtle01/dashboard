import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  return !error && Boolean(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: targetUser } = await adminClient
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await adminClient.from("athlete_profiles").upsert(
    {
      user_id: userId,
      full_name: targetUser?.email ? String(targetUser.email).split("@")[0] : null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

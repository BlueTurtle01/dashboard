import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface NameMatchRow {
  full_name: string;
  total_entries: number;
  distinct_races: number;
  distinct_years: number;
  years: number[];
  distinct_clubs: number;
  entries_with_club: number;
  sample_club: string | null;
  gender: string | null;
  distinct_genders: number;
  distinct_age_groups: number;
  probability_score: number;
}

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (!roles?.some((r) => r.role === "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("al_name_matches");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as NameMatchRow[]);
}

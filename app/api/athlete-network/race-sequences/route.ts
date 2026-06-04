import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface RaceSequenceRow {
  path_names: string[];
  path_length: number;
  athlete_count: number;
  race_a_total: number;
  probability: number;
  avg_span_years: number;
}

export async function GET(req: NextRequest) {
  const min = Math.max(2, Math.min(4, Number(req.nextUrl.searchParams.get("min") ?? "2")));
  const max = Math.max(min, Math.min(4, Number(req.nextUrl.searchParams.get("max") ?? "4")));

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

  const { data, error } = await supabase.rpc("al_race_sequences", {
    p_min_length: min,
    p_max_length: max,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as RaceSequenceRow[]);
}

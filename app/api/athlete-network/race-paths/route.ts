import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface RacePathRow {
  race_a_id: string;
  race_a_name: string;
  race_b_id: string;
  race_b_name: string;
  pair_count: number;
  race_a_total: number;
  probability: number;
  avg_year_gap: number;
  same_year_count: number;
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

  // Fetch top 500 from the DB (overrides Supabase's 1000 default — the SQL function
  // already orders by pair_count DESC so these are the most-connected pairs).
  const { data, error } = await supabase.rpc("al_race_paths").limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // De-duplicate and filter:
  //   1. Drop self-loops — same race name on both sides (happens when the same course
  //      was imported as separate races.id entries for each year).
  //   2. For name-pairs that appear more than once (again due to multiple year-rows for
  //      the same course), keep only the entry with the highest pair_count.
  //   3. Return the top 100 by pair_count.
  const seen = new Map<string, RacePathRow>();
  for (const row of (data ?? []) as RacePathRow[]) {
    if (row.race_a_name === row.race_b_name) continue;
    const key = `${row.race_a_name}|||${row.race_b_name}`;
    const existing = seen.get(key);
    if (!existing || row.pair_count > existing.pair_count) {
      seen.set(key, row);
    }
  }

  const result = [...seen.values()]
    .sort((a, b) => b.pair_count - a.pair_count)
    .slice(0, 100);

  return NextResponse.json(result);
}

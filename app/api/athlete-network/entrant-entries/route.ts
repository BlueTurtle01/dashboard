import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface EntrantEntry {
  id: number;
  result_year: number;
  position: number | null;
  bib_number: string | null;
  gender: string | null;
  age_group: string | null;
  result_status: string;
  finish_seconds: number | null;
  club: string | null;
  race_name: string;
  race_slug: string;
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name?.trim()) {
    return NextResponse.json({ error: "Missing name parameter" }, { status: 400 });
  }

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

  const { data, error } = await supabase
    .from("race_results")
    .select("id, result_year, position, bib_number, gender, age_group, result_status, finish_seconds, additional_data, races(name, slug)")
    .eq("full_name", name)
    .order("result_year", { ascending: false })
    .order("position", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: EntrantEntry[] = (data ?? []).map((r) => {
    const ad = r.additional_data as Record<string, string> | null;
    const club = ad?.["Club"] || ad?.["club"] || null;
    const raceRaw = r.races;
    const race = (Array.isArray(raceRaw) ? raceRaw[0] : raceRaw) as { name: string; slug: string } | null | undefined;
    return {
      id: r.id,
      result_year: r.result_year,
      position: r.position,
      bib_number: r.bib_number,
      gender: normaliseGender(r.gender),
      age_group: r.age_group,
      result_status: r.result_status,
      finish_seconds: r.finish_seconds,
      club,
      race_name: race?.name ?? "Unknown race",
      race_slug: race?.slug ?? "",
    };
  });

  return NextResponse.json(rows);
}

function normaliseGender(g: string | null): string | null {
  if (!g) return null;
  if (g === "Men" || g === "Male") return "Male";
  if (g === "Women" || g === "Female") return "Female";
  if (g === "Unknown" || g === "Not Specified") return null;
  return g;
}

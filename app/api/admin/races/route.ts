import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface RaceListItem {
  id: string;
  name: string;
  slug: string;
  race_year: number | null;
  is_published: boolean;
  is_archived: boolean;
  result_count: number;
}

export async function GET() {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("races")
    .select("id, name, slug, race_year, is_published, is_archived, race_results(count)")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const races: RaceListItem[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    race_year: r.race_year ?? null,
    is_published: r.is_published ?? false,
    is_archived: r.is_archived ?? false,
    result_count: (r.race_results as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ races });
}

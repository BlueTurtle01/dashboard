import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();

  // Get all unpublished races with result counts and source filenames
  const { data: races, error } = await supabase
    .from("races")
    .select(`
      id,
      name,
      slug,
      race_year,
      created_at,
      race_results ( id ),
      race_result_imports ( original_filename )
    `)
    .eq("is_published", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formatted = (races ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    race_year: r.race_year,
    created_at: r.created_at,
    result_count: Array.isArray(r.race_results) ? r.race_results.length : 0,
    source_files: Array.isArray(r.race_result_imports)
      ? [...new Set((r.race_result_imports as { original_filename: string }[]).map((i) => i.original_filename))]
      : [],
  }));

  return NextResponse.json({ races: formatted });
}

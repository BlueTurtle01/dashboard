import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    slug?: string;
    location?: string;
    distance_km?: number | null;
    terrain_type?: string | null;
    race_date?: string | null;
  };

  if (!body.slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check slug uniqueness (excluding this race)
  const { data: conflict } = await supabase
    .from("races")
    .select("id")
    .eq("slug", body.slug)
    .neq("id", id)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: "Slug already in use by another race" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("races")
    .update({
      is_published: true,
      ...(body.name && { name: body.name }),
      slug: body.slug,
      ...(body.location !== undefined && { location: body.location }),
      ...(body.distance_km !== undefined && { distance_km: body.distance_km }),
      ...(body.terrain_type !== undefined && { terrain_type: body.terrain_type }),
      ...(body.race_date !== undefined && { race_date: body.race_date }),
    })
    .eq("id", id)
    .select("id, name, slug, is_published")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ race: data });
}

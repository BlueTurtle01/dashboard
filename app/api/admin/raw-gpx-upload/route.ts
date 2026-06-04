import { NextRequest, NextResponse } from "next/server";
import { getUserRoles, getCurrentUser } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const RAW_BUCKET = "raw-files";

export async function POST(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "gpx";
  const uuid = crypto.randomUUID();
  const storagePath = `raw-gpx/${uuid}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadErr } = await adminClient.storage
    .from(RAW_BUCKET)
    .upload(storagePath, bytes, { contentType: "application/gpx+xml", upsert: false });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: row, error: dbErr } = await supabase
    .from("raw_gpx_files")
    .insert({
      original_filename: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      uploaded_by: user?.id ?? null,
    })
    .select("id, original_filename, storage_path")
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ file: row });
}

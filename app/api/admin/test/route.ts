import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";

export async function GET() {
  try {
    // Check user is admin
    const roles = await getCurrentUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Test service role key existence
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({
        error: "SUPABASE_SERVICE_ROLE_KEY is not set",
        message: "Environment variable is missing",
      });
    }

    // Test admin client creation
    const adminClient = createAdminClient();

    // Test a simple query
    const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1 });

    if (error) {
      return NextResponse.json({
        error: "Admin listUsers failed",
        message: error.message,
        details: error,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Admin client is working",
      userCount: data.users?.length ?? 0,
    });
  } catch (err) {
    return NextResponse.json({
      error: "Unexpected error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

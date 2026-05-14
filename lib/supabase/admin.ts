import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAllAuthUsers() {
  const adminClient = createAdminClient();
  const users = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
      page,
    });

    if (error) throw new Error(error.message);

    users.push(...(data?.users || []));
    hasMore = (data?.users?.length || 0) === 1000;
    page++;
  }

  return users;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
      setLoading(false);
    };

    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <p className="text-zinc-600">Loading account…</p>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-4">
      {/* Account info */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide px-4">Account</h2>
        <div className="p-4 rounded-lg border border-zinc-200 bg-white">
          <p className="text-xs text-zinc-500 mb-1">Email</p>
          <p className="font-medium text-zinc-900">{email || "—"}</p>
        </div>
      </div>

      {/* Profile section */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide px-4">Profile</h2>
        <Link
          href="/plan/profile"
          className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition-all"
        >
          <div>
            <h3 className="font-semibold text-zinc-900">Training Profile</h3>
            <p className="text-sm text-zinc-500">Update your fitness details</p>
          </div>
          <span className="text-zinc-400">→</span>
        </Link>
      </div>
    </div>
  );
}

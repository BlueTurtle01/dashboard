"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
      setLoading(false);
    };

    loadUser();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!newPassword || !confirmPassword) {
      setPasswordError("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    setUpdatingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordForm(false);
        setTimeout(() => setPasswordSuccess(false), 3000);
      }
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <p className="text-zinc-600">Loading account…</p>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-4 pb-20">
      {/* Success message */}
      {passwordSuccess && (
        <div className="mx-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-sm text-emerald-700">Password updated successfully!</p>
        </div>
      )}

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

      {/* Security section */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide px-4">Security</h2>

        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="w-full mx-4 flex items-center justify-between p-4 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition-all text-left"
          >
            <div>
              <h3 className="font-semibold text-zinc-900">Change Password</h3>
              <p className="text-sm text-zinc-500">Update your password</p>
            </div>
            <span className="text-zinc-400">→</span>
          </button>
        ) : (
          <form onSubmit={handleChangePassword} className="mx-4 space-y-3 p-4 rounded-lg border border-zinc-200 bg-white">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder="Confirm password"
              />
            </div>

            {passwordError && (
              <div className="p-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-700">{passwordError}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasswordForm(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatingPassword}
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {updatingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Logout section */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide px-4">Session</h2>
        <button
          onClick={handleLogout}
          className="w-full mx-4 flex items-center justify-between p-4 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-left"
        >
          <div>
            <h3 className="font-semibold text-red-700">Logout</h3>
            <p className="text-sm text-red-600">Sign out of your account</p>
          </div>
          <span className="text-red-500">→</span>
        </button>
      </div>
    </div>
  );
}

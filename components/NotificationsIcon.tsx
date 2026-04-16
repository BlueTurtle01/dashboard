"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationsIcon() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkCoachAndLoadNotifications = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Check if user is a coach
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isUserCoach = roles?.some((r) => r.role === "coach") ?? false;
      setIsCoach(isUserCoach);

      if (!isUserCoach) {
        setLoading(false);
        return;
      }

      // Load unread notification count
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", user.id)
        .eq("read", false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }

      setLoading(false);

      // Set up real-time subscription for new notifications
      const subscription = supabase
        .channel("notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `coach_id=eq.${user.id}`,
          },
          () => {
            setUnreadCount((prev) => prev + 1);
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    };

    void checkCoachAndLoadNotifications();
  }, []);

  if (!isCoach || loading) {
    return null;
  }

  return (
    <Link
      href="/coach/notifications"
      className="relative flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-100 transition-colors"
      title="Notifications"
    >
      {/* Bell icon */}
      <svg
        className="w-5 h-5 text-zinc-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>

      {/* Badge with unread count */}
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-[20px]">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

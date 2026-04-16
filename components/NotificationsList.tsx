"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: "holiday_deleted" | "blocked_date_deleted" | "holiday_created" | "holiday_edited";
  message: string;
  date_deleted: string | null;
  read: boolean;
  created_at: string;
  athlete_id: string;
};

export default function NotificationsList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
          id,
          type,
          message,
          date_deleted,
          read,
          created_at,
          athlete_id
        `
        )
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        setNotifications(data as any);

        // Fetch athlete names for all unique athlete IDs
        const uniqueAthleteIds = [...new Set(data.map((n: any) => n.athlete_id))];
        if (uniqueAthleteIds.length > 0) {
          const { data: profiles } = await supabase
            .from("athlete_profiles")
            .select("user_id, full_name")
            .in("user_id", uniqueAthleteIds);

          if (profiles) {
            const nameMap = profiles.reduce(
              (acc, profile) => {
                acc[profile.user_id] = profile.full_name || "Unknown athlete";
                return acc;
              },
              {} as Record<string, string>
            );
            setAthleteNames(nameMap);
          }
        }
      }
      setLoading(false);
    };

    loadNotifications();

    // Set up real-time subscription
    const supabase = createClient();
    const subscription = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload: any) => {
          setNotifications((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return <div className="text-sm text-zinc-500">Loading notifications...</div>;
  }

  if (notifications.length === 0) {
    return <div className="text-sm text-zinc-500">No notifications</div>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {unreadCount > 0 && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
          {unreadCount} new {unreadCount === 1 ? "notification" : "notifications"}
        </div>
      )}

      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`rounded-lg border px-4 py-3 text-sm ${
            notification.read
              ? "border-zinc-200 bg-white text-zinc-700"
              : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-medium">{notification.message}</p>
              <p className="mt-1 text-xs opacity-75">
                {athleteNames[notification.athlete_id] || "Unknown athlete"}
              </p>
            </div>
            <div className="shrink-0 text-xs opacity-75">
              {new Date(notification.created_at).toLocaleDateString("en-GB", {
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

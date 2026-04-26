"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MentorshipRequestNotification from "@/components/MentorshipRequestNotification";

type Notification = {
  id: string;
  type: "holiday_deleted" | "blocked_date_deleted" | "holiday_created" | "holiday_edited" | "mentorship_request";
  message: string;
  date_deleted: string | null;
  read: boolean;
  created_at: string;
  athlete_id: string;
  link_id?: string;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isCoach, setIsCoach] = useState(false);
  const [showRead, setShowRead] = useState(false);

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

      // Check if user is a coach
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isUserCoach = roles?.some((r) => r.role === "coach") ?? false;
      if (!isUserCoach) {
        setLoading(false);
        return;
      }

      setIsCoach(true);

      // Load all notifications
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
          athlete_id,
          link_id
        `
        )
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        setNotifications(data as any);

        // Fetch athlete names for all unique athlete IDs
        const uniqueAthleteIds = [
          ...new Set(data
            .map((n: any) => n.athlete_id)
            .filter(Boolean)
          )
        ];
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

    void loadNotifications();
  }, []);

  async function toggleNotificationRead(notificationId: string, isRead: boolean) {
    const supabase = createClient();

    await supabase
      .from("notifications")
      .update({ read: !isRead })
      .eq("id", notificationId);

    // Update local state
    setNotifications((notifs) =>
      notifs.map((n) =>
        n.id === notificationId ? { ...n, read: !isRead } : n
      )
    );
  }

  if (!isCoach) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Access denied</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading notifications...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
              <p className="mt-3 text-zinc-600">
                {notifications.length === 0
                  ? "No notifications"
                  : (() => {
                      const unreadCount = notifications.filter((n) => !n.read).length;
                      return `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"} of ${notifications.length} total`;
                    })()}
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={showRead}
                onChange={(e) => setShowRead(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">Show read</span>
            </label>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            <p className="text-sm text-zinc-600">No notifications yet</p>
          </div>
        ) : (() => {
          const displayedNotifications = showRead
            ? notifications
            : notifications.filter((n) => !n.read);

          return displayedNotifications.length === 0 && !showRead ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
              <svg
                className="mx-auto mb-4 h-12 w-12 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-lg font-semibold text-emerald-900">All caught up!</p>
              <p className="mt-2 text-sm text-emerald-700">No unread notifications at this time.</p>
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
              <svg
                className="mx-auto mb-4 h-12 w-12 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-lg font-semibold text-emerald-900">No notifications to show</p>
              <p className="mt-2 text-sm text-emerald-700">Check back later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedNotifications.map((notification) => {
                // Handle mentorship requests separately
                if (notification.type === "mentorship_request") {
                  const athleteName = athleteNames[notification.athlete_id] || "Unknown athlete";

                  return (
                    <MentorshipRequestNotification
                      key={notification.id}
                      notification={notification}
                      athleteName={athleteName}
                      onActionComplete={(notificationId) => {
                        setNotifications((notifs) =>
                          notifs.filter((n) => n.id !== notificationId)
                        );
                      }}
                    />
                  );
                }

                // Handle other notification types
                let icon;
                let iconColor = "text-zinc-600";

                if (notification.type === "holiday_deleted") {
                  iconColor = "text-red-600";
                  icon = (
                    <svg
                      className={`w-5 h-5 ${iconColor}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  );
                } else if (notification.type === "holiday_created") {
                  iconColor = "text-green-600";
                  icon = (
                    <svg
                      className={`w-5 h-5 ${iconColor}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  );
                } else if (notification.type === "holiday_edited") {
                  iconColor = "text-blue-600";
                  icon = (
                    <svg
                      className={`w-5 h-5 ${iconColor}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  );
                } else {
                  icon = (
                    <svg
                      className={`w-5 h-5 ${iconColor}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  );
                }

                return (
                  <div
                    key={notification.id}
                    className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ${
                      notification.read ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className="mt-1 shrink-0">{icon}</div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-zinc-900">
                              {notification.message}
                            </p>
                            <p className="mt-1 text-sm text-zinc-600">
                              {athleteNames[notification.athlete_id] || "Unknown athlete"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="text-xs text-zinc-500">
                              {new Date(notification.created_at).toLocaleDateString(
                                "en-GB",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </div>
                            <button
                              onClick={() => toggleNotificationRead(notification.id, notification.read)}
                              className={`whitespace-nowrap rounded px-2 py-1 text-xs font-semibold transition ${
                                notification.read
                                  ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                                  : "border border-zinc-900 bg-indigo-600 text-white hover:bg-zinc-700"
                              }`}
                            >
                              {notification.read ? "Mark unread" : "Mark read"}
                            </button>
                          </div>
                        </div>

                        {notification.date_deleted && (
                          <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                            <span className="font-medium">Date:</span>{" "}
                            {new Date(notification.date_deleted).toLocaleDateString(
                              "en-GB",
                              {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </main>
  );
}

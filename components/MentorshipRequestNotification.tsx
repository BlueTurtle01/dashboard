"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { acceptMentorship, declineMentorship } from "@/lib/actions/mentorship";

interface AthleteProfile {
  full_name: string | null;
  date_of_birth: string | null;
  tags?: string[];
  selected_event_id: string | null;
  events?: {
    id: string;
    name: string;
  }[] | null;
}

interface MentorshipRequestNotificationProps {
  notification: {
    id: string;
    athlete_id: string;
    message: string;
    created_at: string;
    read: boolean;
    link_id?: string;
  };
  athleteName: string;
  onActionComplete: (notificationId: string) => void;
}

export default function MentorshipRequestNotification({
  notification,
  athleteName,
  onActionComplete,
}: MentorshipRequestNotificationProps) {
  const [loading, setLoading] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("athlete_profiles")
        .select(
          `
          full_name,
          date_of_birth,
          tags,
          selected_event_id,
          events!athlete_profiles_selected_event_id_fkey(id, name)
        `
        )
        .eq("user_id", notification.athlete_id)
        .maybeSingle();

      if (data) {
        setAthleteProfile(data);
      }
      setProfileLoading(false);
    };

    void fetchProfile();
  }, [notification.athlete_id]);

  const handleAccept = async () => {
    if (!notification.link_id) return;

    setLoading(true);
    try {
      const result = await acceptMentorship(notification.link_id, notification.id);
      if (result.success) {
        onActionComplete(notification.id);
      }
    } catch (error) {
      console.error("Failed to accept mentorship:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!notification.link_id) return;

    setLoading(true);
    try {
      const result = await declineMentorship(notification.link_id, notification.id);
      if (result.success) {
        onActionComplete(notification.id);
      }
    } catch (error) {
      console.error("Failed to decline mentorship:", error);
    } finally {
      setLoading(false);
    }
  };

  const eventName = athleteProfile?.events
    ? Array.isArray(athleteProfile.events)
      ? athleteProfile.events[0]?.name
      : athleteProfile.events.name
    : null;

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ${
        notification.read ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-4">
        <div className="mt-1 shrink-0">
          <svg
            className="w-5 h-5 text-indigo-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Link
                href={`/coach/athlete-overview?athleteId=${notification.athlete_id}`}
                className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                {athleteName}
              </Link>
              <p className="text-sm text-zinc-600">wants to train with you</p>

              {!profileLoading && athleteProfile && (
                <div className="mt-3 space-y-2">
                  {eventName && (
                    <div className="text-sm">
                      <span className="text-zinc-600">Target event: </span>
                      <span className="font-medium text-zinc-900">{eventName}</span>
                    </div>
                  )}
                  {athleteProfile.tags && athleteProfile.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {athleteProfile.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-block rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700"
                        >
                          {tag.replace(/_/g, " ")}
                        </span>
                      ))}
                      {athleteProfile.tags.length > 3 && (
                        <span className="text-xs text-zinc-500">
                          +{athleteProfile.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="text-xs text-zinc-500 shrink-0">
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
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAccept}
              disabled={loading}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Accept"}
            </button>
            <button
              onClick={handleDecline}
              disabled={loading}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Decline"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

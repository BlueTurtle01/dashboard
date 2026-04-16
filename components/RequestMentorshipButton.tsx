"use client";

import { useState } from "react";
import { requestMentorship } from "@/lib/actions/mentorship";

interface RequestMentorshipButtonProps {
  coachUserId: string;
  existingLink?: { id: string; status: string } | null;
}

export default function RequestMentorshipButton({
  coachUserId,
  existingLink,
}: RequestMentorshipButtonProps) {
  const [linkStatus, setLinkStatus] = useState<string | null>(existingLink?.status ?? null);
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    console.log("Request mentorship clicked for coach:", coachUserId);
    setLoading(true);
    try {
      const result = await requestMentorship(coachUserId);
      console.log("Request mentorship result:", result);
      if (result.success) {
        setLinkStatus("pending");
      } else {
        console.error("Request failed - Error:", result.error);
      }
    } catch (error) {
      console.error("Failed to request mentorship:", error);
    } finally {
      setLoading(false);
    }
  };

  // No link or declined status: show request button
  if (!linkStatus || linkStatus === "declined") {
    return (
      <button
        onClick={handleRequest}
        disabled={loading}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Requesting..." : "Request mentorship"}
      </button>
    );
  }

  // Pending status: show sent pill
  if (linkStatus === "pending") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
        <div className="h-2 w-2 rounded-full bg-amber-600 animate-pulse" />
        Request sent
      </div>
    );
  }

  // Active status: show connected pill
  if (linkStatus === "active") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
        <div className="h-2 w-2 rounded-full bg-emerald-600" />
        Connected
      </div>
    );
  }

  return null;
}

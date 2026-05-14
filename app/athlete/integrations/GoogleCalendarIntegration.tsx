"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type GoogleCalendarIntegrationRow = {
  id: string;
  provider_username: string | null;
  provider_firstname: string | null;
  provider_lastname: string | null;
  connected_at: string;
  is_active: boolean;
};

export default function GoogleCalendarIntegration() {
  const [integration, setIntegration] = useState<GoogleCalendarIntegrationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingAll, setSendingAll] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void loadIntegration();
  }, []);

  async function loadIntegration() {
    try {
      setLoading(true);
      const response = await fetch("/api/athlete/integrations?provider=google_calendar");
      if (!response.ok) throw new Error("Failed to load Google Calendar integration");
      const data = await response.json();
      setIntegration(data.integration ?? null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }

  async function sendAllSessions() {
    try {
      setSendingAll(true);
      setMessage(null);

      const response = await fetch("/api/google-calendar/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Could not send sessions to Google Calendar");

      const failedText = data.failedCount ? ` (${data.failedCount} failed)` : "";
      setMessage({
        type: "success",
        text: `Sent ${data.createdCount} session${data.createdCount === 1 ? "" : "s"} to Google Calendar${failedText}.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSendingAll(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Google Calendar?")) return;

    try {
      setDisconnecting(true);
      const response = await fetch("/api/google-calendar/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Disconnect failed");

      setIntegration(null);
      setMessage({ type: "success", text: "Disconnected from Google Calendar" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <div className="py-4 text-gray-500">Loading Google Calendar...</div>;
  }

  return (
    <div className="border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Google Calendar</h3>

      {message ? (
        <div
          className={`mb-4 rounded-md p-4 text-sm ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {!integration || !integration.is_active ? (
        <div className="space-y-4">
          <p className="text-gray-600">
            Connect Google Calendar to send planned training sessions to your calendar.
          </p>
          <Link
            href="/api/google-calendar/connect"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
          >
            Connect Google Calendar
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600">Connected as</p>
            <p className="font-medium">
              {integration.provider_username ||
                [integration.provider_firstname, integration.provider_lastname].filter(Boolean).join(" ") ||
                "Google account"}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-700">
            Send sessions as all-day events on their planned training days.
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void sendAllSessions()}
              disabled={sendingAll}
              className="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {sendingAll ? "Sending..." : "Send All Sessions"}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="rounded-md bg-red-600 px-4 py-2 text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StravaIntegration {
  id: string;
  provider_firstname: string | null;
  provider_lastname: string | null;
  provider_username: string | null;
  last_sync_at: string | null;
  is_active: boolean;
}

interface Activity {
  id: string;
  name: string;
  sport_type: string;
  distance_m: number;
  moving_time_seconds: number;
  total_elevation_gain_m: number;
  average_heartrate: number | null;
  start_time: string;
}

interface WebhookStatus {
  subscribed: boolean;
  webhook: { id: string; webhook_id: number; is_active: boolean } | null;
}

export default function StravaIntegration() {
  const [integration, setIntegration] = useState<StravaIntegration | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadIntegration();
    const params = new URLSearchParams(window.location.search);
    const successMsg = params.get("success");
    const errorMsg = params.get("error");

    if (successMsg) {
      setMessage({ type: "success", text: successMsg });
      window.history.replaceState({}, "", "/athlete/integrations");
    } else if (errorMsg) {
      setMessage({ type: "error", text: errorMsg });
      window.history.replaceState({}, "", "/athlete/integrations");
    }
  }, []);

  async function loadIntegration() {
    try {
      setLoading(true);
      const response = await fetch("/api/athlete/integrations");
      if (!response.ok) throw new Error("Failed to load integration");

      const data = await response.json();
      setIntegration(data.integration || null);

      if (data.integration?.is_active) {
        // Load activities if connected
        const activitiesResponse = await fetch("/api/athlete/activities?provider=strava&limit=10");
        if (activitiesResponse.ok) {
          const activitiesData = await activitiesResponse.json();
          setActivities(activitiesData.activities || []);
        }

        // Load webhook status if connected
        const webhookResponse = await fetch("/api/strava/webhook-subscribe");
        if (webhookResponse.ok) {
          const webhookData = await webhookResponse.json();
          setWebhookStatus(webhookData);
        }
      }
    } catch (error) {
      console.error("Error loading integration:", error);
      setMessage({ type: "error", text: "Failed to load integration" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      setMessage(null);
      const response = await fetch("/api/strava/sync", { method: "POST" });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Sync failed");
      }

      const data = await response.json();
      setMessage({
        type: "success",
        text: `Synced ${data.syncedCount} activit${data.syncedCount === 1 ? "y" : "ies"}`,
      });

      // Reload activities
      loadIntegration();
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubscribeWebhooks() {
    try {
      setSubscribing(true);
      setMessage(null);
      const response = await fetch("/api/strava/webhook-subscribe", { method: "POST" });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to subscribe");
      }

      const data = await response.json();
      setMessage({ type: "success", text: "Webhook subscription activated" });
      setWebhookStatus({ subscribed: true, webhook: null });
      loadIntegration();
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    } finally {
      setSubscribing(false);
    }
  }

  async function handleUnsubscribeWebhooks() {
    if (!confirm("Are you sure you want to disable automatic syncing? You can still sync manually."))
      return;

    try {
      setUnsubscribing(true);
      const response = await fetch("/api/strava/webhook-unsubscribe", { method: "POST" });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unsubscribe");
      }

      setMessage({ type: "success", text: "Webhook subscription disabled" });
      setWebhookStatus({ subscribed: false, webhook: null });
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    } finally {
      setUnsubscribing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect Strava?")) return;

    try {
      setDisconnecting(true);
      const response = await fetch("/api/strava/disconnect", { method: "POST" });

      if (!response.ok) throw new Error("Disconnect failed");

      setIntegration(null);
      setActivities([]);
      setWebhookStatus(null);
      setMessage({ type: "success", text: "Disconnected from Strava" });
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <div className="py-4 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Strava</h3>

        {!integration || !integration.is_active ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              Connect Strava to automatically sync your completed activities into your training
              dashboard.
            </p>
            <Link
              href="/api/strava/connect"
              className="inline-block px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition"
            >
              Connect Strava
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Connected as</p>
                <p className="font-medium">
                  {integration.provider_firstname} {integration.provider_lastname}
                  {integration.provider_username && ` (@${integration.provider_username})`}
                </p>
              </div>
            </div>

            {integration.last_sync_at && (
              <p className="text-sm text-gray-500">
                Last synced: {new Date(integration.last_sync_at).toLocaleDateString()}
              </p>
            )}

            {/* Webhook Status Section */}
            <div className="bg-blue-50 p-4 rounded border border-blue-200">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900">Automatic Syncing</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {webhookStatus?.subscribed
                      ? "🔄 Enabled - New activities will sync automatically"
                      : "⏸️ Disabled - Manual sync only"}
                  </p>
                </div>
                {webhookStatus?.subscribed ? (
                  <button
                    onClick={handleUnsubscribeWebhooks}
                    disabled={unsubscribing}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {unsubscribing ? "Disabling..." : "Disable"}
                  </button>
                ) : (
                  <button
                    onClick={handleSubscribeWebhooks}
                    disabled={subscribing}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {subscribing ? "Enabling..." : "Enable"}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync Recent Activities"}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        )}
      </div>

      {activities.length > 0 && (
        <div className="border rounded-lg p-6">
          <h4 className="text-md font-semibold mb-4">Recent Activities</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Sport</th>
                  <th className="text-right py-2 px-2">Distance (km)</th>
                  <th className="text-right py-2 px-2">Time</th>
                  <th className="text-right py-2 px-2">Elevation (m)</th>
                  <th className="text-right py-2 px-2">Avg HR</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600">
                      {new Date(activity.start_time).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-2">{activity.name}</td>
                    <td className="py-2 px-2 text-gray-600">{activity.sport_type}</td>
                    <td className="py-2 px-2 text-right">
                      {(activity.distance_m / 1000).toFixed(1)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {formatTime(activity.moving_time_seconds)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {activity.total_elevation_gain_m?.toFixed(0) || "—"}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {activity.average_heartrate ? Math.round(activity.average_heartrate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

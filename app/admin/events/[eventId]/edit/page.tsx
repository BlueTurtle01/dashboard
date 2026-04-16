"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RaceConditions } from "@/lib/planner/types";

const SPECIAL_CONDITIONS = [
  { value: "sand", label: "Sand" },
  { value: "snow_ice", label: "Snow / Ice" },
  { value: "night_stages", label: "Night stages" },
  { value: "self_sufficiency", label: "Self-sufficiency (carry own kit/food)" },
  { value: "technical_terrain", label: "Technical terrain" },
  { value: "multi_day", label: "Multi-day / stage race" },
  { value: "high_winds", label: "High winds" },
  { value: "river_crossings", label: "River crossings" },
  { value: "high_humidity", label: "High humidity" },
];

const defaultConditions: RaceConditions = {
  temperature: null,
  altitude: null,
  humidity: null,
  specialConditions: [],
  notes: null,
};

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("");
  const [terrainType, setTerrainType] = useState("");
  const [climateType, setClimateType] = useState("");
  const [conditions, setConditions] = useState<RaceConditions>(defaultConditions);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!eventId) {
        setErrorMessage("No event ID provided.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("events")
        .select("id, name, event_type, terrain_type, climate_type, race_conditions")
        .eq("id", eventId)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || "Event not found.");
        setLoading(false);
        return;
      }

      setEventName(data.name ?? "");
      setEventType(data.event_type ?? "");
      setTerrainType(data.terrain_type ?? "");
      setClimateType(data.climate_type ?? "");

      const rc = data.race_conditions as RaceConditions | null;
      setConditions({
        temperature: rc?.temperature ?? null,
        altitude: rc?.altitude ?? null,
        humidity: rc?.humidity ?? null,
        specialConditions: rc?.specialConditions ?? [],
        notes: rc?.notes ?? null,
      });

      setLoading(false);
    }

    load();
  }, [eventId, supabase]);

  function toggleSpecialCondition(value: string) {
    setConditions((prev) => {
      const existing = prev.specialConditions ?? [];
      return {
        ...prev,
        specialConditions: existing.includes(value)
          ? existing.filter((c) => c !== value)
          : [...existing, value],
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("events")
      .update({
        terrain_type: terrainType || null,
        climate_type: climateType || null,
        race_conditions: conditions,
      })
      .eq("id", eventId);

    if (error) {
      setErrorMessage(`Save failed: ${error.message}`);
    } else {
      setSuccessMessage("Saved successfully.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <p style={helperStyle}>Loading event...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>{eventName}</h1>
            <p style={subtitleStyle}>{eventType}</p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" onClick={() => router.push("/admin/events")} style={secondaryButtonStyle}>
              Back to Events
            </button>
          </div>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
        {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Classification</h2>
          <p style={sectionSubtitleStyle}>Used for template matching. Keep consistent with existing events.</p>

          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Terrain type</label>
              <input
                style={inputStyle}
                value={terrainType}
                onChange={(e) => setTerrainType(e.target.value)}
                placeholder="e.g. trail, mountain, hilly, road"
              />
            </div>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Climate type</label>
              <input
                style={inputStyle}
                value={climateType}
                onChange={(e) => setClimateType(e.target.value)}
                placeholder="e.g. hot desert, temperate, arctic"
              />
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Race Conditions</h2>
          <p style={sectionSubtitleStyle}>
            These details allow training plans to be tailored to the specific demands of this race.
          </p>

          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Temperature</label>
              <select
                style={selectStyle}
                value={conditions.temperature ?? ""}
                onChange={(e) =>
                  setConditions((prev) => ({
                    ...prev,
                    temperature: (e.target.value as RaceConditions["temperature"]) || null,
                  }))
                }
              >
                <option value="">Unknown / not specified</option>
                <option value="extreme_cold">Extreme cold (arctic / sub-zero)</option>
                <option value="cold">Cold</option>
                <option value="moderate">Moderate</option>
                <option value="hot">Hot</option>
                <option value="extreme_heat">Extreme heat (desert / 40°C+)</option>
              </select>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Altitude</label>
              <select
                style={selectStyle}
                value={conditions.altitude ?? ""}
                onChange={(e) =>
                  setConditions((prev) => ({
                    ...prev,
                    altitude: (e.target.value as RaceConditions["altitude"]) || null,
                  }))
                }
              >
                <option value="">Unknown / not specified</option>
                <option value="sea_level">Sea level</option>
                <option value="moderate">Moderate (1000–2500 m)</option>
                <option value="high">High (2500–4000 m)</option>
                <option value="extreme">Extreme (4000 m+)</option>
              </select>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Humidity</label>
              <select
                style={selectStyle}
                value={conditions.humidity ?? ""}
                onChange={(e) =>
                  setConditions((prev) => ({
                    ...prev,
                    humidity: (e.target.value as RaceConditions["humidity"]) || null,
                  }))
                }
              >
                <option value="">Unknown / not specified</option>
                <option value="dry">Dry</option>
                <option value="moderate">Moderate</option>
                <option value="humid">Humid</option>
              </select>
            </div>
          </div>

          <div style={checkboxGroupStyle}>
            <label style={labelStyle}>Special conditions</label>
            <div style={checkboxGridStyle}>
              {SPECIAL_CONDITIONS.map(({ value, label }) => (
                <label key={value} style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={(conditions.specialConditions ?? []).includes(value)}
                    onChange={() => toggleSpecialCondition(value)}
                    style={{ marginRight: "8px" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Additional notes</label>
            <textarea
              style={textareaStyle}
              value={conditions.notes ?? ""}
              onChange={(e) =>
                setConditions((prev) => ({ ...prev, notes: e.target.value || null }))
              }
              placeholder="e.g. Self-sufficiency — athletes carry all food for 6 stages. Significant sand dunes in stages 3 and 4."
              rows={3}
            />
          </div>
        </section>

        <div style={footerActionsStyle}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={primaryButtonStyle}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/events")}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "800px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "28px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px", marginBottom: "24px" };
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 4px", fontSize: "17px", fontWeight: 600 };
const sectionSubtitleStyle: React.CSSProperties = { margin: "0 0 20px", color: "#666", fontSize: "14px" };
const fieldRowStyle: React.CSSProperties = { display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px" };
const fieldGroupStyle: React.CSSProperties = { flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", gap: "6px" };
const labelStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 600, color: "#444" };
const inputStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px" };
const selectStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px", background: "#fff" };
const textareaStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px", resize: "vertical", fontFamily: "inherit" };
const checkboxGroupStyle: React.CSSProperties = { marginBottom: "20px" };
const checkboxGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px", marginTop: "10px" };
const checkboxLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", fontSize: "14px", cursor: "pointer" };
const footerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px" };
const primaryButtonStyle: React.CSSProperties = { padding: "12px 24px", borderRadius: "8px", background: "#111", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const successStyle: React.CSSProperties = { color: "#2e7d32", marginBottom: "16px" };

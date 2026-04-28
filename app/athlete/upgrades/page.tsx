"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Feature = {
  id: string;
  name: string;
  label: string;
  description: string;
};

const ALL_FEATURES: Feature[] = [
  {
    id: "race_info",
    name: "race_info",
    label: "Destination Information",
    description:
      "Access detailed vaccination requirements and climate information for your race destination. Know exactly which vaccinations you need, their status (mandatory, recommended, or unnecessary), and what weather conditions to expect during your race.",
  },
  {
    id: "kit_list",
    name: "kit_list",
    label: "Kit List",
    description:
      "Get a comprehensive, categorized packing and equipment checklist tailored to your race. Track essential gear, apparel, nutrition, and recovery items organized by category with helpful tips and brand recommendations.",
  },
  {
    id: "video_analysis",
    name: "video_analysis",
    label: "Video Analysis",
    description:
      "Submit race videos for detailed analysis from your coach. Receive personalized feedback on your form, pacing, and technique to improve your performance in future races.",
  },
];

export default function UpgradesPage() {
  const [userFeatures, setUserFeatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeatures() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("user_features")
        .select("feature")
        .eq("user_id", user.id);

      setUserFeatures(new Set(data?.map((row) => row.feature) ?? []));
      setLoading(false);
    }

    loadFeatures();
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <p>Loading...</p>
      </div>
    );
  }

  const lockedFeatures = ALL_FEATURES.filter(
    (feature) => !userFeatures.has(feature.name)
  );
  const unlockedFeatures = ALL_FEATURES.filter(
    (feature) => userFeatures.has(feature.name)
  );

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
        Upgrades & Features
      </h1>
      <p style={{ color: "#666", marginBottom: "32px", fontSize: "14px" }}>
        Unlock additional features to enhance your race preparation.
      </p>

      {lockedFeatures.length > 0 && (
        <>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px" }}>
            Available for Upgrade
          </h2>

          <div style={{ display: "grid", gap: "20px", marginBottom: "40px" }}>
            {lockedFeatures.map((feature) => (
              <div
                key={feature.id}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e5e5e5",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        margin: "0 0 8px",
                        fontSize: "17px",
                        fontWeight: 600,
                      }}
                    >
                      {feature.label}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: "#666",
                        lineHeight: "1.6",
                      }}
                    >
                      {feature.description}
                    </p>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#b45309",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "4px 12px",
                      borderRadius: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Upgrade
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {unlockedFeatures.length > 0 && (
        <>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px" }}>
            Your Features
          </h2>

          <div style={{ display: "grid", gap: "20px" }}>
            {unlockedFeatures.map((feature) => (
              <div
                key={feature.id}
                style={{
                  background: "#f0f7ff",
                  borderRadius: "12px",
                  border: "1px solid #c7e9ff",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        margin: "0 0 8px",
                        fontSize: "17px",
                        fontWeight: 600,
                      }}
                    >
                      {feature.label}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: "#666",
                        lineHeight: "1.6",
                      }}
                    >
                      {feature.description}
                    </p>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#0a7f3f",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "4px 12px",
                      borderRadius: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Unlocked
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}

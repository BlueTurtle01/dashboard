"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FeatureGatedLink from "@/components/FeatureGatedLink";

export default function InformationPage() {
  const [features, setFeatures] = useState<string[]>([]);
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

      setFeatures(data?.map((row) => row.feature) ?? []);
      setLoading(false);
    }

    loadFeatures();
  }, []);

  const hasRaceInfo = features.includes("race_info");
  const hasKitList = features.includes("kit_list");

  const buttonStyle = {
    display: "inline-block",
    padding: "10px 16px",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "14px",
  };

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "32px" }}>
        Information
      </h1>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e5e5e5",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "16px" }}>
          Destination
        </h2>
        <p style={{ color: "#666", marginBottom: "16px", fontSize: "14px" }}>
          Learn about vaccination requirements and climate information for your race
          destination.
        </p>
        {!loading && (
          <FeatureGatedLink
            href="https://dashboard-delta-ten-55.vercel.app/admin/countries/morocco"
            hasAccess={hasRaceInfo}
            className="button"
          >
            <span style={buttonStyle as React.CSSProperties}>View Destination</span>
          </FeatureGatedLink>
        )}
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e5e5e5",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "16px" }}>
          Kit List
        </h2>
        <p style={{ color: "#666", marginBottom: "16px", fontSize: "14px" }}>
          Prepare for your race with a comprehensive packing and equipment checklist
          tailored to your destination.
        </p>
        {!loading && (
          <FeatureGatedLink
            href="/athlete/kit-list"
            hasAccess={hasKitList}
            className="button"
          >
            <span style={buttonStyle as React.CSSProperties}>View Kit List</span>
          </FeatureGatedLink>
        )}
      </div>
    </div>
  );
}

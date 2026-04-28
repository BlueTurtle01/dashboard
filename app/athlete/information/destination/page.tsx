"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DestinationPage() {
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
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
        .eq("user_id", user.id)
        .eq("feature", "race_info")
        .maybeSingle();

      setHasAccess(!!data);
      setLoading(false);
    }

    checkAccess();
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
        <p>Loading...</p>
      </div>
    );
  }

  const buttonStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "10px 16px",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "14px",
  };

  const disabledButtonStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "10px 16px",
    background: "#ccc",
    color: "#666",
    textDecoration: "none",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "not-allowed",
    opacity: 0.5,
  };

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "32px" }}>
        Destination
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
          Race Information
        </h2>
        <p style={{ color: "#666", marginBottom: "16px", fontSize: "14px" }}>
          Learn about vaccination requirements and climate information for your race
          destination.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {hasAccess ? (
            <Link
              href="https://dashboard-delta-ten-55.vercel.app/admin/countries/morocco"
              style={buttonStyle}
            >
              View Destination
            </Link>
          ) : (
            <>
              <button
                disabled
                style={disabledButtonStyle}
              >
                View Destination
              </button>
              <span
                style={{
                  display: "inline-block",
                  background: "#b45309",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "6px",
                }}
              >
                Upgrade
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TourTriggerButton from "@/components/onboarding/TourTriggerButton";

export default function UserAccountDropdown() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    supabase.auth.getUser().then((result) => {
      setEmail(result.data?.user?.email ?? null);
    });

    return () => {
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!email) return null;

  const displayName = email.split("@")[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid var(--slate-200)",
          background: "transparent",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--slate-700)",
          fontFamily: "inherit",
          textAlign: "left",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--slate-100)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "var(--brand-100)",
            color: "var(--brand-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {displayName[0]?.toUpperCase()}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 98,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "#ffffff",
              border: "1px solid var(--slate-200)",
              borderRadius: "10px",
              boxShadow: "0 4px 6px rgba(0,0,0,.07)",
              zIndex: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--slate-100)",
              }}
            >
              <div style={{ fontSize: "10px", color: "var(--slate-400)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
                Signed in as
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--slate-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {email}
              </div>
            </div>

            <TourTriggerButton />

            <div style={{ borderTop: "1px solid var(--slate-100)" }} />

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "none",
                background: "none",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                color: "#dc2626",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fff1f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UserAccountDropdown() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    // Also get current user on mount
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

  if (!email) {
    return null;
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "none",
          border: "1px solid #ddd",
          padding: "8px 12px",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "14px",
          color: "#333",
        }}
      >
        {email.split("@")[0]}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            zIndex: 1000,
            minWidth: "200px",
            marginTop: "4px",
          }}
        >
          <div style={{ padding: "12px", borderBottom: "1px solid #eee" }}>
            <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
              Logged in as:
            </div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#333" }}>
              {email}
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "none",
              background: "none",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              color: "#d32f2f",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      )}
    </div>
  );
}

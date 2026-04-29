"use client";

import { useOnboarding } from "./OnboardingProvider";

export default function TourTriggerButton() {
  const { isAvailable, startTour, hasSeenTour } = useOnboarding();

  if (!isAvailable) return null;

  return (
    <button
      type="button"
      onClick={startTour}
      style={{
        width: "100%",
        padding: "10px 12px",
        border: "none",
        background: "none",
        textAlign: "left",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--brand-600)",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--brand-50)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      {hasSeenTour ? "Restart Tour" : "Start Tour"}
    </button>
  );
}

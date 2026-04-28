import Link from "next/link";
import { userHasFeature } from "@/lib/auth/user-features";
import { redirect } from "next/navigation";

export default async function DestinationPage() {
  const hasAccess = await userHasFeature("race_info");

  if (!hasAccess) {
    redirect("/athlete");
  }

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
        <Link
          href="https://dashboard-delta-ten-55.vercel.app/admin/countries/morocco"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            background: "#111",
            color: "#fff",
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          View Destination
        </Link>
      </div>
    </div>
  );
}

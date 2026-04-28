import Link from "next/link";

export default function InformationPage() {
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
        <Link
          href="/athlete/kit-list"
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
          View Kit List
        </Link>
      </div>
    </div>
  );
}

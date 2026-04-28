"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface FeatureGatedLinkProps {
  href: string;
  children: ReactNode;
  hasAccess: boolean;
  className?: string;
}

export default function FeatureGatedLink({
  href,
  children,
  hasAccess,
  className,
}: FeatureGatedLinkProps) {
  if (!hasAccess) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          className={className}
          style={{
            opacity: 0.5,
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {children}
          <span
            style={{
              display: "inline-block",
              background: "#b45309",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "6px",
              marginLeft: "4px",
            }}
          >
            Upgrade
          </span>
        </span>
      </div>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

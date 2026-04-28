"use client";

import { useState } from "react";
import Link from "next/link";

type Item = { href: string; label: string; requiresUpgrade?: boolean };

export default function SidebarDropdown({
  label,
  items,
}: {
  label: string;
  items: Item[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`sidebar-dropdown${open ? " sidebar-dropdown--open" : ""}`}>
      <button
        type="button"
        className="sidebar-dropdown__trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className="sidebar-dropdown__chevron">▼</span>
      </button>
      <div className="sidebar-dropdown__menu">
        {items.map((item) => (
          <div key={item.href} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Link href={item.href} className="sidebar-dropdown__link" style={{ flex: 1 }}>
              {item.label}
            </Link>
            {item.requiresUpgrade && (
              <span
                style={{
                  display: "inline-block",
                  background: "#b45309",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  marginRight: "8px",
                }}
              >
                Upgrade
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

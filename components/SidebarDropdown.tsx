"use client";

import { useState } from "react";
import Link from "next/link";

type Item = { href: string; label: string };

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
          <Link key={item.href} href={item.href} className="sidebar-dropdown__link">
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

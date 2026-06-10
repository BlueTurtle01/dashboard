"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "sidebar-collapsed";

export default function SidebarToggleButton() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.classList.contains("sidebar-collapsed"));
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) {
      document.documentElement.classList.add("sidebar-collapsed");
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      document.documentElement.classList.remove("sidebar-collapsed");
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <button
      onClick={toggle}
      className="sidebar-toggle-btn"
      aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="2" y1="4.5" x2="16" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="2" y1="13.5" x2="16" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

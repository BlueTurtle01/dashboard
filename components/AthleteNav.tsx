"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AthleteNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/athlete", label: "My Plan" },
    { href: "/athlete/sessions", label: "Sessions" },
    { href: "/athlete/log", label: "Log" },
    { href: "/athlete/progress", label: "Progress" },
  ];

  return (
    <nav className="bg-white border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-6 flex gap-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`text-sm font-semibold px-4 py-3 transition-colors ${
                isActive
                  ? "border-b-2 border-zinc-900 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

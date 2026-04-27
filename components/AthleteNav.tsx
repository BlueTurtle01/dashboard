"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AthleteNavProps {
  isSoloPlanHolder?: boolean;
}

export default function AthleteNav({ isSoloPlanHolder = false }: AthleteNavProps) {
  const pathname = usePathname();

  // Hide nav on profile page
  if (pathname.startsWith("/athlete/profile")) {
    return null;
  }

  const tabs = [
    { href: "/athlete", label: "My Plan" },
    { href: "/athlete/sessions", label: "Sessions" },
    ...(isSoloPlanHolder ? [] : [{ href: "/athlete/log", label: "Log" }]),
    { href: "/athlete/progress", label: "Progress" },
    ...(isSoloPlanHolder ? [{ href: "/athlete/library", label: "Library" }] : []),
  ];

  return (
    <nav className="bg-white border-b border-slate-200 -mx-6 px-6 mb-6">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`text-sm font-semibold px-4 py-3 transition-colors ${
                isActive
                  ? "border-b-2 border-indigo-600 text-indigo-700"
                  : "text-slate-500 hover:text-slate-800"
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

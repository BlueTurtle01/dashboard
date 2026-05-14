"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function PwaBottomNav() {
  const pathname = usePathname();

  const isPlanActive = pathname === "/plan" || pathname.startsWith("/plan/session");
  const isRaceActive = pathname === "/plan/race";

  return (
    <nav className="pwa-bottomnav">
      <Link
        href="/plan"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-4 border-t-2 transition-colors ${
          isPlanActive
            ? "border-zinc-900 text-zinc-900"
            : "border-transparent text-zinc-500 hover:text-zinc-700"
        }`}
      >
        <span className="text-xl">📋</span>
        <span className="text-xs font-medium">Plan</span>
      </Link>
      <Link
        href="/plan/race"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-4 border-t-2 transition-colors ${
          isRaceActive
            ? "border-zinc-900 text-zinc-900"
            : "border-transparent text-zinc-500 hover:text-zinc-700"
        }`}
      >
        <span className="text-xl">🏁</span>
        <span className="text-xs font-medium">Race</span>
      </Link>
    </nav>
  );
}

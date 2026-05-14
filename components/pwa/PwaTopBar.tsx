"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const ROUTE_TITLES: Record<string, string> = {
  "/plan": "My Plan",
  "/plan/session": "Session Details",
  "/plan/help": "Help & Support",
  "/plan/account": "Account",
  "/plan/race": "Race",
};

export default function PwaTopBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Determine title based on route
  let title = "My Plan";
  for (const [route, routeTitle] of Object.entries(ROUTE_TITLES)) {
    if (pathname.startsWith(route)) {
      title = routeTitle;
      break;
    }
  }

  // Show back button if not on the main plan page
  const showBack = pathname !== "/plan";

  return (
    <div className="pwa-topbar">
      <div className="flex-1">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-100 transition-colors"
            aria-label="Go back"
          >
            ←
          </button>
        )}
      </div>
      <h1 className="text-center flex-1 font-semibold text-zinc-900">{title}</h1>
      <div className="flex-1 flex justify-end gap-2">
        <Link
          href="/plan/account"
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-100 transition-colors"
          aria-label="Account"
        >
          👤
        </Link>
        <Link
          href="/plan/help"
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-100 transition-colors"
          aria-label="Help"
        >
          ?
        </Link>
      </div>
    </div>
  );
}

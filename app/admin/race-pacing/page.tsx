"use client";

/**
 * /admin/race-pacing — client component page
 *
 * Uses React's `use()` to unwrap the searchParams promise
 * (Next.js 15/16 pattern for client-component pages — see Next.js docs
 * "Reading searchParams and params in Client Components").
 *
 * The page itself does zero server-side work; all data fetching happens
 * inside PacingClient via a POST to /api/race-analysis/pacing-guide.
 */

import { use } from "react";
import PacingClient from "./PacingClient";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

export default function RacePacingPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = use(searchParams);

  const raceId =
    (Array.isArray(sp.race_id) ? sp.race_id[0] : sp.race_id) ?? "";
  const targetMinutes = parseFloat(
    (Array.isArray(sp.target_minutes) ? sp.target_minutes[0] : sp.target_minutes) ?? "0"
  );
  const raceName =
    (Array.isArray(sp.race_name) ? sp.race_name[0] : sp.race_name) ?? "Race";

  return (
    <PacingClient
      raceId={raceId}
      targetMinutes={targetMinutes}
      raceName={raceName}
    />
  );
}

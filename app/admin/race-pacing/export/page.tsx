"use client";

/**
 * /admin/race-pacing/export — PDF export page for a race pacing strategy.
 *
 * Opened in a new tab from the race-pacing page. Uses the same `use(searchParams)`
 * pattern as the parent page for Next.js 16 compatibility.
 */

import { use } from "react";
import PacingExportClient from "./PacingExportClient";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

export default function RacePacingExportPage({
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
    <PacingExportClient
      raceId={raceId}
      targetMinutes={targetMinutes}
      raceName={raceName}
    />
  );
}

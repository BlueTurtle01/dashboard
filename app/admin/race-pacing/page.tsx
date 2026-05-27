/**
 * /admin/race-pacing — server component shell
 *
 * Awaits the searchParams promise (Next.js 15/16 pattern) then passes plain
 * string/number props to the client component that owns all the UI logic.
 */

import PacingClient from "./PacingClient";

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function RacePacingPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;

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

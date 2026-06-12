/**
 * GET /api/race-intelligence/dnf-checkpoints?race_id=...
 *
 * For each DNF participant with checkpoint_times data, finds the last
 * checkpoint they reached and returns counts per checkpoint.
 * Also returns all checkpoints (with zero counts) and distances from start
 * derived from aid stations stored in races_meta.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export interface DnfCheckpointRow {
  cp_num: number;
  dnf_count: number;
  distance_km: number | null;
}

export interface DnfCheckpointResponse {
  has_data: boolean;
  total_dnf_with_checkpoints: number;
  by_checkpoint: DnfCheckpointRow[];
}

interface AidStation {
  km: number;
  name?: string;
}

export async function GET(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const race_id = searchParams.get("race_id");
    if (!race_id) return NextResponse.json({ error: "race_id required" }, { status: 400 });

    const supabase = await createClient();

    // Fetch ALL results with checkpoint_times to find max CP number across everyone
    const [{ data: allRows, error: allErr }, { data: dnfRows, error: dnfErr }, { data: metaRows, error: metaErr }] =
      await Promise.all([
        supabase
          .from("race_results")
          .select("checkpoint_times")
          .eq("race_id", race_id)
          .in("gender", ["Male", "Female"]),
        supabase
          .from("race_results")
          .select("checkpoint_times")
          .eq("race_id", race_id)
          .eq("result_status", "DNF")
          .in("gender", ["Male", "Female"]),
        supabase
          .from("races_meta")
          .select("meta_value")
          .eq("race_id", race_id)
          .eq("meta_key", "aid_stations")
          .maybeSingle(),
      ]);

    if (allErr) throw allErr;
    if (dnfErr) throw dnfErr;
    if (metaErr) throw metaErr;

    type Row = { checkpoint_times: Record<string, number> };

    // Build a map of cp_num → distance_km from aid stations (sorted by km, index 0 = CP1)
    const distanceMap = new Map<number, number>();
    if (metaRows?.meta_value) {
      try {
        const stations: AidStation[] = Array.isArray(metaRows.meta_value)
          ? metaRows.meta_value
          : JSON.parse(metaRows.meta_value as string);
        const sorted = [...stations].sort((a, b) => a.km - b.km);
        sorted.forEach((s, idx) => {
          distanceMap.set(idx + 1, s.km);
        });
      } catch {
        // ignore parse errors — distances stay null
      }
    }

    // Find max CP number across all participants
    let globalMaxCp = 0;
    for (const row of (allRows ?? []) as Row[]) {
      const ct = row.checkpoint_times ?? {};
      for (const k of Object.keys(ct)) {
        if (/^cp\d+$/.test(k) && ct[k] > 0) {
          const n = parseInt(k.slice(2), 10);
          if (n > globalMaxCp) globalMaxCp = n;
        }
      }
    }

    // Count DNFs at each checkpoint (last CP reached)
    const countsMap = new Map<number, number>();
    let rowsWithData = 0;

    for (const row of (dnfRows ?? []) as Row[]) {
      const ct = row.checkpoint_times ?? {};
      const cpKeys = Object.keys(ct).filter((k) => /^cp\d+$/.test(k) && ct[k] > 0);
      if (!cpKeys.length) continue;
      rowsWithData++;
      const lastCp = Math.max(...cpKeys.map((k) => parseInt(k.slice(2), 10)));
      countsMap.set(lastCp, (countsMap.get(lastCp) ?? 0) + 1);
    }

    // Build full CP list with zeros for CPs with no DNFs
    const by_checkpoint: DnfCheckpointRow[] = [];
    for (let cp = 1; cp <= globalMaxCp; cp++) {
      by_checkpoint.push({
        cp_num: cp,
        dnf_count: countsMap.get(cp) ?? 0,
        distance_km: distanceMap.get(cp) ?? null,
      });
    }

    return NextResponse.json({
      has_data: rowsWithData > 0,
      total_dnf_with_checkpoints: rowsWithData,
      by_checkpoint,
    } satisfies DnfCheckpointResponse);
  } catch (err) {
    console.error("[dnf-checkpoints]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

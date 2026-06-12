/**
 * GET /api/race-intelligence/dnf-checkpoints?race_id=...
 *
 * For each DNF participant with checkpoint_times data, finds the last
 * checkpoint they reached and returns counts per checkpoint.
 * Used to render the "DNF Dropout by Checkpoint" chart on the Race
 * Intelligence page.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export interface DnfCheckpointResponse {
  has_data: boolean;
  total_dnf_with_checkpoints: number;
  by_checkpoint: { cp_num: number; dnf_count: number }[];
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

    // Fetch DNF rows for Male/Female participants
    const { data, error } = await supabase
      .from("race_results")
      .select("checkpoint_times")
      .eq("race_id", race_id)
      .eq("result_status", "DNF")
      .in("gender", ["Male", "Female"]);

    if (error) throw error;

    const rows = (data ?? []) as { checkpoint_times: Record<string, number> }[];

    // For each row, find the highest CP key present (with a non-null value)
    const countsMap = new Map<number, number>();
    let rowsWithData = 0;

    for (const row of rows) {
      const ct = row.checkpoint_times ?? {};
      const cpKeys = Object.keys(ct).filter((k) => /^cp\d+$/.test(k) && ct[k] > 0);
      if (!cpKeys.length) continue;
      rowsWithData++;
      const lastCp = Math.max(...cpKeys.map((k) => parseInt(k.slice(2), 10)));
      countsMap.set(lastCp, (countsMap.get(lastCp) ?? 0) + 1);
    }

    const by_checkpoint = Array.from(countsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([cp_num, dnf_count]) => ({ cp_num, dnf_count }));

    return NextResponse.json({
      has_data: by_checkpoint.length > 0,
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

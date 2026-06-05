import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VALID_STEPS = ["profiles", "similarities", "clustering", "summaries", "projection", "all"];

export async function POST(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    step: string;
    params?: {
      minRaces?: number;
      topN?: number;
      simThreshold?: number;
      clusterMethod?: string;
      kmeansK?: number;
      dbscanEps?: number;
      dbscanMinSamples?: number;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { step, params = {} } = body;
  if (!VALID_STEPS.includes(step)) {
    return NextResponse.json({ error: `Invalid step: ${step}` }, { status: 400 });
  }

  // Create the run record before spawning so the UI has a run_id to poll
  const supabase = await createClient();
  const { data: runRecord, error: insertErr } = await supabase
    .from("als_pipeline_runs")
    .insert({ step, params: params ?? {}, status: "running" })
    .select("id")
    .single();

  if (insertErr || !runRecord) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create run record" },
      { status: 500 },
    );
  }

  const runId = runRecord.id as string;

  // Build CLI args
  const cliArgs = ["python/athlete_similarity.py", "--step", step];
  if (params.minRaces)         cliArgs.push("--min-races",          String(params.minRaces));
  if (params.topN)             cliArgs.push("--top-n",              String(params.topN));
  if (params.simThreshold)     cliArgs.push("--sim-threshold",      String(params.simThreshold));
  if (params.clusterMethod)    cliArgs.push("--cluster-method",     params.clusterMethod);
  if (params.kmeansK)          cliArgs.push("--kmeans-k",           String(params.kmeansK));
  if (params.dbscanEps)        cliArgs.push("--dbscan-eps",         String(params.dbscanEps));
  if (params.dbscanMinSamples) cliArgs.push("--dbscan-min-samples", String(params.dbscanMinSamples));

  const projectRoot = process.cwd();

  // Prefer .venv inside python/ directory, fall back to system python
  const venvPython = path.join(projectRoot, "python", ".venv", "Scripts", "python.exe");
  const pythonExe  = existsSync(venvPython) ? venvPython : "python";

  const child = spawn(pythonExe, cliArgs, {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const logLines: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    logLines.push(...chunk.toString().split("\n").filter(Boolean));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    logLines.push(...chunk.toString().split("\n").filter(Boolean).map((l) => `[err] ${l}`));
  });

  child.on("close", (code: number | null) => {
    // Use service role client to bypass RLS for this write-back
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    svc
      .from("als_pipeline_runs")
      .update({
        status: code === 0 ? "done" : "error",
        log_lines: logLines.slice(-200),  // keep last 200 lines
        error_msg: code !== 0 ? `Exit code ${code}` : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .then(() => {});
  });

  child.unref();

  return NextResponse.json({ run_id: runId, step, status: "running" });
}

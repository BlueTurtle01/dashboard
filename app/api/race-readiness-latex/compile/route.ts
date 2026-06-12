/**
 * POST /api/race-readiness-latex/compile
 *
 * Accepts a LaTeX document string, compiles it with pdflatex (twice, so the
 * table of contents resolves), and returns the resulting PDF binary.
 *
 * Requires pdflatex to be on the system PATH (TeX Live or MiKTeX).
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const STY_SRC = join(process.cwd(), "templates", "latex", "tortoise_report.sty");
import { getUserRoles } from "@/lib/auth/core";

export const maxDuration = 60;

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as { latex?: string };
    const { latex } = body;
    if (!latex || typeof latex !== "string") {
      return NextResponse.json({ error: "latex content required" }, { status: 400 });
    }

    const tmpDir = mkdtempSync(join(tmpdir(), "rr-latex-"));
    const texFile = join(tmpDir, "report.tex");
    const pdfFile = join(tmpDir, "report.pdf");
    const logFile = join(tmpDir, "report.log");

    try {
      writeFileSync(texFile, latex, "utf-8");

      // Copy brand style file into tmpDir so \usepackage{tortoise_report} resolves
      try { writeFileSync(join(tmpDir, "tortoise_report.sty"), readFileSync(STY_SRC)); } catch { /* compile proceeds without branding if .sty missing */ }

      // Prefer xelatex when LATEX_ENGINE=xelatex, fall back to pdflatex
      const engine = process.env.LATEX_ENGINE === "xelatex" ? "xelatex" : "pdflatex";
      // Quote paths in case they contain spaces
      const safeOut = `"${tmpDir}"`;
      const safeTex = `"${texFile}"`;
      const cmd = `${engine} -interaction=nonstopmode -halt-on-error -output-directory ${safeOut} ${safeTex}`;

      try {
        await execAsync(cmd, { timeout: 40_000 });
        await execAsync(cmd, { timeout: 40_000 }); // second pass resolves TOC page numbers
      } catch (err) {
        // Attempt to surface the actual LaTeX error from the log file
        let logSnippet = "";
        try {
          const log = readFileSync(logFile, "utf-8");
          const errorLines = log.split("\n").filter(l => l.startsWith("!")).slice(0, 6);
          logSnippet = errorLines.join("\n").trim();
        } catch { /* log may not exist */ }

        const msg = err instanceof Error ? err.message : String(err);
        const notFound =
          msg.includes("ENOENT") ||
          msg.includes("not found") ||
          msg.includes("not recognized") ||
          msg.includes("cannot find") ||
          msg.includes("No such file");

        return NextResponse.json(
          {
            error: notFound
              ? "pdflatex not found. Install TeX Live or MiKTeX and ensure pdflatex is on your PATH."
              : `Compilation failed.\n${logSnippet || msg}`,
          },
          { status: 422 },
        );
      }

      if (!existsSync(pdfFile)) {
        return NextResponse.json(
          { error: "PDF not produced. Ensure all required LaTeX packages (pgfplots, booktabs, xcolor, longtable, etc.) are installed." },
          { status: 422 },
        );
      }

      const pdfBuffer = readFileSync(pdfFile);
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="race-readiness.pdf"',
          "Content-Length": String(pdfBuffer.length),
        },
      });
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup is best-effort */ }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}

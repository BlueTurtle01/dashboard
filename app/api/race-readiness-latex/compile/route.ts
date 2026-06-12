/**
 * POST /api/race-readiness-latex/compile
 *
 * Accepts a LaTeX document string, compiles it with pdflatex (twice, so the
 * table of contents resolves), and returns the resulting PDF binary.
 *
 * Requires pdflatex to be on the system PATH, or installed in one of the
 * common Windows locations (MiKTeX user/system install, TeX Live).
 *
 * To install on Windows: https://miktex.org/download  (choose "Install for me only")
 * After installing MiKTeX, packages auto-install on first compile.
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { getUserRoles } from "@/lib/auth/core";

export const maxDuration = 60;

const STY_SRC = join(process.cwd(), "templates", "latex", "tortoise_report.sty");

const execAsync = promisify(exec);

/** Probe well-known Windows install locations for a LaTeX binary. */
function findLatexBinary(name: string): string {
  // Common MiKTeX install paths (user + system, 64-bit + 32-bit)
  const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  const programFiles  = process.env["ProgramFiles"]   ?? "C:\\Program Files";
  const programFiles86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  const candidates: string[] = [
    // MiKTeX — user install (most common on Windows)
    join(local, "Programs", "MiKTeX", "miktex", "bin", "x64", `${name}.exe`),
    join(local, "Programs", "MiKTeX", "miktex", "bin", `${name}.exe`),
    // MiKTeX — system install
    join(programFiles,   "MiKTeX", "miktex", "bin", "x64", `${name}.exe`),
    join(programFiles,   "MiKTeX", "miktex", "bin", `${name}.exe`),
    join(programFiles86, "MiKTeX", "miktex", "bin", "x64", `${name}.exe`),
    // MiKTeX 2.9 legacy paths
    join(local,          "Programs", "MiKTeX 2.9", "miktex", "bin", "x64", `${name}.exe`),
    join(programFiles,   "MiKTeX 2.9", "miktex", "bin", "x64", `${name}.exe`),
    // TeX Live (recent years, both windows and win32 subdirs)
    ...[2025, 2024, 2023, 2022, 2021, 2020].flatMap(yr => [
      `C:\\texlive\\${yr}\\bin\\windows\\${name}.exe`,
      `C:\\texlive\\${yr}\\bin\\win32\\${name}.exe`,
    ]),
    // Scoop (common Windows package manager)
    join(homedir(), "scoop", "apps", "miktex", "current", "miktex", "bin", "x64", `${name}.exe`),
    join(homedir(), "scoop", "apps", "latex", "current", "bin", "windows", `${name}.exe`),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return `"${p}"`;
  }

  // Not found in any known location — fall back to bare name and let the
  // shell resolve it (will produce ENOENT with a helpful message)
  return name;
}

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
      const engineName = process.env.LATEX_ENGINE === "xelatex" ? "xelatex" : "pdflatex";
      const engineBin  = findLatexBinary(engineName);

      const safeOut = `"${tmpDir}"`;
      const safeTex = `"${texFile}"`;
      const cmd = `${engineBin} -interaction=nonstopmode -halt-on-error -output-directory ${safeOut} ${safeTex}`;

      try {
        await execAsync(cmd, { timeout: 40_000 });
        await execAsync(cmd, { timeout: 40_000 }); // second pass resolves TOC page numbers
      } catch (err) {
        // Surface actual LaTeX error from the log file
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
              ? `${engineName} not found.\n\nInstall MiKTeX (recommended for Windows):\n  1. Download from miktex.org → "Install for me only"\n  2. Run the installer — packages auto-install on first use\n  3. Restart the dev server after installation\n\nOr install TeX Live from tug.org/texlive and ensure ${engineName} is on your PATH.`
              : `Compilation failed.\n${logSnippet || msg}`,
          },
          { status: 422 },
        );
      }

      if (!existsSync(pdfFile)) {
        return NextResponse.json(
          { error: "PDF not produced. Ensure pdflatex and all required LaTeX packages are installed (pgfplots, booktabs, xcolor, longtable, tcolorbox, tabularray, fancyhdr, xstring, enumitem)." },
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

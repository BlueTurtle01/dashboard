/**
 * Reusable LaTeX fragment renderers for the Tortoise Endurance report.
 * All functions return LaTeX strings. Call tex() on any user-supplied text
 * before passing it here.
 */

/* ── Escaping helper (also exported for page-level use) ───────────────────── */
export function tex(s: string | number | null | undefined): string {
  if (s == null) return "{--}";
  const str = String(s);
  return str
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}")
    .replace(/\|/g, "\\textbar{}");
}

/* ── Metric card grid ─────────────────────────────────────────────────────── */
export type CardVariant = "neutral" | "positive" | "warning" | "risk";

export interface MetricCard {
  label: string;         // already tex()-escaped
  value: string;         // already tex()-escaped, can contain \textbf etc.
  note?: string;         // already tex()-escaped
  variant?: CardVariant;
}

const CARD_ENV: Record<CardVariant, string> = {
  neutral:  "MetricCardBox",
  positive: "MetricCardGreen",
  warning:  "MetricCardAmber",
  risk:     "MetricCardRed",
};

/**
 * Render a row of metric cards.
 * Lays out in a minipage grid — up to 4 per row.
 * cardsPerRow: 2 or 4 (default 4 if ≥4 cards, otherwise 2)
 */
export function renderMetricGrid(cards: MetricCard[], cardsPerRow = 0): string {
  if (cards.length === 0) return "";
  const n = cardsPerRow > 0 ? cardsPerRow : cards.length <= 2 ? 2 : cards.length === 3 ? 3 : 4;
  const width = (1 / n - 0.02).toFixed(4);
  const lines: string[] = ["\\medskip", "\\noindent"];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const env = CARD_ENV[c.variant ?? "neutral"];
    lines.push(`\\begin{minipage}[t]{${width}\\linewidth}`);
    lines.push(`\\begin{${env}}{${c.label}}`);
    lines.push(`\\Large\\bfseries ${c.value}`);
    if (c.note) lines.push(`\\\\[2pt]\\small\\normalfont\\color{TortoiseDarkGrey} ${c.note}`);
    lines.push(`\\end{${env}}`);
    lines.push("\\end{minipage}");
    if (i < cards.length - 1) lines.push("\\hfill");
  }
  lines.push("\\medskip");
  return lines.join("\n");
}

/* ── Callout boxes ────────────────────────────────────────────────────────── */
export type CalloutType = "insight" | "positive" | "risk" | "priority";

const CALLOUT_ENV: Record<CalloutType, string> = {
  insight:  "InsightBox",
  positive: "PositiveBox",
  risk:     "RiskBox",
  priority: "PriorityBox",
};

export function renderCallout(type: CalloutType, title: string, body: string): string {
  const env = CALLOUT_ENV[type];
  return [
    `\\begin{${env}}{${title}}`,
    body,
    `\\end{${env}}`,
  ].join("\n");
}

/* ── Status badge ─────────────────────────────────────────────────────────── */
const BADGE_LABEL: Record<string, string> = {
  strong:      "Strong",
  met:         "Covered",
  moderate:    "Moderate",
  partial:     "Partial",
  major_gap:   "Major gap",
  none:        "None",
  surface_gap: "Surface gap",
  unknown:     "Unknown",
};

export function renderBadge(status: string): string {
  const label = BADGE_LABEL[status] ?? status;
  return `\\StatusBadge{${label}}`;
}

/* ── Progress rows ────────────────────────────────────────────────────────── */
export function renderProgressRow(
  label: string,
  valueText: string,
  ratio: number,
  color = "TortoiseGreen",
): string {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return `\\LabelledProgressBar{${label}}{${valueText}}{${safeRatio.toFixed(4)}}`;
}

/* ── Branded long table (TortoiseLongTable / tabularray) ──────────────────── */
/**
 * Render a full-width TortoiseLongTable.
 * colSpec: tabularray colspec string e.g. "X[3,l] X[1,r] X[1,r]"
 * headers: already-escaped strings
 * rows: each row is an array of already-escaped cell strings
 */
export function renderLongTable(
  colSpec: string,
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) return "";
  const lines: string[] = [];
  lines.push(`\\begin{TortoiseLongTable}{colspec={${colSpec}}}`);
  lines.push(headers.join(" & ") + " \\\\");
  for (const row of rows) {
    lines.push(row.join(" & ") + " \\\\");
  }
  lines.push("\\end{TortoiseLongTable}");
  return lines.join("\n");
}

/* ── Short centred booktabs table ─────────────────────────────────────────── */
/**
 * Compact centred table for 2–5 column summaries that fit on one page.
 * colDef: standard LaTeX col spec e.g. "ll" or "lrr"
 */
export function renderShortTable(
  colDef: string,
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) return "";
  const lines: string[] = [];
  lines.push("\\begin{center}");
  lines.push(`\\begin{tabular}{${colDef}}`);
  lines.push("\\toprule");
  lines.push(headers.map(h => `\\textbf{${h}}`).join(" & ") + " \\\\");
  lines.push("\\midrule");
  for (const row of rows) {
    lines.push(row.join(" & ") + " \\\\");
  }
  lines.push("\\bottomrule");
  lines.push("\\end{tabular}");
  lines.push("\\end{center}");
  return lines.join("\n");
}

/* ── Section header ───────────────────────────────────────────────────────── */
export function renderSectionHeader(title: string, subtitle?: string): string {
  const lines = [`\\section{${title}}`];
  if (subtitle) {
    lines.push(`\\textit{\\color{TortoiseDarkGrey}${subtitle}}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderSubsectionHeader(title: string): string {
  return `\\subsection*{${title}}`;
}

/* ── Two-column side-by-side boxes ───────────────────────────────────────── */
/**
 * Render two callout boxes side by side at 48% width each.
 * leftType/rightType are CalloutType values.
 */
export function renderTwoColumnCallouts(
  leftType: CalloutType, leftTitle: string, leftBody: string,
  rightType: CalloutType, rightTitle: string, rightBody: string,
): string {
  const leftEnv  = CALLOUT_ENV[leftType];
  const rightEnv = CALLOUT_ENV[rightType];
  return [
    "\\medskip",
    "\\noindent",
    "\\begin{minipage}[t]{0.48\\linewidth}",
    `\\begin{${leftEnv}}{${leftTitle}}`,
    leftBody,
    `\\end{${leftEnv}}`,
    "\\end{minipage}",
    "\\hfill",
    "\\begin{minipage}[t]{0.48\\linewidth}",
    `\\begin{${rightEnv}}{${rightTitle}}`,
    rightBody,
    `\\end{${rightEnv}}`,
    "\\end{minipage}",
    "\\medskip",
  ].join("\n");
}

/* ── Assessment card ──────────────────────────────────────────────────────── */
export interface AssessmentCardData {
  name: string;           // already tex()-escaped
  category?: string;
  aim?: string;
  description?: string;
  instructions: string[]; // already tex()-escaped
  whatToRecord?: string;
  notes?: string;
}

export function renderAssessmentCard(a: AssessmentCardData): string {
  const lines: string[] = [];
  lines.push(`\\begin{AssessmentCard}{${a.name}}`);
  const tags: string[] = [];
  if (a.category) tags.push(`\\textbf{Category:} ${tex(a.category.charAt(0).toUpperCase() + a.category.slice(1))}`);
  if (a.aim)      tags.push(`\\textbf{Identifies:} ${a.aim}`);
  if (tags.length > 0) lines.push(tags.join(" \\quad "));
  if (a.description) {
    lines.push("");
    lines.push(`\\small ${a.description}`);
  }
  if (a.instructions.length > 0) {
    lines.push("\\begin{enumerate}[leftmargin=1.4em,itemsep=1pt,topsep=3pt]");
    for (const step of a.instructions) lines.push(`\\item \\small ${step}`);
    lines.push("\\end{enumerate}");
  }
  if (a.whatToRecord) lines.push(`\\textbf{Record:} \\small ${a.whatToRecord}`);
  if (a.notes)        lines.push(`\\\\\\textit{\\small ${a.notes}}`);
  lines.push("\\end{AssessmentCard}");
  return lines.join("\n");
}

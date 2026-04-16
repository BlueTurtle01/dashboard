import { generatePlan } from "./generatePlan";
import { GeneratedPlan, PlanInput } from "./types";

export type ProgramTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  eventName?: string;
  weeksAvailable: number;
  trainingDaysPerWeek: number;
  createdAt: string;
  updatedAt: string;
  isCustom?: boolean;
  plan: GeneratedPlan;
};

const STORAGE_KEY = "custom_program_templates_v2";
const STATIC_TIMESTAMP = "2026-01-01T00:00:00.000Z";

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function normaliseTag(tag: string) {
  return tag.trim();
}

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of tags ?? []) {
    const tag = normaliseTag(rawTag);
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(tag);
  }

  return result;
}

function buildDeterministicPlan(input: PlanInput): GeneratedPlan {
  const generated = generatePlan(input);
  return {
    ...generated,
    id: `template-plan-${input.eventName}-${input.weeksAvailable}-${input.trainingDaysPerWeek}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-"),
    createdAt: STATIC_TIMESTAMP,
    updatedAt: STATIC_TIMESTAMP,
  };
}

function normaliseTemplate(template: ProgramTemplate): ProgramTemplate {
  return {
    ...template,
    description: template.description ?? "",
    tags: dedupeTags(template.tags ?? []),
    eventName: template.eventName ?? template.plan.eventName ?? "",
    weeksAvailable: template.weeksAvailable ?? template.plan.weeksAvailable,
    trainingDaysPerWeek:
      template.trainingDaysPerWeek ?? template.plan.trainingDaysPerWeek,
    createdAt: template.createdAt ?? STATIC_TIMESTAMP,
    updatedAt: template.updatedAt ?? STATIC_TIMESTAMP,
    isCustom: template.isCustom ?? false,
    plan: {
      ...template.plan,
      warnings: template.plan.warnings ?? [],
      weeks: template.plan.weeks ?? [],
      createdAt: template.plan.createdAt ?? STATIC_TIMESTAMP,
      updatedAt: template.plan.updatedAt ?? STATIC_TIMESTAMP,
    },
  };
}

function buildSearchText(template: ProgramTemplate) {
  return [
    template.name,
    template.description,
    template.eventName ?? "",
    template.weeksAvailable.toString(),
    template.trainingDaysPerWeek.toString(),
    ...(template.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

const defaultProgramTemplates: ProgramTemplate[] = [
  {
    id: "balanced-8-week",
    name: "Balanced 8 Week Build",
    description: "General 8-week endurance build with moderate training frequency.",
    tags: ["balanced", "8 weeks", "general", "moderate frequency"],
    eventName: "Target Event",
    weeksAvailable: 8,
    trainingDaysPerWeek: 4,
    createdAt: STATIC_TIMESTAMP,
    updatedAt: STATIC_TIMESTAMP,
    isCustom: false,
    plan: buildDeterministicPlan({
      eventName: "Target Event",
      eventDate: "2026-06-01",
      weeksAvailable: 8,
      trainingDaysPerWeek: 4,
      holidayWeeks: [],
    }),
  },
  {
    id: "high-frequency-12-week",
    name: "High Frequency 12 Week Build",
    description: "Longer build with more weekly sessions and progressive specificity.",
    tags: ["12 weeks", "high frequency", "specific", "build"],
    eventName: "Target Event",
    weeksAvailable: 12,
    trainingDaysPerWeek: 5,
    createdAt: STATIC_TIMESTAMP,
    updatedAt: STATIC_TIMESTAMP,
    isCustom: false,
    plan: buildDeterministicPlan({
      eventName: "Target Event",
      eventDate: "2026-08-01",
      weeksAvailable: 12,
      trainingDaysPerWeek: 5,
      holidayWeeks: [],
    }),
  },
  {
    id: "return-to-training-6-week",
    name: "Return To Training 6 Week",
    description: "Conservative rebuild template for athletes returning after interruption.",
    tags: ["6 weeks", "returning", "conservative", "low risk"],
    eventName: "Target Event",
    weeksAvailable: 6,
    trainingDaysPerWeek: 3,
    createdAt: STATIC_TIMESTAMP,
    updatedAt: STATIC_TIMESTAMP,
    isCustom: false,
    plan: buildDeterministicPlan({
      eventName: "Target Event",
      eventDate: "2026-05-15",
      weeksAvailable: 6,
      trainingDaysPerWeek: 3,
      holidayWeeks: [],
    }),
  },
].map(normaliseTemplate);

export function parseProgramTemplateTags(value: string) {
  return dedupeTags(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function formatProgramTemplateTags(tags: string[]) {
  return dedupeTags(tags ?? []).join(", ");
}

export function buildProgramTemplateId(name: string) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "program-template";

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadCustomProgramTemplates(): ProgramTemplate[] {
  if (!canUseBrowserStorage()) return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as ProgramTemplate[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((template) => normaliseTemplate({ ...template, isCustom: true }))
      .filter((template) => Boolean(template.id) && Boolean(template.name));
  } catch {
    return [];
  }
}

function saveCustomProgramTemplates(templates: ProgramTemplate[]) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(templates.map(normaliseTemplate))
  );
}

export function getDefaultProgramTemplates() {
  return defaultProgramTemplates.map(normaliseTemplate);
}

export function getAllProgramTemplates() {
  return [...getDefaultProgramTemplates(), ...loadCustomProgramTemplates()];
}

export function searchProgramTemplates(query: string) {
  const q = query.trim().toLowerCase();
  const templates = getAllProgramTemplates();

  if (!q) {
    return templates;
  }

  return templates.filter((template) => buildSearchText(template).includes(q));
}

export function getProgramTemplateById(id: string) {
  return getAllProgramTemplates().find((template) => template.id === id) ?? null;
}

export function createCustomProgramTemplate(template: ProgramTemplate) {
  const timestamp = new Date().toISOString();
  const nextTemplate = normaliseTemplate({
    ...template,
    isCustom: true,
    createdAt: template.createdAt ?? timestamp,
    updatedAt: timestamp,
    plan: {
      ...template.plan,
      updatedAt: timestamp,
    },
  });

  const existing = loadCustomProgramTemplates();
  const filtered = existing.filter((item) => item.id !== nextTemplate.id);
  saveCustomProgramTemplates([...filtered, nextTemplate]);
  return nextTemplate;
}

export function updateCustomProgramTemplate(template: ProgramTemplate) {
  const timestamp = new Date().toISOString();
  return createCustomProgramTemplate({
    ...template,
    isCustom: true,
    updatedAt: timestamp,
    plan: {
      ...template.plan,
      updatedAt: timestamp,
    },
  });
}

export function deleteCustomProgramTemplate(templateId: string) {
  const existing = loadCustomProgramTemplates();
  saveCustomProgramTemplates(existing.filter((item) => item.id !== templateId));
}

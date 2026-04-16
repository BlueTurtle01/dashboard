"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TRAINING_PURPOSES, TrainingPurpose } from "@/lib/planner/types";
import { scoreTemplate } from "@/lib/planner/assembleWeekFromTemplate";

type WeekTemplateOptionRow = {
  id: string;
  name: string;
  description: string | null;
  focus_type_id: string | null;
  training_purpose: string | null;
  week_focus_types:
    | { id: string; name: string; color: string | null }
    | { id: string; name: string; color: string | null }[]
    | null
    | undefined;
  condition_tags?: string[] | null;
};

type SessionSlot = {
  id: string;
  slot_name: string;
  session_template_id: string | null;
  notes: string | null;
  terrain: string | null;
  session_templates?: {
    id: string;
    name: string | null;
    type: string | null;
    activity: string | null;
    subtype: string | null;
    duration_minutes: number | null;
    target_intensity: string | null;
  } | null;
};

interface WeekPickerModalProps {
  templates: WeekTemplateOptionRow[];
  slotCounts: Record<string, number>;
  weekNumber: number;
  totalWeeks: number;
  mode: "insert" | "replace";
  onConfirm: (templateId: string) => void;
  onClose: () => void;
  disabled: boolean;
  athleteConditionKeys: string[];
  trainingDaysPerWeek: number;
  eventDate: string;
  prepRaceMarkers?: Array<{ weekNumber: number; name: string; date: string }>;
  athleteEquipmentUnavailable: string[];
  slotActivities: Record<string, string[]>;
}

const ACTIVITY_EQUIPMENT_MAP: Record<string, string> = {
  cycling: "bicycle",
  cycle: "bicycle",
  biking: "bicycle",
  swimming: "swimming_pool",
  swim: "swimming_pool",
};

function parseAdHocDetails(notes: string | null) {
  const details: {
    activity?: string;
    subtype?: string;
    duration?: string;
    distance?: string;
    intensity?: string;
    terrain?: string;
    strides?: string;
  } = {};

  if (!notes) return details;

  const lines = notes.split("\n");
  for (const line of lines) {
    if (line.includes("Activity:")) {
      const match = line.match(/Activity:\s*(.+)/);
      if (match) details.activity = match[1].trim();
    } else if (line.includes("Subtype:")) {
      const match = line.match(/Subtype:\s*(.+)/);
      if (match) details.subtype = match[1].trim();
    } else if (line.includes("Duration:")) {
      const match = line.match(/Duration:\s*(.+)/);
      if (match) details.duration = match[1].trim();
    } else if (line.includes("Distance:")) {
      const match = line.match(/Distance:\s*(.+)/);
      if (match) details.distance = match[1].trim();
    } else if (line.includes("Intensity:")) {
      const match = line.match(/Intensity:\s*(.+)/);
      if (match) details.intensity = match[1].trim();
    } else if (line.includes("Terrain:")) {
      const match = line.match(/Terrain:\s*(.+)/);
      if (match) details.terrain = match[1].trim();
    } else if (line.includes("Strides:")) {
      const match = line.match(/Strides:\s*(.+)/);
      if (match) details.strides = match[1].trim();
    }
  }

  return details;
}

export default function WeekPickerModal({
  templates,
  slotCounts,
  weekNumber,
  totalWeeks,
  mode,
  onConfirm,
  onClose,
  disabled,
  athleteConditionKeys,
  trainingDaysPerWeek,
  eventDate,
  prepRaceMarkers = [],
  athleteEquipmentUnavailable,
  slotActivities,
}: WeekPickerModalProps) {
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewSlots, setPreviewSlots] = useState<SessionSlot[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Calculate position label
  const ratio = (weekNumber - 1) / totalWeeks;
  let positionLabel = "Mid plan";
  let purposesToBoost: TrainingPurpose[] = [];

  if (ratio < 0.33) {
    positionLabel = "Early in plan";
    purposesToBoost = ["Early Base", "Late Base"];
  } else if (ratio > 0.67) {
    positionLabel = "Late in plan";
    purposesToBoost = ["Peak", "Taper", "Race Week"];
  } else {
    positionLabel = "Mid plan";
    purposesToBoost = ["Early Build", "Late Build"];
  }

  const conditionLabel: Record<string, string> = {
    heat: "heat acclimation",
    cold: "cold weather",
    altitude: "altitude",
    load_carriage: "load carriage",
    no_gym: "no-gym",
    night_running: "night running",
    sand: "sand terrain",
    technical_terrain: "technical terrain",
    multi_day: "multi-day stage",
  };

  function computeTemplateFit(
    template: WeekTemplateOptionRow,
  ): { score: number; bullets: { type: "match" | "warn"; text: string }[] } {
    const bullets: { type: "match" | "warn"; text: string }[] = [];
    let score = 0;

    // Phase fit (0–2 pts)
    const purpose = template.training_purpose as TrainingPurpose | null;
    const isPhaseMatch = purpose && allBoosted.includes(purpose);
    const isRecovery = purpose && ["Recovery", "Recovery from Prep Race", "Post-Race"].includes(purpose);

    if (isPhaseMatch) {
      score += 2;
      bullets.push({ type: "match", text: `✓ Well-timed: ${purpose} suits week ${weekNumber} of ${totalWeeks}` });
    } else if (isRecovery) {
      score += 1;
      bullets.push({ type: "match", text: `✓ Recovery template is always useful` });
    } else if (purpose) {
      score -= 1;
      const phaseLabel = ratio < 0.33 ? "early" : ratio > 0.67 ? "late" : "mid";
      bullets.push({ type: "warn", text: `⚠ ${purpose} is best for the ${phaseLabel} phase` });
    }

    // Condition match
    const conditionScore = scoreTemplate(template.condition_tags ?? [], athleteConditionKeys);
    score += conditionScore;

    if (template.condition_tags && template.condition_tags.length > 0) {
      for (const tag of template.condition_tags) {
        if (athleteConditionKeys.includes(tag)) {
          const label = conditionLabel[tag] || tag;
          bullets.push({ type: "match", text: `✓ Matches ${label} training requirements` });
        } else {
          const label = conditionLabel[tag] || tag;
          bullets.push({ type: "warn", text: `⚠ ${label} template — not relevant to this athlete` });
        }
      }
    }

    // Load fit
    const sessionCount = slotCounts[template.id] ?? 0;
    if (sessionCount <= trainingDaysPerWeek) {
      score += 1;
      bullets.push({ type: "match", text: `✓ ${sessionCount} sessions fits ${trainingDaysPerWeek} available training days` });
    } else if (sessionCount > trainingDaysPerWeek + 1) {
      score -= 1;
      bullets.push({ type: "warn", text: `⚠ ${sessionCount} sessions may exceed ${trainingDaysPerWeek} available training days` });
    }

    // Equipment availability
    const templateActivities = slotActivities[template.id] ?? [];
    const requiredEquipment = [
      ...new Set(
        templateActivities
          .map((a) => ACTIVITY_EQUIPMENT_MAP[a.toLowerCase()])
          .filter(Boolean) as string[]
      ),
    ];
    const blockedEquipment = requiredEquipment.filter((eq) =>
      athleteEquipmentUnavailable.includes(eq)
    );

    if (blockedEquipment.length > 0) {
      score -= 3;
      const labels = blockedEquipment.map((slug) =>
        slug === "bicycle" ? "bicycle" : "swimming pool"
      );
      bullets.push({
        type: "warn",
        text: `⚠ Contains ${labels.join(" and ")} sessions — athlete has marked this equipment unavailable. Sessions will need replacing.`,
      });
    }

    // Race proximity
    let weeksToEvent = 0;
    if (eventDate) {
      try {
        const eventDateObj = new Date(eventDate);
        const daysToEvent = Math.max(0, (eventDateObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        weeksToEvent = Math.ceil(daysToEvent / 7) - (totalWeeks - weekNumber);
      } catch {
        weeksToEvent = 0;
      }
    }

    if (weeksToEvent <= 2 && purpose && ["Race Week", "Taper"].includes(purpose)) {
      score += 2;
      bullets.push({ type: "match", text: `✓ Race in ~${Math.max(0, weeksToEvent)} weeks — taper template is well-timed` });
    } else if (weeksToEvent <= 4 && purpose && ["Taper", "Peak"].includes(purpose)) {
      score += 1;
      bullets.push({ type: "match", text: `✓ Approaching race — peak/taper phase appropriate` });
    } else if (weeksToEvent > 8 && purpose && ["Race Week", "Taper"].includes(purpose)) {
      score -= 1;
      bullets.push({ type: "warn", text: `⚠ Taper template — race is still ${weeksToEvent} weeks away` });
    }

    // Prep race fit
    const previousWeekMarker = prepRaceMarkers.find((m) => m.weekNumber === weekNumber - 1);
    if (previousWeekMarker && purpose) {
      if (["Recovery from Prep Race", "Recovery"].includes(purpose)) {
        score += 2;
        bullets.push({ type: "match", text: `✓ Follows prep race in week ${previousWeekMarker.weekNumber} — recovery week recommended` });
      } else {
        score -= 1;
        bullets.push({ type: "warn", text: `⚠ Week follows a prep race — consider a recovery template` });
      }
    }

    return { score, bullets };
  }

  // Always boost recovery templates (for labeling, kept for reference)
  const alwaysBoosted: TrainingPurpose[] = [
    "Recovery",
    "Recovery from Prep Race",
    "Post-Race",
  ];
  const allBoosted = [...new Set([...purposesToBoost, ...alwaysBoosted])];

  // Compute fit for all templates and sort by score
  const templateFits = useMemo(() => {
    const fits = new Map<string, ReturnType<typeof computeTemplateFit>>();
    for (const template of templates) {
      fits.set(template.id, computeTemplateFit(template));
    }
    return fits;
  }, [templates, weekNumber, totalWeeks, trainingDaysPerWeek, athleteConditionKeys, eventDate, slotCounts, prepRaceMarkers, allBoosted, ratio]);

  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      const aFit = templateFits.get(a.id);
      const bFit = templateFits.get(b.id);
      return (bFit?.score ?? 0) - (aFit?.score ?? 0);
    });
  }, [templates, templateFits]);

  async function loadPreview(templateId: string) {
    setPreviewTemplateId(templateId);
    setLoadingPreview(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("week_template_slots")
        .select(
          `
            id,
            slot_name,
            session_template_id,
            notes,
            terrain,
            session_templates (
              id,
              name,
              type,
              activity,
              subtype,
              duration_minutes,
              target_intensity
            )
          `
        )
        .eq("week_template_id", templateId)
        .order("sort_order", { ascending: true });

      if (!error && data) {
        setPreviewSlots((data ?? []) as unknown as SessionSlot[]);
      }
    } catch (err) {
      console.error("Failed to load preview:", err);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[75%] rounded-2xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-semibold">
          {mode === "insert" ? "Insert Week" : "Replace Week"} {weekNumber}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {positionLabel} · {totalWeeks} week plan · Templates ranked by relevance
        </p>

        <div className="mt-6 space-y-3">
          {sortedTemplates.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
              No templates available.
            </div>
          ) : (
            sortedTemplates.map((template) => {
              const isPreviewOpen = previewTemplateId === template.id;
              const fit = templateFits.get(template.id);
              const isRelevant = allBoosted.includes(
                template.training_purpose as TrainingPurpose
              );

              return (
                <div key={template.id}>
                  <div className="rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-zinc-900">
                          {template.name}
                        </div>
                        {template.description && (
                          <div className="mt-1 line-clamp-2 text-xs text-zinc-600">
                            {template.description}
                          </div>
                        )}
                        {/* Match bullets */}
                        <div className="mt-2 space-y-1">
                          {fit?.bullets && fit.bullets.length > 0 ? (
                            fit.bullets.map((bullet, i) => (
                              <div key={i} className={`flex items-start gap-1.5 text-xs ${
                                bullet.type === "match" ? "text-emerald-700" : "text-amber-700"
                              }`}>
                                <span className="mt-0.5 shrink-0">{bullet.type === "match" ? "✓" : "⚠"}</span>
                                <span>{bullet.text}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-zinc-400">General-purpose template</div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {template.training_purpose && (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                isRelevant
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {template.training_purpose}
                            </span>
                          )}
                          <span className="text-xs text-zinc-500">
                            {slotCounts[template.id] ?? 0} sessions
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadPreview(template.id)}
                          disabled={disabled || loadingPreview}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => onConfirm(template.id)}
                          disabled={disabled}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                        >
                          {mode === "insert" ? "Add" : "Replace"}
                        </button>
                      </div>
                    </div>

                    {/* Preview Panel */}
                    {isPreviewOpen && (
                      <div className="mt-3 border-t border-zinc-200 pt-3">
                        {loadingPreview ? (
                          <div className="text-xs text-zinc-500">
                            Loading sessions…
                          </div>
                        ) : previewSlots.length === 0 ? (
                          <div className="text-xs text-zinc-500">
                            No sessions in this template.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {previewSlots.map((slot) => {
                              const st = slot.session_templates;
                              const isAdHoc = !st;

                              let activity, subtype, duration, distance, intensity, terrain, strides;

                              if (isAdHoc) {
                                // Parse ad hoc details from notes
                                const parsed = parseAdHocDetails(slot.notes);
                                activity = parsed.activity;
                                subtype = parsed.subtype;
                                duration = parsed.duration;
                                distance = parsed.distance;
                                intensity = parsed.intensity;
                                terrain = parsed.terrain || (slot.terrain && slot.terrain !== "any" ? slot.terrain : null);
                                strides = parsed.strides;
                              } else {
                                // Use template fields
                                activity = st?.activity;
                                subtype = st?.subtype;
                                duration = st?.duration_minutes ? `${st.duration_minutes} min` : null;
                                intensity = st?.target_intensity;
                              }

                              // Build parts list for display
                              const parts = [activity, subtype, terrain]
                                .filter((p) => p && p !== "Not specified")
                                .join(" · ");

                              // Build metadata list
                              const metadata: string[] = [];
                              if (duration) metadata.push(duration);
                              if (distance) metadata.push(distance);
                              if (intensity) metadata.push(intensity);
                              if (strides) metadata.push(`${strides} strides`);
                              const metadataStr = metadata.join(" · ");

                              return (
                                <div
                                  key={slot.id}
                                  className="rounded-lg bg-zinc-50 px-3 py-2"
                                >
                                  <div className="text-xs font-medium text-zinc-900">
                                    {st?.name || slot.slot_name || "(Unnamed)"}
                                  </div>
                                  {parts && (
                                    <div className="mt-1 text-xs text-zinc-600">
                                      {parts}
                                    </div>
                                  )}
                                  {metadataStr && (
                                    <div className="mt-1 text-xs text-zinc-500">
                                      {metadataStr}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { TRAINING_PURPOSES, TrainingPurpose } from "@/lib/planner/types";

type WeekTemplateOptionRow = {
  id: string;
  name: string;
  description: string | null;
  focus_type_id: string | null;
  training_purpose: string | null;
  week_focus_types?: { id: string; name: string; color: string | null } | null;
};

interface WeekTemplatePickerProps {
  templates: WeekTemplateOptionRow[];
  slotCounts: Record<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: (templateId: string) => void;
  disabled: boolean;
}

export default function WeekTemplatePicker({
  templates,
  slotCounts,
  selectedId,
  onSelect,
  onAdd,
  disabled,
}: WeekTemplatePickerProps) {
  const [filterPurpose, setFilterPurpose] = useState<TrainingPurpose | "">("");

  const { recommended, others } = useMemo(() => {
    if (!filterPurpose) {
      return { recommended: [], others: templates };
    }

    const rec = templates.filter((t) => t.training_purpose === filterPurpose);
    const oth = templates.filter((t) => t.training_purpose !== filterPurpose);
    return { recommended: rec, others: oth };
  }, [templates, filterPurpose]);

  const focusType = (
    template: WeekTemplateOptionRow
  ): { id: string; name: string; color: string | null } | null => {
    const focus = template.week_focus_types;
    if (!focus) return null;
    if (Array.isArray(focus)) return focus[0] ?? null;
    return focus;
  };

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      {/* Purpose Filter */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase text-zinc-600">
          Filter by purpose
        </label>
        <select
          value={filterPurpose}
          onChange={(e) => setFilterPurpose(e.target.value as TrainingPurpose | "")}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
          disabled={disabled}
        >
          <option value="">All templates</option>
          {TRAINING_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Template List */}
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {/* Recommended Section */}
        {filterPurpose && recommended.length > 0 && (
          <>
            <div className="mb-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                ★ Recommended
              </span>
            </div>
            {recommended.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                focusType={focusType(template)}
                slotCount={slotCounts[template.id] ?? 0}
                isSelected={selectedId === template.id}
                onSelect={() => {
                  onSelect(template.id);
                  onAdd(template.id);
                }}
                disabled={disabled}
              />
            ))}
          </>
        )}

        {/* Other Templates Section */}
        {others.length > 0 && (
          <>
            {filterPurpose && recommended.length > 0 && (
              <div className="border-t border-zinc-200 py-2">
                <span className="text-xs font-medium text-zinc-500">Other templates</span>
              </div>
            )}
            {others.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                focusType={focusType(template)}
                slotCount={slotCounts[template.id] ?? 0}
                isSelected={selectedId === template.id}
                onSelect={() => {
                  onSelect(template.id);
                  onAdd(template.id);
                }}
                disabled={disabled}
              />
            ))}
          </>
        )}

        {templates.length === 0 && (
          <div className="py-4 text-center text-sm text-zinc-500">
            No templates available
          </div>
        )}
      </div>

      {/* Summary */}
      {filterPurpose && (
        <div className="text-xs text-zinc-500">
          {recommended.length} recommended · {others.length} others
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: WeekTemplateOptionRow;
  focusType: { id: string; name: string; color: string | null } | null;
  slotCount: number;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
}

function TemplateCard({
  template,
  focusType,
  slotCount,
  isSelected,
  onSelect,
  disabled,
}: TemplateCardProps) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`w-full rounded-lg border-2 bg-white p-3 text-left transition ${
        isSelected
          ? "border-blue-500 ring-1 ring-blue-200"
          : "border-zinc-200 hover:border-zinc-300"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-zinc-900">{template.name}</div>
          {template.description && (
            <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{template.description}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {focusType && (
              <span
                className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: focusType.color ? `${focusType.color}22` : undefined,
                  color: focusType.color ?? undefined,
                }}
              >
                {focusType.name}
              </span>
            )}
            {template.training_purpose && (
              <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {template.training_purpose}
              </span>
            )}
            <span className="text-xs text-zinc-500">{slotCount} slots</span>
          </div>
        </div>
      </div>
    </button>
  );
}

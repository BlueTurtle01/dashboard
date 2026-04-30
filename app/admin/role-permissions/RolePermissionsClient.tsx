"use client";

import { useState, useTransition } from "react";
import { NAV_ITEMS, ALL_ROLES, type NavItemKey, type ManagedRole } from "@/lib/nav-items";
import { toggleNavPermission } from "./actions";

type Props = {
  permissions: Record<ManagedRole, Set<NavItemKey>>;
};

const ROLE_LABELS: Record<ManagedRole, string> = {
  admin: "Admin",
  coach: "Coach",
  athlete: "Athlete",
  solo_plan_holder: "Solo Plan",
  creator: "Creator",
};

const SECTION_ORDER = ["Training", "Coach", "Admin"] as const;

export default function RolePermissionsClient({ permissions }: Props) {
  const [local, setLocal] = useState<Record<ManagedRole, Set<NavItemKey>>>(() => {
    const copy = {} as Record<ManagedRole, Set<NavItemKey>>;
    for (const role of ALL_ROLES) {
      copy[role] = new Set(permissions[role]);
    }
    return copy;
  });

  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function handleToggle(role: ManagedRole, navItem: NavItemKey) {
    if (role === "admin") return; // admin always has full access

    const key = `${role}:${navItem}`;
    const enabled = !local[role].has(navItem);

    setLocal((prev) => {
      const next = { ...prev, [role]: new Set(prev[role]) };
      enabled ? next[role].add(navItem) : next[role].delete(navItem);
      return next;
    });

    setSavingKey(key);
    setSavedKey(null);

    startTransition(async () => {
      await toggleNavPermission(role, navItem, enabled);
      setSavingKey(null);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
    });
  }

  const sections = SECTION_ORDER.map((section) => ({
    section,
    items: NAV_ITEMS.filter((item) => item.section === section),
  }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="py-3 pr-6 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Nav item
            </th>
            {ALL_ROLES.map((role) => (
              <th
                key={role}
                className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest text-zinc-500"
              >
                {ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map(({ section, items }) => (
            <>
              <tr key={section}>
                <td
                  colSpan={ALL_ROLES.length + 1}
                  className="pb-1 pt-6 text-xs font-bold uppercase tracking-[0.2em] text-zinc-400"
                >
                  {section}
                </td>
              </tr>
              {items.map((item) => (
                <tr key={item.key} className="border-b border-zinc-100">
                  <td className="py-3 pr-6 font-medium text-zinc-800">{item.label}</td>
                  {ALL_ROLES.map((role) => {
                    const key = `${role}:${item.key}`;
                    const isAdmin = role === "admin";
                    const checked = isAdmin || local[role].has(item.key);
                    const isSaving = savingKey === key;
                    const isSaved = savedKey === key;

                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={isAdmin || pending}
                          onClick={() => handleToggle(role, item.key)}
                          title={isAdmin ? "Admins always have full access" : undefined}
                          className={[
                            "mx-auto flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold transition",
                            isAdmin
                              ? "cursor-default border-zinc-200 bg-zinc-100 text-zinc-400"
                              : checked
                              ? isSaving
                                ? "border-emerald-300 bg-emerald-100 text-emerald-700 opacity-60"
                                : isSaved
                                ? "border-emerald-400 bg-emerald-500 text-white"
                                : "border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600"
                              : isSaving
                              ? "border-zinc-200 bg-zinc-50 text-zinc-400 opacity-60"
                              : "border-zinc-300 bg-white text-zinc-300 hover:border-zinc-400",
                          ].join(" ")}
                        >
                          {isAdmin ? "✓" : checked ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

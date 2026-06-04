export type NavItemKey =
  | "athlete_plan"
  | "athlete_chat"
  | "athlete_knowledge_base"
  | "athlete_information"
  | "athlete_profile"
  | "athlete_integrations"
  | "athlete_upgrades"
  | "coach_dashboard"
  | "coach_chat"
  | "coach_knowledge_base"
  | "coach_programs"
  | "coach_mobility"
  | "coach_gym_sessions"
  | "coach_profile"
  | "admin_panel"
  | "admin_knowledge_base"
  | "admin_library"
  | "admin_templates"
  | "admin_destinations"
  | "admin_config"
  | "admin_tools"
  | "admin_athlete_network";

export type NavItemDef = {
  key: NavItemKey;
  label: string;
  section: "Training" | "Coach" | "Admin" | "Help";
};

export const NAV_ITEMS: NavItemDef[] = [
  { key: "athlete_plan",           label: "My Plan",          section: "Training" },
  { key: "athlete_chat",           label: "Chat",             section: "Training" },
  { key: "athlete_knowledge_base", label: "Knowledge Base: Athlete", section: "Help" },
  { key: "athlete_information",    label: "Information",      section: "Training" },
  { key: "athlete_profile",        label: "Profile",          section: "Training" },
  { key: "athlete_integrations",   label: "Integrations",     section: "Training" },
  { key: "athlete_upgrades",       label: "Upgrades",         section: "Training" },
  { key: "coach_dashboard",        label: "Dashboard",        section: "Coach" },
  { key: "coach_chat",             label: "Chat",             section: "Coach" },
  { key: "coach_knowledge_base",   label: "Knowledge Base: Coach", section: "Help" },
  { key: "coach_programs",         label: "Programs",         section: "Coach" },
  { key: "coach_mobility",         label: "Mobility",         section: "Coach" },
  { key: "coach_gym_sessions",     label: "Gym Sessions",     section: "Coach" },
  { key: "coach_profile",          label: "My Profile",       section: "Coach" },
  { key: "admin_panel",            label: "Admin",            section: "Admin" },
  { key: "admin_knowledge_base",   label: "Knowledge Base: Admin", section: "Help" },
  { key: "admin_library",          label: "Library",          section: "Admin" },
  { key: "admin_templates",        label: "Templates",        section: "Admin" },
  { key: "admin_destinations",     label: "Destinations",     section: "Admin" },
  { key: "admin_config",           label: "Config",           section: "Admin" },
  { key: "admin_tools",            label: "Tools",            section: "Admin" },
  { key: "admin_athlete_network", label: "Athlete Network",  section: "Admin" },
];

export const ALL_ROLES = ["admin", "coach", "athlete", "creator"] as const;
export type ManagedRole = (typeof ALL_ROLES)[number];

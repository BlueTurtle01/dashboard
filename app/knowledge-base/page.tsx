import { redirect } from "next/navigation";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import {
  getFaqQuestionsForAdmin,
  getFlaggedQuestions,
  getQuestionsForCoach,
  getCoachFaqQuestions,
} from "@/lib/actions/knowledge-base";
import KnowledgeBaseClient from "./KnowledgeBaseClient";

export default async function KnowledgeBasePage() {
  const roles = await getCurrentUserRoles();
  if (roles.length === 0) {
    redirect("/login");
  }

  let allowedNavItems = new Set<string>();
  if (!roles.includes("admin")) {
    const supabase = await createClient();
    const { data: permissions } = await supabase
      .from("role_nav_permissions")
      .select("nav_item")
      .in("role", roles)
      .eq("enabled", true);

    allowedNavItems = new Set(permissions?.map((row) => row.nav_item) ?? []);
  }

  const hasPermission = (navItem: string) =>
    roles.includes("admin") || allowedNavItems.has(navItem);

  const canViewAdminKb = roles.includes("admin");
  const canViewCoachKb =
    roles.includes("coach") || hasPermission("coach_knowledge_base");
  const canViewAthleteKb =
    roles.includes("athlete") ||
    roles.includes("solo_plan_holder") ||
    hasPermission("athlete_knowledge_base");

  if (!canViewAthleteKb && !canViewCoachKb && !canViewAdminKb) {
    redirect("/support");
  }

  const [initialCoachQuestions, initialCoachFaqQuestions, initialFlaggedQuestions, initialFaqQuestions] = await Promise.all([
    canViewCoachKb ? getQuestionsForCoach() : Promise.resolve([]),
    canViewCoachKb ? getCoachFaqQuestions() : Promise.resolve([]),
    canViewAdminKb ? getFlaggedQuestions() : Promise.resolve([]),
    canViewAdminKb ? getFaqQuestionsForAdmin() : Promise.resolve([]),
  ]);

  return (
    <KnowledgeBaseClient
      canViewAthleteKb={canViewAthleteKb}
      canViewCoachKb={canViewCoachKb}
      canViewAdminKb={canViewAdminKb}
      initialCoachQuestions={initialCoachQuestions}
      initialCoachFaqQuestions={initialCoachFaqQuestions}
      initialFlaggedQuestions={initialFlaggedQuestions}
      initialFaqQuestions={initialFaqQuestions}
    />
  );
}

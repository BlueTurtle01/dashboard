import { redirect } from "next/navigation";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import {
  getFaqQuestionsForAdmin,
  getFlaggedQuestions,
  getQuestionsForCoach,
  getRaceQuestionsForAthlete,
  getRaceQuestionsForCoach,
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

  const canViewRaceKb = canViewAthleteKb || canViewCoachKb;

  if (!canViewAthleteKb && !canViewCoachKb && !canViewAdminKb) {
    redirect("/support");
  }

  const [
    initialCoachQuestions,
    initialFlaggedQuestions,
    initialFaqQuestions,
    initialAthleteRaceQuestions,
    initialCoachRaceQuestions,
  ] = await Promise.all([
    canViewCoachKb ? getQuestionsForCoach() : Promise.resolve([]),
    canViewAdminKb ? getFlaggedQuestions() : Promise.resolve([]),
    canViewAdminKb ? getFaqQuestionsForAdmin() : Promise.resolve([]),
    canViewRaceKb && canViewAthleteKb ? getRaceQuestionsForAthlete() : Promise.resolve([]),
    canViewRaceKb && canViewCoachKb ? getRaceQuestionsForCoach() : Promise.resolve([]),
  ]);

  return (
    <KnowledgeBaseClient
      canViewAthleteKb={canViewAthleteKb}
      canViewCoachKb={canViewCoachKb}
      canViewAdminKb={canViewAdminKb}
      canViewRaceKb={canViewRaceKb}
      initialCoachQuestions={initialCoachQuestions}
      initialFlaggedQuestions={initialFlaggedQuestions}
      initialFaqQuestions={initialFaqQuestions}
      initialAthleteRaceQuestions={initialAthleteRaceQuestions}
      initialCoachRaceQuestions={initialCoachRaceQuestions}
    />
  );
}

import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import { getQuestionsForCoach } from "@/lib/actions/knowledge-base";
import CoachKbClient from "./CoachKbClient";

export default async function CoachKnowledgeBase() {
  const hasAccess = await userHasRole("coach");
  if (!hasAccess && !(await userHasRole("admin"))) {
    redirect("/login");
  }

  const questions = await getQuestionsForCoach();

  return <CoachKbClient initialQuestions={questions} />;
}

import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import { getFaqQuestionsForAdmin, getFlaggedQuestions } from "@/lib/actions/knowledge-base";
import AdminKbClient from "./AdminKbClient";

export default async function AdminKnowledgeBase() {
  const isAdmin = await userHasRole("admin");
  if (!isAdmin) {
    redirect("/login");
  }

  const [flaggedQuestions, faqQuestions] = await Promise.all([
    getFlaggedQuestions(),
    getFaqQuestionsForAdmin(),
  ]);

  return (
    <AdminKbClient
      initialFlaggedQuestions={flaggedQuestions}
      initialFaqQuestions={faqQuestions}
    />
  );
}

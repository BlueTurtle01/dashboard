"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminKbClient from "./AdminKbClient";
import CoachKbClient from "./CoachKbClient";
import AthleteKnowledgeBase from "./AthleteKbClient";
import { TutorialProvider } from "@/lib/context/TutorialContext";
import type {
  FlaggedQuestionWithDetails,
  QuestionWithAnswers,
} from "@/lib/actions/knowledge-base";

type KnowledgeBaseTab = "athlete" | "coach" | "admin";

type KnowledgeBaseClientProps = {
  canViewAthleteKb: boolean;
  canViewCoachKb: boolean;
  canViewAdminKb: boolean;
  initialCoachQuestions: QuestionWithAnswers[];
  initialFlaggedQuestions: FlaggedQuestionWithDetails[];
  initialFaqQuestions: QuestionWithAnswers[];
};

function KnowledgeBaseClientContent({
  canViewAthleteKb,
  canViewCoachKb,
  canViewAdminKb,
  initialCoachQuestions,
  initialFlaggedQuestions,
  initialFaqQuestions,
}: KnowledgeBaseClientProps) {
  const tabs = [
    canViewAthleteKb ? { key: "athlete" as const, label: "Athletes" } : null,
    canViewCoachKb ? { key: "coach" as const, label: "Coaches" } : null,
    canViewAdminKb ? { key: "admin" as const, label: "Admin" } : null,
  ].filter((tab): tab is { key: KnowledgeBaseTab; label: string } => Boolean(tab));

  const [activeTab, setActiveTab] = useState<KnowledgeBaseTab>(tabs[0]?.key ?? "athlete");

  if (tabs.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-red-800">You do not have access to the knowledge base.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="mb-1 text-2xl font-bold text-zinc-900">Knowledge Base</h1>
          <p className="text-sm text-zinc-500">Questions and answers for athletes, coaches, and platform guidance.</p>
        </div>

        {tabs.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  activeTab === tab.key
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === "athlete" && canViewAthleteKb && <AthleteKnowledgeBase />}
      {activeTab === "coach" && canViewCoachKb && (
        <CoachKbClient initialQuestions={initialCoachQuestions} />
      )}
      {activeTab === "admin" && canViewAdminKb && (
        <AdminKbClient
          initialFlaggedQuestions={initialFlaggedQuestions}
          initialFaqQuestions={initialFaqQuestions}
        />
      )}
    </div>
  );
}

export default function KnowledgeBaseClient(props: KnowledgeBaseClientProps) {
  const searchParams = useSearchParams();
  const tutorial = searchParams.get("tutorial");
  const isInTutorial = tutorial === "knowledge-base";

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="knowledge-base">
      <KnowledgeBaseClientContent {...props} />
    </TutorialProvider>
  );
}

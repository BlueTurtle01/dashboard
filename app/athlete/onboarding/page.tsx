"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Tutorial = {
  id: string;
  title: string;
  description: string;
  videoUrl?: string;
  completed: boolean;
  href?: string;
};

const TUTORIALS: Omit<Tutorial, "completed">[] = [
  {
    id: "1",
    title: "Getting Started with Your Plan",
    description: "Learn how to navigate your training plan and understand how to use the platform.",
    href: "/athlete?tutorial=plan",
  },
  {
    id: "2",
    title: "Logging Your Sessions",
    description: "Track your completed workouts and provide feedback on your training.",
    href: "/athlete/log?tutorial=log",
  },
  {
    id: "3",
    title: "Using Chat with Your Coach",
    description: "Communicate with your coach and ask questions about your training.",
    href: "/athlete/chat?tutorial=chat",
  },
  {
    id: "4",
    title: "Exploring the Knowledge Base",
    description: "Find answers to common questions and learn tips for better training.",
    href: "/knowledge-base?tutorial=knowledge-base",
  },
  {
    id: "5",
    title: "Managing Your Profile",
    description: "Update your personal information and training preferences.",
  },
  {
    id: "6",
    title: "Integrations",
    description: "Connect your training apps like Strava to sync your activities.",
  },
  {
    id: "7",
    title: "Planning Your Event",
    description: "Set up your race destination and create a kit list for your event.",
  },
  {
    id: "8",
    title: "Getting Help",
    description: "Learn how to find support and suggest features you'd like to see.",
  },
];

export default function AthleteOnboardingPage() {
  const supabase = createClient();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initializeTutorials() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Try to load saved completion state from localStorage
      const savedCompleted = localStorage.getItem(`athlete_onboarding_${user.id}`);
      const completedSet = savedCompleted ? new Set(JSON.parse(savedCompleted)) : new Set<string>();

      const tutorialsWithStatus = TUTORIALS.map((t) => ({
        ...t,
        completed: completedSet.has(t.id),
      }));

      setTutorials(tutorialsWithStatus);
      setLoading(false);
    }

    void initializeTutorials();
  }, []);

  async function toggleTutorial(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setTutorials((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );

    // Save to localStorage
    const completedTutorials = tutorials
      .filter((t) => t.id !== id ? t.completed : !tutorials.find((x) => x.id === id)?.completed)
      .map((t) => t.id);

    localStorage.setItem(`athlete_onboarding_${user.id}`, JSON.stringify(completedTutorials));
  }

  const completedCount = tutorials.filter((t) => t.completed).length;
  const totalCount = tutorials.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="rounded-2xl border bg-white p-8">
            Loading…
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Athlete Onboarding</h1>
          <p className="mt-2 text-zinc-600">
            Complete these tutorials to get the most out of your training platform.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 rounded-2xl border bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-zinc-900">Your Progress</span>
            <span className="text-sm font-semibold text-zinc-600">
              {completedCount} of {totalCount} completed
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs text-zinc-500">
            {progressPercentage}% complete
          </div>
        </div>

        {/* Tutorials Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {tutorials.map((tutorial) => {
            const TutorialCard = (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-sm">
                {/* Checkbox */}
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => void toggleTutorial(tutorial.id)}
                    className="flex h-6 w-6 items-center justify-center rounded border-2 transition"
                    style={{
                      borderColor: tutorial.completed ? "#059669" : "#d4d4d8",
                      backgroundColor: tutorial.completed ? "#059669" : "white",
                    }}
                  >
                    {tutorial.completed && (
                      <svg
                        className="h-4 w-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Content */}
                <h3
                  className={`text-lg font-semibold transition ${
                    tutorial.completed
                      ? "text-zinc-500 line-through"
                      : "text-zinc-900"
                  }`}
                >
                  {tutorial.title}
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  {tutorial.description}
                </p>

                {tutorial.href && !tutorial.completed && (
                  <div className="mt-4 pt-4 border-t border-zinc-100">
                    <Link
                      href={tutorial.href}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                    >
                      Start Tutorial →
                    </Link>
                  </div>
                )}
              </div>
            );

            return (
              <div
                key={tutorial.id}
                className="text-left"
              >
                {TutorialCard}
              </div>
            );
          })}
        </div>

        {/* Completion Message */}
        {completedCount === totalCount && totalCount > 0 && (
          <div className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
            <div className="flex items-start gap-3">
              <svg
                className="mt-1 h-6 w-6 flex-shrink-0 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="font-semibold text-emerald-900">Onboarding Complete!</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  You're all set! Start using the platform to track your training and achieve your goals.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

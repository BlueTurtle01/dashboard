"use server";

import { createClient } from "@/lib/supabase/server";

export type KbQuestion = {
  id: string;
  title: string;
  body: string;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
};

export type KbAnswer = {
  id: string;
  question_id: string;
  body: string;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
};

export type QuestionWithAnswers = KbQuestion & {
  answers: KbAnswer[];
  answer_count: number;
};

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated");
  return { supabase, user };
}

async function requireCoach() {
  const { supabase, user } = await requireAuth();
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  const hasCoachRole = (roles ?? []).some((r: any) => r.role === "coach" || r.role === "admin");
  if (!hasCoachRole) throw new Error("Forbidden: coach or admin role required");
  return { supabase, user };
}

function getUserDisplayName(user: any): string {
  return user.user_metadata?.full_name ?? user.email ?? "Anonymous";
}

function formatCoachName(fullName: string): string {
  const firstName = fullName.split(/[\s@]/)[0];
  return `Coach ${firstName}`;
}

export async function submitQuestion(
  title: string,
  body: string
): Promise<{ error?: string; questionId?: string }> {
  const { supabase, user } = await requireAuth();

  const displayName = getUserDisplayName(user);

  const { data, error } = await supabase
    .from("kb_questions")
    .insert({
      title: title.trim(),
      body: body.trim(),
      submitted_by: user.id,
      submitted_by_name: displayName,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { questionId: data?.id };
}

export async function getQuestions(search?: string): Promise<QuestionWithAnswers[]> {
  const supabase = await createClient();

  let query = supabase
    .from("kb_questions")
    .select("id, title, body, submitted_by, submitted_by_name, created_at")
    .order("created_at", { ascending: false });

  const { data: questions, error } = await query;

  if (error) throw new Error(error.message);

  const questionIds = (questions ?? []).map((q) => q.id);

  let answersData: KbAnswer[] = [];
  if (questionIds.length > 0) {
    const { data, error: answersError } = await supabase
      .from("kb_answers")
      .select("id, question_id, body, submitted_by, submitted_by_name, created_at")
      .in("question_id", questionIds)
      .order("created_at");

    if (answersError) throw new Error(answersError.message);
    answersData = data ?? [];
  }

  const answersByQuestionId = new Map<string, KbAnswer[]>();
  for (const answer of answersData) {
    const arr = answersByQuestionId.get(answer.question_id) ?? [];
    arr.push(answer);
    answersByQuestionId.set(answer.question_id, arr);
  }

  const result: QuestionWithAnswers[] = (questions ?? [])
    .filter((q) => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        q.title.toLowerCase().includes(searchLower) ||
        q.body.toLowerCase().includes(searchLower)
      );
    })
    .map((q) => ({
      ...q,
      answers: answersByQuestionId.get(q.id) ?? [],
      answer_count: (answersByQuestionId.get(q.id) ?? []).length,
    }));

  return result;
}

export async function getQuestionsForCoach(): Promise<QuestionWithAnswers[]> {
  const { supabase } = await requireCoach();

  const { data: questions, error } = await supabase
    .from("kb_questions")
    .select("id, title, body, submitted_by, submitted_by_name, created_at");

  if (error) throw new Error(error.message);

  const questionIds = (questions ?? []).map((q) => q.id);

  let answersData: (KbAnswer & { question_id: string })[] = [];
  if (questionIds.length > 0) {
    const { data, error: answersError } = await supabase
      .from("kb_answers")
      .select("id, question_id, body, submitted_by, submitted_by_name, created_at")
      .in("question_id", questionIds);

    if (answersError) throw new Error(answersError.message);
    answersData = data ?? [];
  }

  const answersByQuestionId = new Map<string, KbAnswer[]>();
  for (const answer of answersData) {
    const arr = answersByQuestionId.get(answer.question_id) ?? [];
    arr.push(answer);
    answersByQuestionId.set(answer.question_id, arr);
  }

  const result: QuestionWithAnswers[] = (questions ?? [])
    .map((q) => ({
      ...q,
      answers: answersByQuestionId.get(q.id) ?? [],
      answer_count: (answersByQuestionId.get(q.id) ?? []).length,
    }))
    .sort((a, b) => {
      if (a.answer_count !== b.answer_count) {
        return a.answer_count - b.answer_count;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return result;
}

export async function submitAnswer(
  questionId: string,
  body: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireCoach();

  const answerCount = await supabase
    .from("kb_answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId);

  if ((answerCount.count ?? 0) >= 3) {
    return { error: "Maximum 3 answers per question reached" };
  }

  const hasAnswered = await supabase
    .from("kb_answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId)
    .eq("submitted_by", user.id);

  if ((hasAnswered.count ?? 0) > 0) {
    return { error: "You have already answered this question" };
  }

  const displayName = getUserDisplayName(user);
  const coachDisplayName = formatCoachName(displayName);
  const isFirstAnswer = (answerCount.count ?? 0) === 0;

  const { error } = await supabase.from("kb_answers").insert({
    question_id: questionId,
    body: body.trim(),
    submitted_by: user.id,
    submitted_by_name: coachDisplayName,
  });

  if (error) return { error: error.message };

  if (isFirstAnswer) {
    const { data: question } = await supabase
      .from("kb_questions")
      .select("submitted_by")
      .eq("id", questionId)
      .single();

    if (question?.submitted_by) {
      const notifyError = await supabase.from("kb_answer_notifications").insert({
        question_id: questionId,
        athlete_user_id: question.submitted_by,
        read: false,
      });

      if (notifyError.error) {
        return { error: `Answer posted but notification failed: ${notifyError.error.message}` };
      }
    }
  }

  return {};
}

export async function getMyKbNotifications(): Promise<number> {
  const { supabase, user } = await requireAuth();

  const { count, error } = await supabase
    .from("kb_answer_notifications")
    .select("id", { count: "exact", head: true })
    .eq("athlete_user_id", user.id)
    .eq("read", false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markKbNotificationsRead(): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();

  const { error } = await supabase
    .from("kb_answer_notifications")
    .update({ read: true })
    .eq("athlete_user_id", user.id)
    .eq("read", false);

  if (error) return { error: error.message };
  return {};
}

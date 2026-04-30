"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type KbQuestionType = "community" | "faq";
export type KbQuestionAudience = "athlete" | "coach";

export type KbQuestion = {
  id: string;
  title: string;
  body: string;
  type: KbQuestionType;
  audience: KbQuestionAudience;
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

type UserRoleRow = {
  role: string | null;
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
  const roleRows = (roles ?? []) as UserRoleRow[];
  const hasCoachRole = roleRows.some((r) => r.role === "coach" || r.role === "admin");
  if (!hasCoachRole) throw new Error("Forbidden: coach or admin role required");
  return { supabase, user, roles: roleRows.map((r) => r.role).filter((role): role is string => Boolean(role)) };
}

async function requireAdmin() {
  const { supabase, user } = await requireAuth();
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  const roleRows = (roles ?? []) as UserRoleRow[];
  const hasAdminRole = roleRows.some((r) => r.role === "admin");
  if (!hasAdminRole) throw new Error("Forbidden: admin role required");
  return { supabase, user };
}

async function requireCoachKnowledgeBaseAccess() {
  const { supabase, user } = await requireAuth();
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  const roleRows = (roles ?? []) as UserRoleRow[];
  const roleNames = roleRows.map((r) => r.role).filter((role): role is string => Boolean(role));
  if (roleNames.includes("admin") || roleNames.includes("coach")) {
    return { supabase, user };
  }

  if (roleNames.length > 0) {
    const { data: permissions, error: permissionError } = await supabase
      .from("role_nav_permissions")
      .select("nav_item")
      .in("role", roleNames)
      .eq("nav_item", "coach_knowledge_base")
      .eq("enabled", true);

    if (permissionError) throw new Error(permissionError.message);
    if ((permissions ?? []).length > 0) {
      return { supabase, user };
    }
  }

  throw new Error("Forbidden: coach knowledge base access required");
}

function getUserDisplayName(user: User): string {
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
  const questionTitle = title.trim();
  const questionBody = body.trim() || questionTitle;

  if (!questionTitle) {
    return { error: "Please provide a question title" };
  }

  const { data, error } = await supabase
    .from("kb_questions")
    .insert({
      title: questionTitle,
      body: questionBody,
      type: "community",
      audience: "athlete",
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

  const query = supabase
    .from("kb_questions")
    .select("id, title, body, type, audience, submitted_by, submitted_by_name, created_at")
    .eq("audience", "athlete")
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
  const { supabase } = await requireCoachKnowledgeBaseAccess();

  const { data: questions, error } = await supabase
    .from("kb_questions")
    .select("id, title, body, type, audience, submitted_by, submitted_by_name, created_at")
    .or("type.eq.community,audience.eq.coach");

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
  const { supabase, user, roles } = await requireCoach();

  const { data: questionToAnswer, error: questionError } = await supabase
    .from("kb_questions")
    .select("type")
    .eq("id", questionId)
    .single();

  if (questionError) return { error: questionError.message };
  if (questionToAnswer?.type === "faq" && !roles.includes("admin")) {
    return { error: "FAQ questions can only be answered by admins" };
  }

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

  // Fetch coach profile to get first name
  const { data: coachProfile } = await supabase
    .from("coach_profiles")
    .select("first_name")
    .eq("user_id", user.id)
    .maybeSingle();

  let coachDisplayName = "Coach";
  if (coachProfile?.first_name) {
    coachDisplayName = `Coach ${coachProfile.first_name}`;
  } else {
    // Fallback: extract first name from email or full name
    const displayName = getUserDisplayName(user);
    coachDisplayName = formatCoachName(displayName);
  }

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

export async function flagQuestion(
  questionId: string,
  reason: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireCoach();

  const { error } = await supabase.from("kb_flagged_questions").upsert({
    question_id: questionId,
    flagged_by: user.id,
    flag_reason: reason.trim(),
    reviewed: false,
  });

  if (error) return { error: error.message };
  return {};
}

export async function submitFaqQuestion(
  title: string,
  answer: string,
  audience: KbQuestionAudience = "athlete"
): Promise<{ error?: string; questionId?: string }> {
  const { supabase, user } = await requireAdmin();

  const questionTitle = title.trim();
  const answerBody = answer.trim();

  if (!questionTitle || !answerBody) {
    return { error: "Please provide a FAQ title and answer" };
  }

  if (audience !== "athlete" && audience !== "coach") {
    return { error: "Please choose a valid FAQ audience" };
  }

  const { data: question, error: questionError } = await supabase
    .from("kb_questions")
    .insert({
      title: questionTitle,
      body: questionTitle,
      type: "faq",
      audience,
      submitted_by: user.id,
      submitted_by_name: "Admin",
    })
    .select("id")
    .single();

  if (questionError) return { error: questionError.message };
  if (!question?.id) return { error: "FAQ question was not created" };

  const { error: answerError } = await supabase.from("kb_answers").insert({
    question_id: question.id,
    body: answerBody,
    submitted_by: user.id,
    submitted_by_name: "Admin",
  });

  if (answerError) return { error: answerError.message, questionId: question.id };
  return { questionId: question.id };
}

export async function updateFaqQuestion(
  questionId: string,
  title: string,
  answer: string,
  audience: KbQuestionAudience
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAdmin();

  const questionTitle = title.trim();
  const answerBody = answer.trim();

  if (!questionTitle || !answerBody) {
    return { error: "Please provide a FAQ title and answer" };
  }

  if (audience !== "athlete" && audience !== "coach") {
    return { error: "Please choose a valid FAQ audience" };
  }

  const { error: questionError } = await supabase
    .from("kb_questions")
    .update({
      title: questionTitle,
      body: questionTitle,
      audience,
    })
    .eq("id", questionId)
    .eq("type", "faq");

  if (questionError) return { error: questionError.message };

  const { data: existingAnswer, error: answerLookupError } = await supabase
    .from("kb_answers")
    .select("id")
    .eq("question_id", questionId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (answerLookupError) return { error: answerLookupError.message };

  if (existingAnswer?.id) {
    const { error: answerError } = await supabase
      .from("kb_answers")
      .update({
        body: answerBody,
        submitted_by_name: "Admin",
      })
      .eq("id", existingAnswer.id);

    if (answerError) return { error: answerError.message };
  } else {
    const { error: answerError } = await supabase.from("kb_answers").insert({
      question_id: questionId,
      body: answerBody,
      submitted_by: user.id,
      submitted_by_name: "Admin",
    });

    if (answerError) return { error: answerError.message };
  }

  return {};
}

export async function getFaqQuestionsForAdmin(): Promise<QuestionWithAnswers[]> {
  const { supabase } = await requireAdmin();

  const { data: questions, error } = await supabase
    .from("kb_questions")
    .select("id, title, body, type, audience, submitted_by, submitted_by_name, created_at")
    .eq("type", "faq")
    .order("created_at", { ascending: false });

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

  return (questions ?? []).map((q) => ({
    ...q,
    answers: answersByQuestionId.get(q.id) ?? [],
    answer_count: (answersByQuestionId.get(q.id) ?? []).length,
  }));
}

export type FlaggedQuestionWithDetails = QuestionWithAnswers & {
  flag_id: string;
  flagged_by_name: string;
  flag_reason: string;
  flagged_at: string;
};

export async function getFlaggedQuestions(): Promise<FlaggedQuestionWithDetails[]> {
  const { supabase } = await requireAdmin();

  const { data: flags, error: flagsError } = await supabase
    .from("kb_flagged_questions")
    .select("id, question_id, flagged_by, flag_reason, created_at")
    .eq("reviewed", false)
    .order("created_at", { ascending: false });

  if (flagsError) throw new Error(flagsError.message);
  if (!flags || flags.length === 0) return [];

  const questionIds = flags.map((f) => f.question_id);
  const { data: questions, error: questionsError } = await supabase
    .from("kb_questions")
    .select("id, title, body, type, audience, submitted_by, submitted_by_name, created_at");

  if (questionsError) throw new Error(questionsError.message);

  const questionMap = new Map(
    (questions ?? []).map((q) => [q.id, q])
  );

  const answersData = await supabase
    .from("kb_answers")
    .select("id, question_id, body, submitted_by, submitted_by_name, created_at")
    .in("question_id", questionIds);

  const answersByQuestionId = new Map<string, KbAnswer[]>();
  for (const answer of answersData.data ?? []) {
    const arr = answersByQuestionId.get(answer.question_id) ?? [];
    arr.push(answer);
    answersByQuestionId.set(answer.question_id, arr);
  }

  return flags
    .map((flag) => {
      const question = questionMap.get(flag.question_id);
      if (!question) return null;
      return {
        ...question,
        answers: answersByQuestionId.get(flag.question_id) ?? [],
        answer_count: (answersByQuestionId.get(flag.question_id) ?? []).length,
        flag_id: flag.id,
        flagged_by_name: flag.flagged_by, // Will be replaced with actual name below
        flag_reason: flag.flag_reason,
        flagged_at: flag.created_at,
      };
    })
    .filter((item): item is FlaggedQuestionWithDetails => Boolean(item));
}

export async function updateQuestionAndClearFlag(
  questionId: string,
  newTitle: string,
  newBody: string
): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin();

  // Update question
  const { error: updateError } = await supabase
    .from("kb_questions")
    .update({
      title: newTitle.trim(),
      body: newBody.trim(),
    })
    .eq("id", questionId);

  if (updateError) return { error: updateError.message };

  // Clear flag
  const { error: flagError } = await supabase
    .from("kb_flagged_questions")
    .update({ reviewed: true, reviewed_at: new Date().toISOString() })
    .eq("question_id", questionId);

  if (flagError) return { error: flagError.message };

  return {};
}

export async function getFlaggedQuestionsCount(): Promise<number> {
  const { supabase } = await requireAdmin();

  const { count, error } = await supabase
    .from("kb_flagged_questions")
    .select("id", { count: "exact", head: true })
    .eq("reviewed", false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

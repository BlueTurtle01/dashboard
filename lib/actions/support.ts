"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireAdminOrThrow } from "@/lib/auth/core";

export type TicketCategory = "technical" | "billing" | "coaching" | "account" | "feedback" | "other";
export type TicketUrgency = "low" | "medium" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportTicket = {
  id: string;
  user_id: string;
  user_email: string;
  category: TicketCategory;
  urgency: TicketUrgency;
  subject: string;
  description: string;
  status: TicketStatus;
  resolution: string | null;
  resolution_minutes: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export async function createSupportTicket(input: {
  category: TicketCategory;
  urgency: TicketUrgency;
  subject: string;
  description: string;
}): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = await createClient();

  const { error } = await supabase.from("support_tickets").insert({
    user_id: user.id,
    user_email: user.email ?? "(no email)",
    category: input.category,
    urgency: input.urgency,
    subject: input.subject.trim(),
    description: input.description.trim(),
  });

  if (error) return { error: error.message };
  return {};
}

export async function getMyTickets(): Promise<SupportTicket[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAllTickets(): Promise<SupportTicket[]> {
  await requireAdminOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  resolution?: string
): Promise<{ error?: string }> {
  await requireAdminOrThrow();
  const supabase = await createClient();

  // Fetch current ticket so we can protect the first resolved_at
  const { data: current, error: fetchError } = await supabase
    .from("support_tickets")
    .select("created_at, resolved_at")
    .eq("id", ticketId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const now = new Date();
  const updates: Record<string, unknown> = {
    status,
    updated_at: now.toISOString(),
  };

  if (resolution !== undefined) updates.resolution = resolution;

  // Only record resolution time on the FIRST resolution — never overwrite
  const isFirstResolution =
    (status === "resolved" || status === "closed") && !current.resolved_at;

  if (isFirstResolution) {
    updates.resolved_at = now.toISOString();
    updates.resolution_minutes = Math.round(
      (now.getTime() - new Date(current.created_at).getTime()) / 60_000
    );
  }

  const { error } = await supabase
    .from("support_tickets")
    .update(updates)
    .eq("id", ticketId);

  if (error) return { error: error.message };
  return {};
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export type TicketStats = {
  total: number;
  byStatus: Record<TicketStatus, number>;
  byCategory: Record<TicketCategory, number>;
  byUrgency: Record<TicketUrgency, number>;
  resolvedCount: number;
  avgResolutionMinutes: number | null;
  medianResolutionMinutes: number | null;
  fastestMinutes: number | null;
  slowestMinutes: number | null;
  recentResolved: Pick<
    SupportTicket,
    "id" | "subject" | "user_email" | "category" | "urgency" | "resolved_at" | "resolution_minutes" | "created_at"
  >[];
};

export async function getTicketStats(): Promise<TicketStats> {
  await requireAdminOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, user_email, category, urgency, status, resolved_at, resolution_minutes, created_at");

  if (error) throw new Error(error.message);

  const tickets = data ?? [];

  const byStatus = { open: 0, in_progress: 0, resolved: 0, closed: 0 } as Record<TicketStatus, number>;
  const byCategory = { technical: 0, billing: 0, coaching: 0, account: 0, feedback: 0, other: 0 } as Record<TicketCategory, number>;
  const byUrgency = { low: 0, medium: 0, high: 0, urgent: 0 } as Record<TicketUrgency, number>;

  for (const t of tickets) {
    byStatus[t.status as TicketStatus]++;
    byCategory[t.category as TicketCategory]++;
    byUrgency[t.urgency as TicketUrgency]++;
  }

  const resolvedMinutes = tickets
    .filter((t) => t.resolution_minutes != null)
    .map((t) => t.resolution_minutes as number)
    .sort((a, b) => a - b);

  const resolvedCount = resolvedMinutes.length;
  const avgResolutionMinutes =
    resolvedCount > 0
      ? Math.round(resolvedMinutes.reduce((s, v) => s + v, 0) / resolvedCount)
      : null;

  const medianResolutionMinutes =
    resolvedCount > 0
      ? resolvedMinutes[Math.floor(resolvedCount / 2)]
      : null;

  const recentResolved = tickets
    .filter((t) => t.resolved_at != null)
    .sort((a, b) => new Date(b.resolved_at!).getTime() - new Date(a.resolved_at!).getTime())
    .slice(0, 20);

  return {
    total: tickets.length,
    byStatus,
    byCategory,
    byUrgency,
    resolvedCount,
    avgResolutionMinutes,
    medianResolutionMinutes,
    fastestMinutes: resolvedCount > 0 ? resolvedMinutes[0] : null,
    slowestMinutes: resolvedCount > 0 ? resolvedMinutes[resolvedCount - 1] : null,
    recentResolved,
  };
}

// ── Messages ──────────────────────────────────────────────────────────────────

export type TicketMessage = {
  id: string;
  ticket_id: string;
  user_id: string;
  user_email: string;
  is_admin: boolean;
  message: string;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
};

export async function getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addTicketMessage(input: {
  ticketId: string;
  message: string;
  attachmentPath?: string;
  attachmentName?: string;
}): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = await createClient();

  const isAdminRow = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  const isAdmin = !!isAdminRow.data;

  const { error } = await supabase.from("ticket_messages").insert({
    ticket_id: input.ticketId,
    user_id: user.id,
    user_email: user.email ?? "(no email)",
    is_admin: isAdmin,
    message: input.message.trim(),
    attachment_path: input.attachmentPath ?? null,
    attachment_name: input.attachmentName ?? null,
  });

  if (error) return { error: error.message };

  // Mark ticket as in_progress when admin first replies (if still open)
  if (isAdmin) {
    await supabase
      .from("support_tickets")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", input.ticketId)
      .eq("status", "open");
  }

  return {};
}

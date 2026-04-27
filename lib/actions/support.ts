"use server";

import { createClient } from "@/lib/supabase/server";

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
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
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

async function requireAdmin() {
  const { supabase, user } = await requireAuth();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  return { supabase, user };
}

export async function createSupportTicket(input: {
  category: TicketCategory;
  urgency: TicketUrgency;
  subject: string;
  description: string;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();

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
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAllTickets(): Promise<SupportTicket[]> {
  const { supabase } = await requireAdmin();

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
  const { supabase } = await requireAdmin();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (resolution !== undefined) updates.resolution = resolution;
  if (status === "resolved" || status === "closed") {
    updates.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("support_tickets")
    .update(updates)
    .eq("id", ticketId);

  if (error) return { error: error.message };
  return {};
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
  const { supabase } = await requireAuth();

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
  const { supabase, user } = await requireAuth();

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

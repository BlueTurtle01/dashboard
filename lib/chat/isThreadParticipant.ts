import { canAccessConversation } from "@/lib/chat/access";

export async function isThreadParticipant(
  supabase: any,
  threadId: string,
  userId: string
): Promise<boolean> {
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('conversation_id')
    .eq('id', threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return false;
  }

  return canAccessConversation(supabase, thread.conversation_id, userId);
}

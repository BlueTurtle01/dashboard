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

  const { data: conversation, error: convError } = await supabase
    .from('chat_conversations')
    .select('coach_user_id, athlete_user_id')
    .eq('id', thread.conversation_id)
    .maybeSingle();

  if (convError || !conversation) {
    return false;
  }

  return conversation.coach_user_id === userId || conversation.athlete_user_id === userId;
}

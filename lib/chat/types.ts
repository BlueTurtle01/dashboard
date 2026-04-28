export interface ChatConversation {
  id: string;
  coach_user_id: string;
  athlete_user_id: string;
  created_at: string;
}

export interface ChatThread {
  id: string;
  conversation_id: string;
  title: string;
  created_by: string;
  created_at: string;
  last_message_at: string | null;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_user_id: string;
  content: string;
  status: 'sent' | 'flagged' | 'blocked';
  flagged_phrase: string | null;
  created_at: string;
}

export interface BannedPhrase {
  id: string;
  phrase: string;
  severity: 'flag' | 'block';
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface PhraseCheckResult {
  allowed: boolean;
  severity?: 'flag' | 'block';
  matchedPhrase?: string;
}

export interface ChatParticipant {
  user_id: string;
  full_name: string | null;
}

# Chat System Implementation Guide

## Overview

A complete coach ↔ athlete messaging system with built-in phrase moderation (flagging/blocking of restricted phrases).

## Setup Instructions

### 1. Create Database Tables (One-time setup)

Open your Supabase Dashboard and run the SQL in `CHAT_SYSTEM_MIGRATION.sql`:

1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy/paste the entire contents of `CHAT_SYSTEM_MIGRATION.sql`
4. Click **Run**

This creates:
- `chat_conversations` — one conversation per coach-athlete pair
- `chat_messages` — individual messages with status (sent/flagged/blocked)
- `chat_banned_phrases` — admin-managed list of restricted phrases

### 2. Navigation (Already Done)

The chat links have been added to:
- **Coach sidebar:** "Chat" → `/coach/chat`
- **Athlete tab bar:** "Chat" → `/athlete/chat`
- **Admin Config dropdown:** "Chat Moderation" → `/admin/chat/phrases`

## Features

### For Coaches
- **`/coach/chat`** — List of all active conversations with athletes
- **`/coach/chat/[athleteId]`** — Chat thread with a specific athlete
- Messages appear in real-time via Supabase Realtime subscriptions

### For Athletes
- **`/athlete/chat`** — Auto-opens chat with their assigned coach
- Tab integrated into the athlete navigation bar
- Messages appear in real-time

### For Admins
- **`/admin/chat/phrases`** — Full CRUD management of banned phrases
- Choose severity: **Flag** (warn, message saved invisibly) or **Block** (reject outright)
- Toggle phrases active/inactive, delete phrases

## Architecture

### Phrase Filtering

**File:** `lib/chat/phraseFilter.ts`

Pure function that checks message content against banned phrases:
- **Whole-word matching:** "bad word" matches only complete words, not substrings
- **Case-insensitive:** Matching is case-insensitive
- **Regex-safe:** Properly escapes special regex characters

```ts
checkPhrase(content: string, phrases: BannedPhrase[]): PhraseCheckResult
// Returns: { allowed: boolean, severity?: 'flag' | 'block', matchedPhrase?: string }
```

### Message Flow

1. **Athlete sends message** → `POST /api/chat/messages`
2. **Server-side filtering:**
   - Fetch active banned phrases (cached for 60 seconds)
   - Run `checkPhrase()` against the content
   - If `block` severity: return 400, message never written
   - If `flag` severity: save message with `status: 'flagged'` (visible to admins only)
   - If clean: save with `status: 'sent'` (visible to both)
3. **Supabase Realtime:** Updates propagate to all subscribers instantly
4. **Frontend:** Real-time message list updates

### Database

```sql
chat_conversations
├ id (UUID PK)
├ coach_user_id (FK auth.users)
├ athlete_user_id (FK auth.users)
├ created_at
├ last_message_at (for sorting)
└ UNIQUE(coach_user_id, athlete_user_id)

chat_messages
├ id (UUID PK)
├ conversation_id (FK chat_conversations)
├ sender_user_id (FK auth.users)
├ content (text)
├ status ('sent' | 'flagged' | 'blocked')
├ flagged_phrase (which phrase matched, if any)
└ created_at

chat_banned_phrases
├ id (UUID PK)
├ phrase (text — the restricted phrase)
├ severity ('flag' | 'block')
├ is_active (boolean)
├ created_at
└ created_by (admin who added it)
```

## File Structure

```
lib/chat/
├ types.ts           — TypeScript interfaces
└ phraseFilter.ts    — Phrase checking logic (testable)

app/api/chat/
├ conversations/route.ts         — GET: list conversations, POST: create
├ messages/route.ts              — POST: send message (with filter)
└ messages/get/route.ts          — GET: load paginated messages

app/coach/chat/
├ page.tsx           — Conversation list
└ [athleteId]/page.tsx           — Chat thread

app/athlete/chat/
└ page.tsx           — Chat with coach

app/admin/chat/phrases/
└ page.tsx           — Manage banned phrases

components/chat/
├ ChatThread.tsx        — Main chat UI with realtime
├ ChatMessageBubble.tsx — Individual message bubble
└ ChatConversationList.tsx — Conversation list
```

## API Endpoints

### GET `/api/chat/conversations`
List all conversations (coach and athlete views).

Optional query param: `?athleteId=X` to get or create a specific conversation.

```json
{
  "asCoach": [...],
  "asAthlete": [...]
}
```

### POST `/api/chat/messages`
Send a message. Runs phrase filter, blocks/flags as needed.

Request:
```json
{
  "conversationId": "uuid",
  "content": "Hello"
}
```

Response (201 on success, 400 if blocked, 403 if unauthorized):
```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "sender_user_id": "uuid",
  "content": "Hello",
  "status": "sent",
  "flagged_phrase": null,
  "created_at": "2026-04-28T..."
}
```

### GET `/api/chat/messages/get`
Load messages from a conversation.

Query params:
- `conversationId` (required)
- `limit` (default: 50)
- `offset` (default: 0)

```json
{
  "messages": [...],
  "offset": 0,
  "limit": 50
}
```

## Testing Checklist

- [ ] Run `npm run dev` and navigate to `/coach/chat`
- [ ] As a coach, see the list of your linked athletes
- [ ] Click an athlete to open the chat thread
- [ ] Type a message and send — it appears instantly
- [ ] Open the same conversation in another browser tab as the athlete
- [ ] Verify the message appears in real-time (no page refresh needed)
- [ ] Go to `/admin/chat/phrases` and add a banned phrase
- [ ] Assign it `block` severity
- [ ] Try sending a message with that phrase — should be rejected with "Message blocked"
- [ ] Change another phrase to `flag` severity
- [ ] Send a message with that phrase — should silently flag it
- [ ] Check Supabase Dashboard: `chat_messages` table should show `status: 'flagged'`

## Future Extensions

The architecture supports these additions:

- **AI-based moderation:** Swap `checkPhrase()` for an ML model call; the `flagged_phrase` and `status` columns are ready
- **Message editing/deletion:** Subscribe to `UPDATE` and `DELETE` events in Supabase Realtime
- **Typing indicators:** Broadcast channel (not `postgres_changes`)
- **File uploads:** Add `file_url` column to `chat_messages`
- **Message search:** Index on `content` column
- **Moderation dashboard:** View all flagged messages, approve/reject them

## Dependencies

- `date-fns` — for timestamp formatting (already installed)
- Supabase client (existing)
- Next.js 16+ with App Router (existing)

## Notes

- **Real-time:** Uses Supabase `postgres_changes` on the `chat_messages` table, filtered by `conversation_id`
- **Phrase cache:** Banned phrases are cached for 60 seconds to reduce DB queries. Force refresh by restarting the API server.
- **Security:** All endpoints verify the user is a participant in the conversation before allowing access.
- **Role-based:** Admins manage phrases; coaches and athletes can only see their own conversations.

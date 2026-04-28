# Chat System v2 - Setup & Testing Guide

## ✅ What Changed

The chat system has been completely redesigned to support **multiple named threads** per coach-athlete pair. Instead of one long conversation, coaches and athletes can now create topic-specific threads (e.g., "Race Prep 2026", "Injury Recovery") for better organization.

### Key Improvements
1. **Multi-thread architecture** — Multiple named conversations per coach-athlete relationship
2. **Fixed critical bug** — Athlete page now correctly links with coach (was passing wrong user ID)
3. **Fixed Next.js 15 params** — All dynamic routes properly await params
4. **Better profile lookups** — Coaches and athletes with no athlete_profiles still get display names
5. **Real-time thread updates** — New threads appear instantly for both sides
6. **Blocked messages keep input** — User text isn't lost when message is blocked by moderation
7. **Realtime deduplication** — Messages can't appear twice

## 🔧 Setup Steps

### 1. Run the Database Migration (Critical!)

This **replaces** the old chat tables with the new multi-thread schema.

1. Open your **Supabase Dashboard**
2. Go to **SQL Editor**
3. Create a new query
4. Copy/paste the entire contents of `CHAT_SYSTEM_V2_MIGRATION.sql`
5. Click **Run**

**What this does:**
- Drops old `chat_messages` and `chat_conversations` tables
- Creates new `chat_conversations` (1 per coach-athlete pair)
- Creates new `chat_threads` (multiple per conversation)
- Creates new `chat_messages` (now reference thread_id)
- Enables realtime on both `chat_threads` and `chat_messages`

### 2. Restart the Dev Server

```bash
npm run dev
```

## 🧪 Testing Checklist

### Setup Test Users
1. Log in as **admin**
2. Go to **Admin > Create Users**
3. Create a **coach**:
   - Email: `coach@test.com`
   - Password: (click Generate)
   - Role: coach
   - Click Create User
4. Create an **athlete**:
   - Email: `athlete@test.com`
   - Password: (click Generate)
   - Role: athlete
   - Click Create User

### Link Coach & Athlete
1. Stay as admin
2. Go to **Admin > Config > Coach-Athlete Links**
3. Select the coach from dropdown
4. Select the athlete from dropdown
5. Status: Active
6. Click Create Link

### Test Coach Flow
1. Log out, log in as `coach@test.com`
2. Go to **Chat** in the sidebar → `/coach/chat`
3. Should see the athlete in the list
4. Click athlete → `/coach/chat/[athleteId]`
5. Should see empty thread list with "+ New Thread" button
6. Click "+ New Thread"
7. Type "Test Thread" → Click Create
8. Click the thread → `/coach/chat/[athleteId]/[threadId]`
9. Type a message and send
10. Message appears instantly ✓

### Test Athlete Flow
1. In a **new browser tab**, log out and log in as `athlete@test.com`
2. Go to **Chat** in the athlete nav → `/athlete/chat`
3. Should see "Test Thread" from coach **in real-time** (no refresh needed) ✓
4. Click the thread
5. Should see the coach's message
6. Type a reply and send
7. **Go back to coach tab** → message appears **in real-time** ✓

### Test New Thread Creation (Athlete-side)
1. In athlete tab, go back to `/athlete/chat` → `/athlete/chat`
2. Click "+ New Thread"
3. Type "Injury Recovery" → Create
4. **Go to coach tab** → thread list at `/coach/chat/[athleteId]` should show the new thread **in real-time** ✓

### Test Phrase Moderation
1. Go to **Admin > Config > Chat Moderation** → `/admin/chat/phrases`
2. Add a phrase:
   - Phrase: "banned"
   - Severity: Block
   - Click Add
3. Go to any active chat thread
4. Type "This is a banned word" and send
5. Should show error: "Message blocked"
6. **Input text should still be there** (not cleared) ✓
7. Delete the word and resend → should succeed ✓

## 📁 New File Structure

### API Routes
- `POST /api/chat/conversations` — Get or create conversation (FIXED: handles athlete case)
- `GET /api/chat/threads?conversationId=X` — List threads
- `POST /api/chat/threads` — Create new thread
- `POST /api/chat/messages` — Send message to thread (thread_id-based)
- `GET /api/chat/messages/get?threadId=X` — Fetch messages for thread

### Pages
- `/coach/chat` — List of athletes
- `/coach/chat/[athleteId]` — List of threads with athlete (NEW)
- `/coach/chat/[athleteId]/[threadId]` — Chat thread (NEW)
- `/athlete/chat` — List of threads with coach (FIXED)
- `/athlete/chat/[threadId]` — Chat thread (NEW)

### Components
- `ChatThread.tsx` — Updated for thread_id + deduplication
- `ChatThreadList.tsx` — New: list threads with realtime updates
- `NewThreadForm.tsx` — New: create thread form
- `ChatMessageBubble.tsx` — Unchanged

### Lib
- `types.ts` — Updated with ChatThread interface
- `phraseFilter.ts` — Unchanged
- `getUserName.ts` — New: robust name lookups

## 🐛 Bugs Fixed

| Bug | Fix |
|---|---|
| Athlete couldn't see coach messages | Athlete page now passes `partnerId: coachId, partnerRole: 'coach'` instead of passing own ID |
| Coach profiles weren't looked up | Created `getUserDisplayName()` helper with email fallback |
| Next.js 15 params warnings | All dynamic routes now use `const params = await props.params` |
| Input cleared on blocked message | Input only clears on successful POST (201) |
| Duplicate realtime messages | Added deduplication check: `prev.some(m => m.id === newId)` |
| No way to organize conversations | Introduced `chat_threads` — multiple named topics per coach-athlete pair |

## ⚡ Key Features

✅ **Real-time messaging** — Supabase `postgres_changes` on `chat_threads` and `chat_messages`  
✅ **Multiple threads** — Organize by topic  
✅ **Both sides can initiate** — Coach and athlete can both create threads  
✅ **Phrase moderation** — Flag or block messages with banned phrases  
✅ **Profile fallbacks** — Works even if user has no `athlete_profiles` row  
✅ **Participant verification** — Users can only message/see threads they're in  
✅ **Input preservation** — Blocked messages don't lose typed text  

## 🧠 How It Works

1. **Conversation** = 1-to-1 relationship between coach and athlete (unique constraint on both IDs)
2. **Thread** = Named topic within a conversation (multiple per conversation)
3. **Messages** = Belong to a specific thread (realtime via `postgres_changes`)

When coach/athlete opens chat:
- List conversations (shows other party)
- Click conversation → list threads
- Click thread → chat interface
- New threads appear **instantly** via realtime
- New messages appear **instantly** via realtime

## 🔍 Verification

If everything works, you should see:
- ✅ Coach can create thread and athlete sees it in real-time
- ✅ Athlete can reply and coach sees it in real-time
- ✅ Both can create new threads anytime
- ✅ Messages don't duplicate
- ✅ Input survives blocked messages
- ✅ All names display correctly

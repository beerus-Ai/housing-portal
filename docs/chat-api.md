# Chat API

Contract for 2026-11-28, implemented in `chat.js` (Node only for now). In-app messages, two kinds of conversation:
- **Committee desk** (`kind: desk`): any signed-in person who is not on the committee (resident, staff, guard, IT, tuck shop, laundry) has one thread with the committee. It is one shared inbox: every committee member (`role = admin`, any position) can read it and reply, and each reply shows the member's name.
- **Neighbour messages** (`kind: direct`): a resident writes to another approved resident, picked by name and flat. Either side can block the other, which stops new messages both ways until that block is lifted. The committee cannot read these conversations.

Rules:
- Messages are plain text, 1 to 2000 characters (whitespace only is refused). They are stored as typed and escaped by the clients.
- No phone number or email is ever returned by these routes: people are shown by name and flat (or role for staff, guards and service accounts).
- Unread counts are kept per person and per conversation (committee members each have their own read marker on desk threads). Opening a conversation clears it. `GET /api/pulse` carries the total as an additive `chat_unread` field.
- A new message notifies the recipient through the normal notifications, at most once per conversation until they open it. The notification never holds the message text.
- Audit: every message is recorded as entity `chat_message`, action `sent`, detail `conversation <id>` (never the text). A new conversation is `chat_conversation` / `started`. Blocking is `chat_block` / `blocked` or `unblocked`, entity id = the other resident, detail `conversation <id>`.

| Route | Who | Request | Response |
|---|---|---|---|
| `GET /api/chat` | any signed-in role | | `{conversations: [{id, kind: desk\|direct, title, sub, other: {id, name, flat?}\|null, unread, blocked: 'me'\|'them'\|null, last: {body (first 120 chars), mine, at}\|null, last_at}], unread, desk_id, committee}`. Conversations with at least one message, newest first. The committee sees every desk thread (title = the person, sub = their flat or role) and no direct ones. Others see their own desk thread (title "Committee") and their direct conversations. `desk_id` is the caller's desk thread, or null before the first message (always null for the committee). `blocked`: `me` = you blocked them, `them` = they blocked you. |
| `GET /api/chat/residents` | resident with a flat | | `[{id, name, flat, conversation_id\|null}]`: approved residents with a flat, not yourself, by flat. For the "New message" picker. |
| `POST /api/chat/desk` | anyone except the committee | `{body}` | `201 {id, conversation_id}`. Creates the caller's desk thread on the first message. 400 empty or over 2000 characters; 403 for the committee (they reply in the thread). Every committee member is notified. |
| `POST /api/chat/direct` | resident with a flat | `{user_id, body}` | `201 {id, conversation_id}`. Reuses the pair's conversation if it exists. 400 yourself or a bad message; 404 not an approved resident; 409 if either of you blocked the other. |
| `GET /api/chat/:id` | a participant; the committee for desk threads | | `{conversation (as in the list), messages: [{id, mine, from (name), committee (sender is a committee member), body, at}]}` (last 300, oldest first). Clears the caller's unread count and re-arms their notification. 404 for anyone else (the committee gets 404 on direct conversations). |
| `POST /api/chat/:id/messages` | a participant; the committee for desk threads | `{body}` | `201 {id, conversation_id}`. 400 bad message; 404 not yours; 409 blocked either way, or the other resident is no longer approved; 403 if a non-resident tries to write in a direct conversation. |
| `POST /api/chat/:id/block` | resident in a direct conversation | | `{ok, blocked: true}`. 400 on a desk thread; 404 not yours; 409 already blocked. |
| `POST /api/chat/:id/unblock` | resident in a direct conversation | | `{ok, blocked: false}`. 409 not blocked. Lifts only your own block. |

Signed-out callers get 401. Guards, staff, IT, shop and laundry accounts reach `/api/chat*` through the common allow-list in `auth`; `chat.js` keeps the neighbour routes (`residents`, `direct`, `block`, `unblock`) to residents. Tables: `chat_conversations` (unique per kind and pair; desk has `user_b` NULL, direct has `user_a < user_b`), `chat_messages`, `chat_reads` (read marker and "already notified" flag per person and conversation), `chat_blocks`. Tests: `test/chat.test.js`, plus rows in `test/integration-access-matrix.test.js`.

Web app: the **Chat** page (`PAGES.chat` in `public/web-services.js`, styles `ch-*` in `public/css/calm.css`) lists conversations with unread badges on the left and the open conversation on the right (your messages on the right, time stamps, the member's name on committee replies), a composer at the bottom (Enter sends, Shift+Enter adds a line) and, for residents, a "New message" picker of neighbours. It refreshes on the live poll and keeps a half-typed message. The menu entry shows the unread total.

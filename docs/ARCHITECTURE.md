# Tele — Architecture

A multi-tenant customer support platform (Intercom/Zendesk-style): embeddable
live chat, an email channel, a unified agent inbox, a knowledge base, AI
conversation summarization, and custom domains — built to be understood at a
glance and to scale past the single-node local setup it ships with.

## Service topology

```
                         ┌─────────────────────────────────────────┐
   Customer's website    │              Tele                       │
   ┌───────────────┐     │                                         │
   │ <script       │     │   ┌──────────┐        ┌──────────────┐  │
   │  tele-widget> │◀────┼──▶│   web    │        │     api      │  │
   └───────────────┘     │   │ (Vite):  │        │ (Fastify):   │  │
                         │   │ dashboard│──/api──▶│ REST + CSRF  │  │
   Agent's browser       │   │ + widget │ ws────▶│ Socket.IO    │  │
   ┌───────────────┐     │   │  iframe  │        │ (/agent,     │  │
   │  dashboard    │◀────┼──▶│ + public │        │  /widget)    │  │
   └───────────────┘     │   │   KB     │        └──────┬───────┘  │
                         │   └──────────┘               │          │
   Inbound email         │                       enqueue│          │
   (provider webhook) ───┼──▶ /webhooks/email/inbound ──┤          │
                         │                               ▼          │
                         │   ┌──────────┐         ┌────────────┐    │
                         │   │  worker  │◀───jobs─│   Redis    │    │
                         │   │ (BullMQ) │         │ (queues +  │    │
                         │   │ email,   │────────▶│  pub/sub)  │    │
                         │   │ ai,      │ live    └────────────┘    │
                         │   │ domains, │ events        │          │
                         │   │ snooze   │               ▼          │
                         │   └────┬─────┘         ┌────────────┐    │
                         │        └──────────────▶│ PostgreSQL │    │
                         │                        └────────────┘    │
                         │   ┌──────────┐  SMTP                     │
                         │   │ maildev  │◀── outbound email         │
                         └───┴──────────┴──────────────────────────┘
```

Three long-running processes, deliberately separated so they scale
independently:

- **api** (`packages/api/src/server.ts`) — Fastify HTTP + Socket.IO. Serves the
  dashboard REST API, the public widget/KB endpoints, and the inbound-email
  webhook. Owns WebSocket connections.
- **worker** (`packages/api/src/worker.ts`) — BullMQ consumers for the slow /
  flaky / bursty work: inbound-email processing, outbound-email sending,
  AI summarization, custom-domain verification, and a snooze-wake tick. Shares
  all the same module code as the api; the only difference is the entrypoint.
- **web** (`packages/web`) — Vite/React SPA that is *both* the agent dashboard
  and (at `/widget-frame`) the chat UI the embeddable widget loads in an iframe,
  and (at `/kb/:slug`) the public knowledge base.

Backing services: **PostgreSQL** (system of record), **Redis** (BullMQ queues +
Socket.IO pub/sub), **Maildev** (a real local SMTP sink standing in for a
production mail provider).

## Data model (Postgres via Prisma)

Multi-tenant by a `workspaceId` foreign key on every tenant-owned table.
`Workspace` ← `Membership` (role: ADMIN|AGENT) → `User`. `Contact` unifies chat
visitors and email senders. `Conversation` (channel CHAT|EMAIL, status
OPEN|SNOOZED|RESOLVED) has many `Message`s. `KbCategory` → `KbArticle` (with a
Postgres `tsvector` + GIN index for full-text search). `Domain` holds custom
hostnames and their verification state. Full schema:
`packages/api/prisma/schema.prisma`. Key indexes: `(workspaceId, status)` and
`(workspaceId, lastMessageAt)` on Conversation (the inbox's hot queries),
`(conversationId, createdAt)` on Message (thread reads), GIN on the article
search vector.

## Real-time architecture

Socket.IO, two namespaces with different auth:

- `/agent` — authed by the dashboard's session cookie (parsed from the
  handshake). Each socket joins a `workspace:{id}` room plus per-open-conversation
  rooms.
- `/widget` — authed by the visitor's bearer JWT (the widget is third-party
  embedded, so it can't use cookies). Each socket joins its own conversation
  room.

Events: `message:new`, `message:read`, `typing:start/stop`, `presence:update`,
`conversation:updated`, `conversation:summary_updated`.

**Ordering & delivery guarantees.** Messages are ordered by `(createdAt, id)`.
Socket.IO is treated strictly as a *live-update fast path*, never the source of
truth: on connect/reconnect the client re-fetches via
`GET .../messages?after=<lastSeenId>` and dedupes by message id, so a dropped
socket or a message sent during the gap is always reconciled from Postgres.
This sidesteps the hard "exactly-once over WebSocket" problem — the socket can
lose or double-deliver and the UI still converges.

**Scaling to multiple api nodes.** The Redis adapter
(`@socket.io/redis-adapter`) is wired from day one, so a broadcast from any node
reaches sockets connected to any other node. Crucially, the **worker** — which
has no HTTP server and no sockets of its own — emits live updates via a
Redis-backed `@socket.io/redis-emitter` (`realtime/emitter.ts`): it publishes
onto the exact same Redis channels the api nodes' adapters subscribe to. So an
inbound email processed in the worker still pushes a live `message:new` to an
agent's dashboard connected to the api. This is what makes the process split
real rather than cosmetic. (Known single-node limitation: presence tracking is
in-process memory today — see TRADEOFFS.md.)

## Queue-based processing

BullMQ over Redis. Producers live in the api; consumers in the worker. Queues:
`email-inbound`, `email-outbound`, `ai-summarize`, `domain-verification`,
`maintenance`. Rationale: SMTP, DNS, and LLM calls are slow and failure-prone —
keeping them off the request path means the inbound-email webhook returns `202`
in milliseconds (no provider-retry storms), an agent's "send reply" returns
immediately while delivery + retry happen in the background, and the worker
pool scales independently of front-door capacity. Retries use exponential
backoff; the AI-summarize job is *debounced* (a delayed job keyed per
conversation, replaced on each new message) so a burst of messages produces one
summarization, not one per message. `domain-verification` and the snooze-wake
job are *repeatable* (cron-like) ticks.

## Email engineering

Inbound arrives at `POST /webhooks/email/inbound` in a normalized JSON shape;
provider-specific adapters (`modules/email/parse.ts` — a Postmark adapter is
stubbed as a documented example) translate real provider payloads into it, so
swapping providers is a one-function change. Threading follows RFC 5322: every
outbound message gets a generated `Message-ID`, and its `In-Reply-To` /
`References` chain points at the customer's prior message; inbound messages are
matched back to a conversation by looking up those header values against stored
`emailMessageId`s (with a same-contact/same-normalized-subject fallback when
headers are stripped). Outbound goes through nodemailer to Maildev locally.
`createMessage` (`modules/messages/service.ts`) is the single write path for
*every* message regardless of source (widget, agent reply, inbound email) — it
sanitizes, persists, broadcasts, and enqueues follow-on jobs in one place.

## AI integration

Claude (Haiku tier — fast and cheap, appropriate for summarization) via the
Anthropic SDK, in the `ai-summarize` worker. **Context windowing:** a rolling
prior summary + the last ~30 messages, never the full history, so cost stays
bounded as conversations grow. **Structured output:** the summary schema
(`{whatUserWants, whatsBeenTried, currentStatus}`) is enforced via the SDK's
`zodOutputFormat`, so there's no brittle JSON parsing. **Cost awareness:** the
job skips the LLM call entirely when nothing has changed since the last summary,
and the debounce collapses message bursts. **Graceful degradation:** a 15s
timeout + BullMQ retry; on failure it keeps the last-good summary and marks it
`STALE` (or `FAILED` if there was never one), which the UI surfaces as a "may be
outdated" badge rather than a broken panel. With no API key configured it
no-ops cleanly (stub mode) instead of erroring.

## Security & tenant isolation

- **Auth:** dashboard uses an httpOnly signed-JWT session cookie + a
  double-submit CSRF token on mutating requests; the widget uses a separate
  short-lived visitor JWT (bearer, CSRF-immune). bcrypt (cost 12); login returns
  generic errors (no user enumeration).
- **Tenant isolation boundary:** `requireWorkspaceMember(role?)`
  (`plugins/workspace.ts`) is the single choke point — every dashboard query is
  scoped to the authenticated membership's `workspaceId`, resolved server-side,
  never trusted from client input.
- **Input handling:** Zod validation on every route (shared schemas);
  `sanitize-html` allowlists on all stored rich text / message HTML (two
  profiles: stricter for chat/email, broader for KB articles) to prevent stored
  XSS; `@fastify/rate-limit` globally plus tighter per-route limits on
  auth/public/webhook endpoints.

See `TRADEOFFS.md` for what's deliberately simplified or deferred, and
`CUSTOM_DOMAINS.md` for the custom-domain/SSL approach.

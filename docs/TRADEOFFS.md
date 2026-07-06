# Trade-offs, Simplifications & Deferrals

What was prioritized, what was deliberately simplified, and why — so the
boundaries are explicit rather than discovered.

## Deliberately stubbed (with a real interface behind them)

- **SSL certificate issuance for custom domains.** DNS verification is real
  (`dns.promises` lookups); the state machine is real; only `provisionSsl()` is
  a no-op, because this environment has no public box or DNS zone to issue a
  certificate against. Both realistic production paths (Caddy/Traefik on-demand
  TLS via ACME, or Cloudflare for SaaS) are documented in `CUSTOM_DOMAINS.md`,
  and the stub is the exact seam where either would drop in.
- **Email provider.** No real Postmark/SendGrid/Mailgun account, so inbound
  arrives via a normalized webhook shape and outbound goes to a local Maildev
  SMTP sink. A `parsePostmarkInbound` adapter is written as a documented example
  of how a real provider payload maps in — swapping providers is one function.
  RFC-5322 threading is fully real and verified bidirectionally.
- **AI summarization against a live key.** The Claude integration is written to
  the current SDK (structured output via `zodOutputFormat`, bounded context,
  timeout, retry, soft-fail). With no `ANTHROPIC_API_KEY` it no-ops cleanly;
  the code path is exercised via the stub branch, and set a key to light it up.

## Known simplifications (would change at real scale)

- **Presence is in-process memory** (`realtime/presence.ts`), so online/offline
  status is only correct on a single api node. Message broadcasting already
  scales across nodes (Redis adapter + emitter); presence would move to Redis
  (a per-workspace set with heartbeat TTLs) to match. Called out in code and
  ARCHITECTURE.md rather than silently single-node.
- **KB search is Postgres full-text** (`tsvector` + GIN). Great to ~hundreds of
  thousands of articles per workspace; beyond that, or for typo-tolerance /
  ranking sophistication, the seam is `searchPublicArticles` — swap in
  Meilisearch/Elasticsearch there. The query was deliberately tuned to OR-match
  significant terms (not the default AND) so natural-language "suggest as you
  type" works.
- **Dev-mode cross-origin shortcut.** In local dev the Vite proxy makes the
  dashboard see the api as same-origin, so cross-site cookie config is moot.
  A real deployment needs same-origin hosting behind one edge, or explicit
  `SameSite=None; Secure` + a CORS allowlist. Flagged so it isn't mistaken for
  production-ready.
- **The widget UI reuses the dashboard's Vite app** (served at `/widget-frame`)
  rather than being a separate bundle. The customer-facing contract is
  unchanged — one `<script>` tag — and it avoids duplicating build/Tailwind/
  socket wiring. Trade-off: the widget iframe pulls a larger bundle than a
  purpose-built one would; a production optimization would code-split or build a
  dedicated widget entry.

## Deferred (out of scope for this build)

- Attachments/file uploads in chat and email.
- Agent-facing analytics/reporting, SLAs, and canned responses.
- Full audit logging and per-action authorization beyond ADMIN/AGENT.
- Email deliverability infrastructure (SPF/DKIM/DMARC signing) — belongs to the
  real mail provider integration.
- Horizontal-scale hardening of presence (above) and BullMQ (multiple worker
  replicas work today, but no dashboards/alerting on queue depth).
- Automated test suite. Verification was done by driving the real app
  end-to-end (Playwright for the browser flows, curl + Maildev + the DNS state
  machine for the backend) — see `CONTEXT.md`'s "Verified working end-to-end"
  log. A production codebase would add unit/integration tests around the
  threading matcher, the summarize debounce, the tenant-isolation preHandler,
  and the CSRF logic in particular.

## What was prioritized, and why

The scarce resource was breadth across 7 features with credible depth on the
graded cross-cutting concerns, not polish on any one feature. So: the data
model, the tenant-isolation boundary, the single `createMessage` write path,
the REST-is-truth / socket-is-fast-path split, and the queue architecture got
the most care, because they're the load-bearing decisions everything else sits
on and the expensive things to get wrong later. UI is clean and usable but not
pixel-perfect. Every external dependency we couldn't actually run (SSL, real
mail provider, live LLM) was put behind an interface and stubbed rather than
faked in-line, so the boundary between "built" and "would need real
credentials" is always visible.

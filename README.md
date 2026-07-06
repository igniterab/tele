# Tele

A multi-tenant customer support platform — embeddable live chat, an email
channel, a unified agent inbox, a knowledge base with public help center, AI
conversation summarization, and custom domains. TypeScript end to end.

- **Architecture & system design:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Trade-offs & what's stubbed:** [docs/TRADEOFFS.md](docs/TRADEOFFS.md)
- **Custom domains / SSL approach:** [docs/CUSTOM_DOMAINS.md](docs/CUSTOM_DOMAINS.md)

## Stack

Fastify · PostgreSQL/Prisma · Redis/BullMQ · Socket.IO · React/Vite/Tailwind ·
vanilla-TS embeddable widget · Anthropic Claude · nodemailer/Maildev.

## Quick start (Docker Compose)

```bash
docker compose up --build
```

Brings up Postgres, Redis, Maildev, the API, the BullMQ worker, and the web
app; runs migrations and seeds a demo workspace automatically.

| URL | What |
|-----|------|
| http://localhost:5173 | Dashboard (agent inbox, KB admin, settings) |
| http://localhost:5173/kb/acme-support | Public knowledge base |
| http://localhost:5173/demo/index.html | Demo "customer website" with the chat widget embedded |
| http://localhost:1080 | Maildev — see outbound + simulated inbound email |

**Demo login:** `ada@example.com` / `password123` (admin), or
`bob@example.com` / `password123` (agent).

To enable real AI summarization, set `ANTHROPIC_API_KEY` in your shell before
`docker compose up` (it's passed through). Without it, summarization no-ops
cleanly.

## Local development (without Docker for the apps)

Infra in Docker, apps via npm (faster iteration, hot reload):

```bash
docker compose up -d postgres redis maildev
npm install
cp packages/api/.env.example packages/api/.env   # then adjust DB/Redis ports if needed
npm run prisma:migrate && npm run seed
npm run dev:api      # http://localhost:4000
npm run dev:worker   # BullMQ consumers
npm run dev:web      # http://localhost:5173
```

> Note: if you already run a native Postgres/Redis, this repo's compose maps
> them to host ports **5433**/**6380** to avoid clashing — the checked-in
> `.env.example` uses the standard 5432/6379, so adjust `DATABASE_URL`/
> `REDIS_URL` to `5433`/`6380` if you hit the remapped containers.

## Feature tour (what to click)

1. **Auth & team** — sign up (creates a workspace, you're admin) → Settings ›
   Team → invite an agent (invite email lands in Maildev; the accept link is
   also shown inline).
2. **Live chat widget** — open the widget demo page, click the bubble, send a
   message. It appears live in the dashboard inbox. Reply from the dashboard;
   it shows live in the widget. Reload the demo page — history persists.
3. **Email channel** — simulate an inbound email:
   `npm exec -w @tele/api -- tsx scripts/simulate-inbound-email.ts acme-support "Refund question" "I'd like a refund."`
   It becomes an EMAIL conversation. Reply from the dashboard → threaded email
   in Maildev. Replies stay in one conversation (RFC-5322 threading).
4. **Unified inbox** — filter by channel / status; assign, snooze, resolve.
5. **Knowledge base** — Knowledge Base › create a category + article (rich text)
   › publish. See it on the public KB page and searchable; type a related
   question in the chat widget to see auto-suggested articles.
6. **AI summarization** — open a longer conversation; the right-hand panel shows
   a generated summary (requires `ANTHROPIC_API_KEY`; degrades gracefully
   without).
7. **Custom domains** — Settings › Domains › connect a hostname. See the DNS
   records to add and watch the verification → SSL → active state machine
   advance (SSL issuance is stubbed — see docs/CUSTOM_DOMAINS.md).

## Repo layout

```
packages/
  shared/   zod schemas + shared TS types (used by api, web, widget)
  api/      Fastify API (server.ts) + BullMQ worker (worker.ts) + Prisma
  web/      React dashboard + public KB + widget iframe UI (/widget-frame)
  widget/   dependency-free embeddable loader (builds to web/public/tele-widget.js)
docs/       ARCHITECTURE · TRADEOFFS · CUSTOM_DOMAINS · CONTEXT
```

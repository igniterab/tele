# Custom Domains — Approach & Trade-offs

A workspace can connect its own domain (e.g. `help.acme.com`) to its public
knowledge base. This document explains what's fully implemented, what's
stubbed, and why — and what the real production path looks like.

## What's real

- **Verification token generation**, DNS record instructions, and the
  `Domain` schema/CRUD are fully implemented (`packages/api/src/modules/domains/`).
- **DNS verification is real**, not mocked: `modules/domains/dns.ts` does
  actual `dns.promises.resolveTxt` / `resolveCname` lookups. Point a real
  domain's DNS at the records shown in the dashboard and this will genuinely
  verify it — ownership via a `TXT` record at `_tele-verify.<hostname>`, then
  routing readiness via a `CNAME` pointing at `KB_CNAME_TARGET`.
- **The state machine** (`PENDING → VERIFIED → SSL_PROVISIONING → ACTIVE`) is
  real and advances one step per tick via a repeatable BullMQ job every 20s
  (`modules/domains/service.ts#checkAndAdvanceDomain`, scheduled from
  `worker.ts`). A "Check now" button in the dashboard enqueues an immediate
  one-off check instead of waiting for the next tick.

## What's stubbed, and why

**SSL certificate issuance is stubbed** (`modules/domains/ssl.ts#provisionSsl`
always returns success without contacting any certificate authority). This
environment has no public-facing box and no DNS zone we actually control, so
there is nothing to terminate TLS on or issue a certificate against — building
a real ACME/Cloudflare integration here would be integration-testing against
infrastructure that doesn't exist in this exercise. The function is the
explicit seam where that call belongs; the rest of the pipeline (verification,
state transitions, UI polling, "check now") is exercised faithfully around it.

For local demoing without owning a real domain, `DOMAIN_VERIFICATION_DEV_BYPASS=true`
(set in the local `.env`, **never** in production) skips the real DNS lookups
and treats any added domain as instantly verified, so the full state machine
is visible end-to-end. This flag only affects the DNS-check step — SSL
provisioning is stubbed the same way regardless of this flag.

## Real-world approach to SSL provisioning (what would replace the stub)

Two realistic options, both compatible with the workspace/domain data model
already built:

### Option A — Caddy or Traefik with on-demand TLS

Run Caddy (or Traefik) as the public edge in front of the API/web containers,
configured for **on-demand TLS**: instead of a static list of hostnames in the
config file, the proxy asks a small internal endpoint ("is this hostname one
of ours and verified?") the first time it sees a request for a new Host
header, and if yes, requests a certificate from Let's Encrypt via the standard
ACME HTTP-01 or TLS-ALPN-01 challenge — solved automatically since the proxy
itself is answering on port 80/443 for that hostname (the CNAME record already
points there). This is well-suited to a multi-tenant SaaS with an unbounded,
dynamically-growing set of customer hostnames, and is the natural next step
here: `provisionSsl()` becomes a call to Caddy's admin API to register the
hostname for on-demand issuance, and `ACTIVE` means "Caddy has a valid cert for
this hostname," which the admin API can confirm.

### Option B — Cloudflare for SaaS

If the app already sits behind Cloudflare, "Cloudflare for SaaS" (custom
hostnames) does the equivalent: call Cloudflare's Custom Hostnames API to
register the customer's hostname against your Cloudflare zone; Cloudflare
handles ACME issuance and edge TLS termination entirely, and exposes a status
field you poll (or get a webhook for) to know when the certificate is live.
`provisionSsl()` becomes that API call, and the verification step doubles as
proof of the CNAME Cloudflare also requires.

**Trade-off documented, not resolved:** Option A gives more control and no
per-domain vendor cost, at the price of running and securing your own edge
proxy. Option B is less operational burden but couples the deployment to
Cloudflare. Either is a reasonable choice depending on whether the team wants
to own the edge or not — this build doesn't pick one, since neither can
actually be exercised without a real public deployment.

## Routing: resolving a workspace by custom hostname

The public KB page in this build is always reached via
`/kb/:workspaceSlug` (path-based), not by Host header — there's no reverse
proxy in this local setup to route `help.acme.com` anywhere. In production,
once a domain is `ACTIVE`, the edge proxy (Caddy/Traefik/Cloudflare) forwards
requests for that hostname to the app, and a thin middleware resolves the
workspace by `Host` header (`Domain.hostname` → `Domain.workspaceId`) instead
of by the slug in the URL path — the same `listPublicCategories`/
`getPublicArticle` handlers in `modules/kb/service.ts` work unchanged either
way, since they already take a workspace identifier as a parameter.

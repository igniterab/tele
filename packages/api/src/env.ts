import "dotenv/config";
import { z } from "zod";

// z.coerce.boolean() would turn the *string* "false" into `true` (any non-empty
// string is JS-truthy) — this parses the literal text instead.
const booleanString = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_JWT_SECRET: z.string().min(16),
  VISITOR_JWT_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  COOKIE_SECURE: booleanString,
  EMAIL_DOMAIN: z.string().min(1).default("tele.local"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
  // Local/open-source LLM via Ollama. When OLLAMA_BASE_URL is set it takes
  // priority over Anthropic for AI summarization (no API key or network needed).
  // From inside Docker, point at the host: http://host.docker.internal:11434.
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().default("llama3.2"),
  // Where a verified custom domain's CNAME should point — in production this
  // is the edge (Caddy/Traefik/Cloudflare) that terminates TLS and routes by
  // Host header to the right workspace's KB. See docs/CUSTOM_DOMAINS.md.
  KB_CNAME_TARGET: z.string().min(1).default("kb.tele.local"),
  // Dev/demo-only: skip real DNS lookups and treat any added domain as
  // instantly verified. Lets the full PENDING→VERIFIED→SSL_PROVISIONING→ACTIVE
  // state machine be demoed locally without owning a real domain to point DNS
  // at. Real DNS verification code path is unaffected by and independent of
  // this flag — never set this in production.
  DOMAIN_VERIFICATION_DEV_BYPASS: booleanString,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

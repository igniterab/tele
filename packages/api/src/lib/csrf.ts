import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { SESSION_COOKIE } from "../plugins/auth.js";

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

export function issueCsrfCookie(reply: FastifyReply): string {
  const token = crypto.randomBytes(32).toString("hex");
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by client JS to echo back in header
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return token;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyCsrf(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
  if (SAFE_METHODS.has(req.method)) return done();
  // Bearer-token authenticated requests (widget) are not cookie-based and are immune to CSRF.
  if (req.headers.authorization) return done();
  // No session cookie yet means there's no authenticated state for a forged
  // cross-site request to ride on (signup/login/invite-accept establish the
  // session as their *result*, not a precondition) — SameSite=Lax on the
  // session cookie itself is what stops cross-site login/signup CSRF.
  if (!req.cookies[SESSION_COOKIE]) return done();

  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    reply.code(403).send({ error: { code: "CSRF_INVALID", message: "Invalid or missing CSRF token" } });
    return;
  }
  done();
}

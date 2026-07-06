import type { FastifyReply } from "fastify";
import { env } from "../env.js";
import { signSessionToken } from "./jwt.js";
import { issueCsrfCookie } from "./csrf.js";
import { SESSION_COOKIE } from "../plugins/auth.js";

export function establishSession(reply: FastifyReply, userId: string) {
  const token = signSessionToken({ sub: userId });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  issueCsrfCookie(reply);
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  reply.clearCookie("csrf_token", { path: "/" });
}

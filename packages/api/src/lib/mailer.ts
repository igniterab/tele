import nodemailer from "nodemailer";
import { env } from "../env.js";
import { logger } from "../logger.js";

export const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export interface RawMailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

/**
 * Best-effort send. Callers decide whether a failure should be retried (queued
 * jobs do) or just logged (transactional notices like invite emails, where we'd
 * rather the invite still succeed than block on SMTP being down).
 */
export async function sendMail(input: RawMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transporter.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
    });
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to: input.to }, "sendMail failed");
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

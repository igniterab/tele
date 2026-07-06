import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface SessionTokenPayload {
  sub: string; // userId
}

export interface VisitorTokenPayload {
  sub: string; // contactId
  workspaceId: string;
}

const SESSION_TTL = "7d";
const VISITOR_TTL = "180d";

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, env.SESSION_JWT_SECRET, { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionTokenPayload {
  return jwt.verify(token, env.SESSION_JWT_SECRET) as SessionTokenPayload;
}

export function signVisitorToken(payload: VisitorTokenPayload): string {
  return jwt.sign(payload, env.VISITOR_JWT_SECRET, { expiresIn: VISITOR_TTL });
}

export function verifyVisitorToken(token: string): VisitorTokenPayload {
  return jwt.verify(token, env.VISITOR_JWT_SECRET) as VisitorTokenPayload;
}

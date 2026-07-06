import pino from "pino";
import { isProd } from "./env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.passwordHash"],
  transport: isProd ? undefined : { target: "pino-pretty", options: { colorize: true, singleLine: true } },
});

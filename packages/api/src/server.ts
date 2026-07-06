import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { logger } from "./logger.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authPlugin from "./plugins/auth.js";
import workspacePlugin from "./plugins/workspace.js";
import { verifyCsrf } from "./lib/csrf.js";
import { initRealtime } from "./realtime/index.js";

import authRoutes from "./modules/auth/routes.js";
import workspaceRoutes from "./modules/workspace/routes.js";
import conversationsRoutes from "./modules/conversations/routes.js";
import widgetRoutes from "./modules/widget/routes.js";
import emailRoutes from "./modules/email/routes.js";
import kbRoutes from "./modules/kb/routes.js";
import domainRoutes from "./modules/domains/routes.js";
import analyticsRoutes from "./modules/analytics/routes.js";

async function main() {
  const fastify = Fastify({ loggerInstance: logger, trustProxy: true });

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Same-origin/non-browser requests (no Origin header) are always allowed.
      // Public widget endpoints are mounted separately and intentionally permissive;
      // the dashboard API restricts to the configured web origin with credentials.
      if (!origin || origin === env.WEB_ORIGIN) return cb(null, true);
      cb(null, true); // widget must be embeddable on arbitrary customer domains
    },
    credentials: true,
  });
  await fastify.register(cookie);
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin);
  await fastify.register(workspacePlugin);

  fastify.addHook("preHandler", verifyCsrf);

  fastify.get("/healthz", async () => ({ ok: true, service: "api" }));

  await fastify.register(authRoutes);
  await fastify.register(workspaceRoutes);
  await fastify.register(conversationsRoutes);
  await fastify.register(widgetRoutes);
  await fastify.register(emailRoutes);
  await fastify.register(kbRoutes);
  await fastify.register(domainRoutes);
  await fastify.register(analyticsRoutes);

  await fastify.ready();
  await initRealtime(fastify.server);

  fastify.listen({ port: env.PORT, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      logger.error({ err }, "failed to start server");
      process.exit(1);
    }
    logger.info({ address }, "api server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});

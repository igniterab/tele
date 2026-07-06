import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { isProd } from "../env.js";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() },
      });
      return;
    }
    if (err instanceof ApiError) {
      reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err.statusCode && err.statusCode < 500) {
      reply.code(err.statusCode).send({ error: { code: err.code ?? "BAD_REQUEST", message: err.message } });
      return;
    }
    req.log.error({ err }, "unhandled error");
    reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: isProd ? "Something went wrong. Please try again." : err.message,
      },
    });
  });

  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
}

export default fp(errorHandlerPlugin, { name: "error-handler-plugin" });

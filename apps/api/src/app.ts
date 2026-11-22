import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { CORRELATION_ID_HEADER } from "@originos/contracts";
import type { Database } from "@originos/db";
import { type LogLevel, fastifyBaseOptions } from "@originos/service-kit";
import { AppModule } from "./app.module.js";

export interface CreateApiOptions {
  readonly database: Database | null;
  readonly logLevel: LogLevel;
}

/** Build the API application without listening, so tests can use `inject`. */
export async function createApi(options: CreateApiOptions): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter(fastifyBaseOptions(options.logLevel));
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({ database: options.database }),
    adapter,
    // Fastify's logger (redacted) is the structured log; Nest's own logger only reports boot errors.
    { logger: options.logLevel === "silent" ? false : ["error", "warn"], bufferLogs: false },
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", async (request, reply) => {
      reply.header(CORRELATION_ID_HEADER, request.id);
    });
  // No CORS: the web app calls the API server-side. Browser access is added
  // deliberately with an allow-list when a phase needs it (deny by default).
  app.enableShutdownHooks();
  await app.init();
  return app;
}

import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { CORRELATION_ID_HEADER } from "@originos/contracts";
import type { Database } from "@originos/db";
import { type LogDestination, type LogLevel, fastifyBaseOptions } from "@originos/service-kit";
import { AppModule } from "./app.module.js";
import {
  type Auth,
  type Mailer,
  NotConfiguredMailer,
  createAuth,
  mountAuthHandler,
} from "./modules/core/index.js";

export interface CreateApiOptions {
  readonly database: Database | null;
  readonly logLevel: LogLevel;
  readonly logDestination?: LogDestination;
  readonly mailer?: Mailer;
  /** Browser-facing origin of apps/web. */
  readonly publicUrl?: string;
  /** Auth signing secret. Without one (development only), a random per-process secret is used. */
  readonly authSecret?: string;
  readonly authRateLimit?: boolean;
}

export interface RouteInfo {
  readonly method: string;
  readonly url: string;
}

const registeredRoutes = new WeakMap<object, RouteInfo[]>();

/** Every HTTP route the app serves. Tests use it to prove that no route is accidentally public. */
export function listRoutes(app: NestFastifyApplication): RouteInfo[] {
  return registeredRoutes.get(app) ?? [];
}

/** Build the API application without listening, so tests can use `inject`. */
export async function createApi(options: CreateApiOptions): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter(fastifyBaseOptions(options.logLevel, options.logDestination));
  const fastify = adapter.getInstance();
  const routes: RouteInfo[] = [];
  fastify.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) {
      if (method !== "HEAD") routes.push({ method, url: route.url });
    }
  });
  const mailer = options.mailer ?? new NotConfiguredMailer();
  const publicOrigin = new URL(options.publicUrl ?? "http://localhost:3000").origin;
  let auth: Auth | null = null;
  if (options.database) {
    auth = createAuth({
      db: options.database.db,
      mailer,
      publicUrl: publicOrigin,
      secret: options.authSecret ?? randomBytes(32).toString("base64url"),
      rateLimit: options.authRateLimit ?? true,
      onMailError: (kind) => fastify.log.error({ mailKind: kind }, "auth email could not be sent"),
    });
  }
  if (options.database && !options.authSecret) {
    fastify.log.warn("BETTER_AUTH_SECRET is not set; sessions will not survive an API restart.");
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({ database: options.database, auth, mailer, publicOrigin }),
    adapter,
    // Fastify's logger (redacted) is the structured log; Nest's own logger only reports boot errors.
    { logger: options.logLevel === "silent" ? false : ["error", "warn"], bufferLogs: false },
  );
  fastify.addHook("onRequest", async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });
  mountAuthHandler(fastify, auth);
  // No CORS: browsers reach the API only through the web app's server (same origin).
  app.enableShutdownHooks();
  await app.init();
  registeredRoutes.set(app, routes);
  return app;
}

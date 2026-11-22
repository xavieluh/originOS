import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "./auth.js";
import { AUTH_BASE_PATH } from "./auth.js";

/**
 * Serve Better Auth's endpoints at /api/auth/* on the API's Fastify instance.
 * Browsers reach them through the web app's same-origin proxy (apps/web
 * src/app/api/auth/[...all]/route.ts). Better Auth checks the Origin header
 * against ORIGINOS_PUBLIC_URL on every state-changing call.
 */
export function mountAuthHandler(fastify: FastifyInstance, auth: Auth | null): void {
  fastify.route({
    method: ["GET", "POST"],
    url: `${AUTH_BASE_PATH}/*`,
    async handler(request, reply) {
      if (!auth) {
        return reply.status(503).send({
          error: "auth_not_configured",
          message: "Accounts are unavailable: no database is configured.",
        });
      }
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const body =
        request.body === undefined || request.body === null
          ? undefined
          : JSON.stringify(request.body);
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(body ? { body } : {}),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.header(key, value);
      });
      // Several cookies can be set at once; Headers.forEach would join them into one invalid header.
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}

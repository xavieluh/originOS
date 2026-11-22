import { loadWebServerEnv } from "../../../../lib/env";

/**
 * Same-origin proxy for Better Auth's endpoints, which run in the API. The
 * browser only ever talks to this app, so the session cookie stays first-party
 * and httpOnly. Origin and Fetch-Metadata headers are forwarded unchanged so
 * the API's CSRF checks see what the browser sent.
 */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "x-correlation-id",
  "x-forwarded-for",
];

async function forward(request: Request): Promise<Response> {
  const env = loadWebServerEnv();
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, env.ORIGINOS_API_URL);
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: await request.arrayBuffer() }),
    });
  } catch {
    return Response.json(
      { error: "api_unreachable", message: "The OriginOS API did not answer." },
      { status: 502 },
    );
  }
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (
      ![
        "set-cookie",
        "content-encoding",
        "content-length",
        "transfer-encoding",
        "connection",
      ].includes(key)
    ) {
      responseHeaders.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie())
    responseHeaders.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const dynamic = "force-dynamic";

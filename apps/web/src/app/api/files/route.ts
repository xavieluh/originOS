import { CORRELATION_ID_HEADER, MAX_UPLOAD_BYTES } from "@originos/contracts";
import { loadWebServerEnv } from "../../../lib/env";

/**
 * Same-origin upload endpoint: the browser sends the file as the raw request
 * body (application/octet-stream) with its name and type in headers, and this
 * forwards it to the API's POST /v1/files. Origin and cookies are forwarded
 * unchanged so the API's CSRF and session checks see what the browser sent.
 * Every check on the file itself happens in the API.
 */
const FORWARDED = [
  "content-type",
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "sec-fetch-site",
  "x-upload-filename",
  "x-upload-type",
  CORRELATION_ID_HEADER,
];

const refuse = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status });

export async function POST(request: Request): Promise<Response> {
  const env = loadWebServerEnv();
  const length = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(length)) {
    return refuse(411, "length_required", "The upload did not say how large the file is.");
  }
  // Refuse before reading the body; the API enforces its own (possibly lower) limit too.
  if (length > MAX_UPLOAD_BYTES) {
    return refuse(413, "too_large", "The file is larger than the upload limit.");
  }
  const headers = new Headers({ accept: "application/json" });
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return refuse(413, "too_large", "The file is larger than the upload limit.");
  }
  let upstream: Response;
  try {
    upstream = await fetch(new URL("/v1/files", env.ORIGINOS_API_URL), {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return refuse(502, "api_unreachable", "The OriginOS API did not answer. Try again shortly.");
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export const dynamic = "force-dynamic";

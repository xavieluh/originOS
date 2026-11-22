import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@originos/contracts";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Give every page and route request a correlation ID: keep a valid incoming
 * one, otherwise mint one. Server code reads it from the request headers and
 * forwards it to the API, and the response echoes it so a user-reported
 * problem can be traced across web, API and worker logs.
 */
export function proxy(request: NextRequest): NextResponse {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_ID_HEADER));
  const headers = new Headers(request.headers);
  headers.set(CORRELATION_ID_HEADER, correlationId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

export const config = {
  // Skip static assets; they carry no application work worth correlating.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

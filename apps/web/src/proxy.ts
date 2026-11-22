import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@originos/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { REQUEST_PATH_HEADER, hasSessionCookie, isPrivatePath } from "./lib/session-cookie";

/**
 * 1. Give every page and route request a correlation ID: keep a valid incoming
 *    one, otherwise mint one, and echo it on the response.
 * 2. Send people without a session cookie away from private pages early. This is
 *    only a fast path: private layouts verify the session with the API on every
 *    request, and the API enforces it again on every call.
 */
export function proxy(request: NextRequest): NextResponse {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_ID_HEADER));
  const { pathname, search } = request.nextUrl;
  if (isPrivatePath(pathname) && !hasSessionCookie(request.headers.get("cookie"))) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(signIn);
    redirect.headers.set(CORRELATION_ID_HEADER, correlationId);
    return redirect;
  }
  const headers = new Headers(request.headers);
  headers.set(CORRELATION_ID_HEADER, correlationId);
  // Lets server layouts send a person back to the page they asked for after signing in.
  headers.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

export const config = {
  // Skip static assets; they carry no application work worth correlating.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

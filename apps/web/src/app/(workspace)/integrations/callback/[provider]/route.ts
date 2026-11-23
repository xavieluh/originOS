import { ProviderId } from "@originos/contracts";
import { apiFetch } from "../../../../../lib/api";
import { loadWebServerEnv } from "../../../../../lib/env";

/**
 * Where the provider sends the browser back after the person approves or
 * denies. The code and state go straight to the API, which checks the state
 * and exchanges the code on the server; this route only redirects to the
 * integrations page with an outcome code (never the code or any token).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const env = loadWebServerEnv();
  const { provider: raw } = await params;
  const back = (outcome: Record<string, string>) => {
    const to = new URL("/integrations", env.ORIGINOS_PUBLIC_URL);
    for (const [k, v] of Object.entries(outcome)) to.searchParams.set(k, v);
    return Response.redirect(to, 303);
  };
  const provider = ProviderId.safeParse(raw);
  if (!provider.success) return back({ error: "invalid_request" });
  const query = new URL(request.url).searchParams;
  if (query.get("error")) return back({ error: "denied", provider: provider.data });
  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return back({ error: "invalid_request", provider: provider.data });
  const result = await apiFetch<{ id: string }>("/v1/connect/callback", {
    method: "POST",
    body: { provider: provider.data, code, state },
    timeoutMs: 25_000,
  });
  if (!result.ok) return back({ error: result.error, provider: provider.data });
  return back({ connected: provider.data });
}

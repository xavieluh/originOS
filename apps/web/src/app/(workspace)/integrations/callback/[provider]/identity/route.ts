import { ProviderId } from "@originos/contracts";
import { apiFetch } from "../../../../../../lib/api";
import { loadWebServerEnv } from "../../../../../../lib/env";

/**
 * Where the provider sends the browser back after an account proof. It sits
 * under the provider's registered callback URL (GitHub accepts sub-paths).
 * The code and state go straight to the API; this route only redirects with
 * an outcome code, never the code or any token.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const env = loadWebServerEnv();
  const { provider: raw } = await params;
  const to = (path: string, outcome: Record<string, string>) => {
    const url = new URL(path, env.ORIGINOS_PUBLIC_URL);
    for (const [k, v] of Object.entries(outcome)) url.searchParams.set(k, v);
    return Response.redirect(url, 303);
  };
  const provider = ProviderId.safeParse(raw);
  if (!provider.success) return to("/trust/profiles", { error: "invalid_request" });
  const query = new URL(request.url).searchParams;
  if (query.get("error")) return to("/trust/profiles", { error: "denied" });
  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return to("/trust/profiles", { error: "invalid_request" });
  const result = await apiFetch<{ profileId: string }>("/v1/identity/callback", {
    method: "POST",
    body: { provider: provider.data, code, state },
    timeoutMs: 25_000,
  });
  if (!result.ok) return to("/trust/profiles", { error: result.error });
  return to(`/trust/profiles/${encodeURIComponent(result.data.profileId)}`, {
    proved: provider.data,
  });
}

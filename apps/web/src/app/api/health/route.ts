import { webLiveness } from "../../../lib/web-health";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(webLiveness(), { headers: { "cache-control": "no-store" } });
}

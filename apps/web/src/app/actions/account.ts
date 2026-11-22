"use server";

import { apiFetch } from "../../lib/api";
import type { ActionResult } from "./tenancy";

export interface SessionSummary {
  readonly id: string;
  readonly current: boolean;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

interface RawSession {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Better Auth's session list includes each session's bearer token. It is read
 * here, on the server, and only ids and metadata reach the browser, so a script
 * running in the page can never collect session tokens.
 */
async function rawSessions() {
  const [list, current] = await Promise.all([
    apiFetch<RawSession[]>("/api/auth/list-sessions"),
    apiFetch<{ session: { id: string } } | null>("/api/auth/get-session"),
  ]);
  return { list, currentId: current.ok ? (current.data?.session.id ?? null) : null };
}

export async function listSessionsAction(): Promise<ActionResult<SessionSummary[]>> {
  const { list, currentId } = await rawSessions();
  if (!list.ok) return { ok: false, error: list.error, message: list.message };
  return {
    ok: true,
    data: list.data.map((s) => ({
      id: s.id,
      current: s.id === currentId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
    })),
  };
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const { list } = await rawSessions();
  if (!list.ok) return { ok: false, error: list.error, message: list.message };
  // Only sessions of the signed-in person are listed, so an id from anywhere else matches nothing.
  const target = list.data.find((s) => s.id === sessionId);
  if (!target) return { ok: false, error: "not_found", message: "That session has already ended." };
  const result = await apiFetch("/api/auth/revoke-session", {
    method: "POST",
    body: { token: target.token },
  });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: null };
}

export async function revokeOtherSessionsAction(): Promise<ActionResult> {
  const result = await apiFetch("/api/auth/revoke-other-sessions", { method: "POST", body: {} });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: null };
}

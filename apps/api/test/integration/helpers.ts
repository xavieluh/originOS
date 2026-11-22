import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { APPLICATION_ROLE, createDatabase, runMigrations, type Database } from "@originos/db";
import type { Storage } from "@originos/storage";
import { createApi } from "../../src/app.js";
import { MemoryMailer } from "../../src/modules/core/index.js";

export const ORIGIN = "http://localhost:3000";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

export interface Harness {
  readonly app: NestFastifyApplication;
  readonly mailer: MemoryMailer;
  /** Schema-owner connection for fixtures that simulate time passing or bugs. */
  readonly owner: Database;
  close(): Promise<void>;
}

export interface HarnessOptions {
  /** Object storage and scanner; omitted means "not set up". */
  readonly storage?: Storage;
}

export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const owner = createDatabase({ url: url! });
  await runMigrations(owner);
  const database = createDatabase({ url: url!, role: APPLICATION_ROLE });
  const mailer = new MemoryMailer();
  const app = await createApi({
    database,
    logLevel: "silent",
    mailer,
    publicUrl: ORIGIN,
    authSecret: "test-secret-test-secret-test-secret-0123456789",
    authRateLimit: false,
    ...(options.storage ? { storage: options.storage } : {}),
  });
  return {
    app,
    mailer,
    owner,
    async close() {
      await app.close();
      await Promise.all([database.close(), owner.close()]);
    },
  };
}

export const uniqueEmail = (name: string) => `${name}-${randomUUID().slice(0, 8)}@example.test`;

/** A tiny cookie jar for app.inject. */
export class Client {
  private readonly cookies = new Map<string, string>();
  constructor(private readonly h: Harness) {}

  get cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const headers: Record<string, string> = { origin: ORIGIN, ...extraHeaders };
    if (this.cookies.size > 0) headers.cookie = this.cookieHeader;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await this.h.app.inject({
      method,
      url: path,
      headers,
      ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
    });
    for (const c of response.cookies) {
      if (c.value === "" || (c.maxAge !== undefined && c.maxAge <= 0)) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return response;
  }

  /** Upload raw bytes the way the web app does: octet-stream body, name and type in headers. */
  async upload(
    filename: string,
    type: string,
    bytes: Uint8Array | string,
    extraHeaders: Record<string, string> = {},
  ) {
    const payload = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
    const headers: Record<string, string> = {
      origin: ORIGIN,
      "content-type": "application/octet-stream",
      "x-upload-filename": encodeURIComponent(filename),
      "x-upload-type": type,
      ...extraHeaders,
    };
    if (this.cookies.size > 0) headers.cookie = this.cookieHeader;
    return this.h.app.inject({ method: "POST", url: "/v1/files", headers, payload });
  }

  /** Sign up, follow the verification link from the captured email, and end signed in. */
  async signUp(
    email: string,
    password = "correct horse battery staple",
    name = email.split("@")[0] ?? "User",
  ) {
    const res = await this.request("POST", "/api/auth/sign-up/email", { email, password, name });
    if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
    const link = await waitForMail(this.h.mailer, email, "Verify your email");
    const verify = new URL(link);
    const v = await this.request("GET", `${verify.pathname}${verify.search}`);
    if (v.statusCode >= 400) throw new Error(`verify failed: ${v.statusCode} ${v.body}`);
    if (!this.cookieHeader.includes("session_token")) {
      const s = await this.request("POST", "/api/auth/sign-in/email", { email, password });
      if (s.statusCode !== 200) throw new Error(`sign-in failed: ${s.statusCode} ${s.body}`);
    }
    return this;
  }
}

/** Auth emails are sent without awaiting (timing safety), so poll briefly. */
export async function waitForMail(
  mailer: MemoryMailer,
  to: string,
  subjectPrefix: string,
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const msg = [...mailer.sent]
      .reverse()
      .find((m) => m.to === to && m.subject.startsWith(subjectPrefix));
    if (msg) {
      const match = /(https?:\/\/\S+)/.exec(msg.text);
      if (!match?.[1]) throw new Error("no link in email");
      return match[1];
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no "${subjectPrefix}" email to ${to}`);
}

export function invitationToken(mailer: MemoryMailer, to: string): string {
  const msg = [...mailer.sent]
    .reverse()
    .find((m) => m.to === to && m.subject.includes("invited you"));
  const token = msg && /#token=([A-Za-z0-9_-]+)/.exec(msg.text)?.[1];
  if (!token) throw new Error(`no invitation email to ${to}`);
  return token;
}

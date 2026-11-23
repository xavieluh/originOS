// Real S3-compatible storage (SeaweedFS locally and in CI) and real ClamAV.
// Needs S3_* and CLAMAV_HOST in the environment (see .env.example); fails
// rather than skips when they are missing.
import { newUploadId } from "@originos/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { storageFromEnv, uploadKey } from "../../src/index.js";

const { store, scanner } = storageFromEnv();
if (!store)
  throw new Error("S3_ENDPOINT must be set for storage integration tests (see .env.example).");
if (!scanner)
  throw new Error("CLAMAV_HOST must be set for storage integration tests (see .env.example).");
const s3 = store;

const tenant = "0b9f2a64-0b8e-4c1e-9d1e-2f1c8b3a4d5e";
const other = "7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const id = () => newUploadId();
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

beforeAll(async () => {
  await s3.ensureBuckets();
});

describe("object store", () => {
  it("stores, copies and serves a file through a short-lived signed URL", async () => {
    const key = uploadKey(tenant, id());
    const body = new TextEncoder().encode("hello, storage");
    await s3.put("quarantine", key, body, "text/plain");
    expect(await s3.exists("files", key)).toBe(false);
    await s3.copy("quarantine", "files", key);
    await s3.copy("quarantine", "files", key); // idempotent
    expect(new TextDecoder().decode(await s3.getBytes("files", key, 1000))).toBe("hello, storage");
    const signed = await s3.signedDownloadUrl("files", key, {
      filename: "hello.txt",
      contentType: "text/plain",
    });
    const res = await fetch(signed.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="hello.txt"/);
    expect(await res.text()).toBe("hello, storage");
  });

  it("a signed URL is bound to its key and expires", async () => {
    const key = uploadKey(tenant, id());
    await s3.put("files", key, new TextEncoder().encode("secret"), "text/plain");
    const signed = await s3.signedDownloadUrl("files", key, {
      filename: "s.txt",
      contentType: "text/plain",
      expiresInSeconds: 1,
    });
    // Re-pointing the signature at another tenant's key fails.
    const forged = signed.url.replace(`tenants/${tenant}`, `tenants/${other}`);
    expect((await fetch(forged)).status).toBe(403);
    // Unsigned access is refused.
    expect((await fetch(signed.url.split("?")[0]!)).status).toBe(403);
    await new Promise((r) => setTimeout(r, 2_100));
    expect((await fetch(signed.url)).status).toBe(403);
  });

  it("refuses to read an object larger than the caller's limit", async () => {
    const key = uploadKey(tenant, id());
    await s3.put("quarantine", key, new Uint8Array(2048), "application/octet-stream");
    await expect(s3.getBytes("quarantine", key, 1024)).rejects.toThrow(/larger than allowed/);
  });
});

describe("ClamAV scanner", () => {
  it("answers, detects the EICAR test file and passes a clean file", async () => {
    expect(
      await scanner.ping(),
      "ClamAV is not answering. Start it with: docker compose --profile scanner up -d --wait",
    ).toBe(true);
    expect(await scanner.scan(new TextEncoder().encode(EICAR))).toEqual({
      verdict: "infected",
      signature: "Eicar-Test-Signature",
    });
    expect(await scanner.scan(new TextEncoder().encode("# Notes\nNothing to see.\n"))).toEqual({
      verdict: "clean",
    });
  });
});

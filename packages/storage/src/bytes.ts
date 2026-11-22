import { createHash } from "node:crypto";
import { tooLarge } from "./policy.js";

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Read a stream fully, failing as soon as it passes `maxBytes` (without
 * reading the rest). Uploads are bounded (25 MB), so holding one in memory is
 * acceptable; see ADR-026 for when to switch to streaming.
 */
export async function readLimited(
  stream: AsyncIterable<Uint8Array | string>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw tooLarge(maxBytes);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

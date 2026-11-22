// Malware-scanner adapter (ADR-026). One real implementation: ClamAV's clamd
// daemon over TCP (INSTREAM). Without a configured scanner, uploads stay in
// quarantine with status scan_unavailable; nothing is released unscanned.
import net from "node:net";

export type ScanVerdict =
  { readonly verdict: "clean" } | { readonly verdict: "infected"; readonly signature: string };

export interface MalwareScanner {
  /** Shown on the upload record, e.g. "clamav". */
  readonly name: string;
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
  /** True when the scanner answers. */
  ping(): Promise<boolean>;
}

/** The scanner could not give a verdict (down, timed out, refused the stream). Retryable. */
export class ScannerUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScannerUnavailable";
  }
}

export interface ClamdOptions {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs?: number;
  /** INSTREAM chunk size; clamd's StreamMaxLength still limits the total. */
  readonly chunkBytes?: number;
}

/** Send one clamd command and collect the NUL-terminated reply. */
function clamd(options: ClamdOptions, write: (socket: net.Socket) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: options.host, port: options.port });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error: Error | null, reply?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(reply ?? "");
    };
    socket.setTimeout(options.timeoutMs ?? 30_000, () =>
      finish(new ScannerUnavailable("The malware scanner timed out.")),
    );
    socket.on("error", () =>
      finish(new ScannerUnavailable("The malware scanner is not reachable.")),
    );
    socket.on("data", (d: Buffer) => {
      chunks.push(d);
      if (d.includes(0)) finish(null, Buffer.concat(chunks).toString("utf8").replace(/\0.*$/s, ""));
    });
    socket.on("end", () =>
      finish(null, Buffer.concat(chunks).toString("utf8").replace(/\0.*$/s, "")),
    );
    socket.on("connect", () => write(socket));
  });
}

/** Parse an INSTREAM reply: "stream: OK", "stream: <name> FOUND" or "... ERROR". */
export function parseClamdReply(reply: string): ScanVerdict {
  const text = reply.trim();
  if (/^stream: OK$/.test(text)) return { verdict: "clean" };
  const found = /^stream: (.+) FOUND$/.exec(text);
  if (found) return { verdict: "infected", signature: found[1]!.slice(0, 200) };
  throw new ScannerUnavailable(
    /size limit/i.test(text)
      ? "The malware scanner refused the file as too large for its stream limit."
      : "The malware scanner returned an error.",
  );
}

export function createClamdScanner(options: ClamdOptions): MalwareScanner {
  const chunkBytes = options.chunkBytes ?? 64 * 1024;
  return {
    name: "clamav",
    async scan(bytes) {
      const reply = await clamd(options, (socket) => {
        socket.write("zINSTREAM\0");
        for (let i = 0; i < bytes.length; i += chunkBytes) {
          const chunk = bytes.subarray(i, i + chunkBytes);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
      return parseClamdReply(reply);
    },
    async ping() {
      try {
        return (
          (await clamd({ ...options, timeoutMs: 3_000 }, (s) => s.write("zPING\0"))).trim() ===
          "PONG"
        );
      } catch {
        return false;
      }
    },
  };
}

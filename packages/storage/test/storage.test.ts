import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  UploadRefused,
  checkDeclared,
  contentDisposition,
  parseClamdReply,
  readLimited,
  sanitizeFilename,
  sha256Hex,
  sniffType,
  uploadKey,
} from "../src/index.js";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const refused = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(UploadRefused);
    return (e as UploadRefused).code;
  }
  throw new Error("expected a refusal");
};

describe("type sniffing", () => {
  it("recognizes accepted binary formats by their signature", () => {
    expect(sniffType(text("%PDF-1.7\n..."), "application/pdf", { truncated: false })).toBe(
      "application/pdf",
    );
    expect(
      sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "image/png", {
        truncated: false,
      }),
    ).toBe("image/png");
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg", { truncated: false })).toBe(
      "image/jpeg",
    );
    expect(sniffType(text("GIF89a...."), "image/gif", { truncated: false })).toBe("image/gif");
    expect(sniffType(text("RIFF\0\0\0\0WEBPVP8 "), "image/webp", { truncated: false })).toBe(
      "image/webp",
    );
  });

  it("accepts UTF-8 text and refuses binaries, HTML and SVG disguised as text", () => {
    expect(sniffType(text("Hello, wörld\n"), "text/plain", { truncated: false })).toBe(
      "text/plain",
    );
    expect(sniffType(text("# Title\n"), "text/markdown", { truncated: false })).toBe(
      "text/markdown",
    );
    expect(sniffType(bytes(0x4d, 0x5a, 0x90, 0, 3), "text/plain", { truncated: false })).toBeNull(); // PE executable
    expect(sniffType(text("PK\u0003\u0004zip"), "text/plain", { truncated: false })).toBeNull();
    expect(
      sniffType(text("  <!DOCTYPE html><script>"), "text/plain", { truncated: false }),
    ).toBeNull();
    expect(
      sniffType(text("<svg onload=alert(1)>"), "text/markdown", { truncated: false }),
    ).toBeNull();
    expect(sniffType(bytes(0xc3, 0x28), "text/plain", { truncated: false })).toBeNull(); // invalid UTF-8
  });

  it("tolerates a multi-byte character cut at the sniff boundary", () => {
    const head = text("abc ö").subarray(0, 5); // cuts "ö" in half
    expect(sniffType(head, "text/plain", { truncated: true })).toBe("text/plain");
  });
});

describe("upload policy", () => {
  const ok = {
    declaredType: "application/pdf",
    filename: "paper.pdf",
    contentLength: 10,
    maxBytes: 100,
  };
  it("accepts a declared type with a matching extension", () => {
    expect(checkDeclared(ok)).toBe("application/pdf");
    expect(checkDeclared({ ...ok, declaredType: "Application/PDF; charset=binary" })).toBe(
      "application/pdf",
    );
  });
  it("refuses unaccepted types, mismatched names, empty and oversize files before storing", () => {
    expect(
      refused(() => checkDeclared({ ...ok, declaredType: "application/zip", filename: "a.zip" })),
    ).toBe("type_not_accepted");
    expect(
      refused(() => checkDeclared({ ...ok, declaredType: "image/svg+xml", filename: "a.svg" })),
    ).toBe("type_not_accepted");
    expect(refused(() => checkDeclared({ ...ok, filename: "paper.exe" }))).toBe("type_mismatch");
    expect(refused(() => checkDeclared({ ...ok, contentLength: 0 }))).toBe("empty");
    expect(refused(() => checkDeclared({ ...ok, contentLength: 101 }))).toBe("too_large");
  });
  it("sanitizes display names", () => {
    expect(sanitizeFilename("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(sanitizeFilename("evil\u202Etxt.exe.pdf")).toBe("eviltxt.exe.pdf");
    expect(refused(() => sanitizeFilename("../"))).toBe("invalid_filename");
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(200);
  });
  it("stops reading a stream as soon as it passes the limit", async () => {
    let read = 0;
    async function* source() {
      for (let i = 0; i < 100; i++) {
        read += 1;
        yield new Uint8Array(10);
      }
    }
    await expect(readLimited(source(), 25)).rejects.toMatchObject({ code: "too_large" });
    expect(read).toBe(3);
    expect((await readLimited(Readable.from([Buffer.from("abc")]), 3)).toString()).toBe("abc");
  });
});

describe("storage helpers", () => {
  it("builds keys only from a tenant uuid and an upload id", () => {
    const t = "0b9f2a64-0b8e-4c1e-9d1e-2f1c8b3a4d5e";
    expect(uploadKey(t, "upl_01m82qbf14916sp3tec6vt25h4")).toBe(
      `tenants/${t}/uploads/upl_01m82qbf14916sp3tec6vt25h4`,
    );
    expect(() => uploadKey("../other", "upl_01m82qbf14916sp3tec6vt25h4")).toThrow();
    expect(() => uploadKey(t, "../../x")).toThrow();
  });
  it("encodes download names safely", () => {
    expect(contentDisposition('ré"port.pdf')).toBe(
      `attachment; filename="r__port.pdf"; filename*=UTF-8''r%C3%A9%22port.pdf`,
    );
    expect(contentDisposition("a.png", true)).toMatch(/^inline; /);
  });
  it("hashes bytes with SHA-256", () => {
    expect(sha256Hex(text("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("clamd replies", () => {
  it("parses clean, infected and error replies", () => {
    expect(parseClamdReply("stream: OK")).toEqual({ verdict: "clean" });
    expect(parseClamdReply("stream: Eicar-Test-Signature FOUND")).toEqual({
      verdict: "infected",
      signature: "Eicar-Test-Signature",
    });
    expect(() => parseClamdReply("INSTREAM size limit exceeded. ERROR")).toThrow(/too large/);
    expect(() => parseClamdReply("garbage")).toThrow(/error/);
  });
});

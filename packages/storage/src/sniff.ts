// Content-type detection from the file's own bytes (magic numbers), for the
// accepted types only. A file whose bytes do not match its declared type is
// rejected: browsers and parsers trust bytes, not names.
import type { AcceptedMediaType } from "@originos/contracts";

/** How many leading bytes the sniffer needs. */
export const SNIFF_BYTES = 4096;

const startsWith = (head: Uint8Array, bytes: readonly number[], offset = 0) =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Binary formats we accept, by signature. */
function sniffBinary(head: Uint8Array): AcceptedMediaType | null {
  if (startsWith(head, ascii("%PDF-"))) return "application/pdf";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))) return "image/gif";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

/**
 * Text: valid UTF-8 (BOM allowed), no NUL bytes and no control characters
 * other than tab, newline, carriage return and form feed. Markup that a
 * browser would render (HTML, SVG) is refused even though it is text.
 */
function looksLikeSafeText(head: Uint8Array, truncated: boolean): boolean {
  let bytes = head;
  // A multi-byte character may be cut at the sniff boundary; drop a partial tail.
  if (truncated) {
    let cut = bytes.length;
    for (let i = Math.max(0, bytes.length - 3); i < bytes.length; i++) {
      if ((bytes[i]! & 0xc0) === 0xc0) cut = i;
    }
    bytes = bytes.subarray(0, cut);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text)) return false;
  const start = text
    .replace(/^\uFEFF/, "")
    .trimStart()
    .slice(0, 256)
    .toLowerCase();
  return !/^<(!doctype|html|svg|\?xml|script|head|body)/.test(start);
}

/**
 * The accepted type these leading bytes are, or null when they are none of
 * them. `declared` only decides between plain text and Markdown, which have no
 * signature.
 */
export function sniffType(
  head: Uint8Array,
  declared: string,
  options: { readonly truncated: boolean },
): AcceptedMediaType | null {
  if (head.length === 0) return null;
  const binary = sniffBinary(head);
  if (binary) return binary;
  if (!looksLikeSafeText(head, options.truncated)) return null;
  return declared === "text/markdown" ? "text/markdown" : "text/plain";
}

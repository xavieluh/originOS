// Upload policy: what may be uploaded, how big, and how names are shown.
import {
  ACCEPTED_MEDIA_TYPES,
  type AcceptedMediaType,
  MAX_UPLOAD_BYTES,
  type UploadErrorCode,
} from "@originos/contracts";

export class UploadRefused extends Error {
  constructor(
    readonly code: UploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadRefused";
  }
}

export const isAccepted = (type: string): type is AcceptedMediaType =>
  Object.hasOwn(ACCEPTED_MEDIA_TYPES, type);

export function acceptedTypesText(): string {
  const labels = Object.values(ACCEPTED_MEDIA_TYPES).map((t) => t.label);
  return `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}

/** Bytes shown as "25 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** Effective limit: configured value, never above the platform maximum. */
export function maxUploadBytes(configured?: number): number {
  return Math.min(configured ?? MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES);
}

/** Control characters and bidirectional overrides, which can disguise a name (e.g. "txt.exe" shown as "exe.txt"). */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

/**
 * A display name safe to store and show: no path, no control or bidi
 * characters, at most 200 characters. Never used as a storage key.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(UNSAFE_NAME_CHARS, "")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new UploadRefused("invalid_filename", "The file needs a name.");
  }
  return cleaned.length > 200 ? `${cleaned.slice(0, 190)}…${cleaned.slice(-9)}` : cleaned;
}

/** Checks before any byte is stored: declared type and announced size. */
export function checkDeclared(input: {
  readonly declaredType: string;
  readonly filename: string;
  readonly contentLength: number | null;
  readonly maxBytes: number;
}): AcceptedMediaType {
  const type = input.declaredType.split(";")[0]!.trim().toLowerCase();
  if (!isAccepted(type)) {
    throw new UploadRefused(
      "type_not_accepted",
      `That file type is not accepted. Upload ${acceptedTypesText()}.`,
    );
  }
  const ext = input.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!ext || !(ACCEPTED_MEDIA_TYPES[type].extensions as readonly string[]).includes(ext)) {
    throw new UploadRefused(
      "type_mismatch",
      `The file name does not match its type (${ACCEPTED_MEDIA_TYPES[type].label}).`,
    );
  }
  if (input.contentLength !== null) {
    if (input.contentLength === 0) throw new UploadRefused("empty", "The file is empty.");
    if (input.contentLength > input.maxBytes) throw tooLarge(input.maxBytes);
  }
  return type;
}

export const tooLarge = (maxBytes: number) =>
  new UploadRefused("too_large", `The file is larger than the ${formatBytes(maxBytes)} limit.`);

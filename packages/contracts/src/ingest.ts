// Upload and ingestion contracts (Phase 07, ADR-026). Shared by the API (which
// accepts uploads), the worker (which scans and promotes them) and the web app
// (which shows their state).

import { z } from "zod";

/**
 * Media types accepted for upload. Everything else is refused before it is
 * stored. Archives, office documents, SVG, HTML and executables are excluded
 * on purpose: they need parsers or renderers that must run in a sandbox first.
 */
export const ACCEPTED_MEDIA_TYPES = {
  "application/pdf": { label: "PDF", extensions: [".pdf"], preview: "none" },
  "image/png": { label: "PNG image", extensions: [".png"], preview: "image" },
  "image/jpeg": { label: "JPEG image", extensions: [".jpg", ".jpeg"], preview: "image" },
  "image/gif": { label: "GIF image", extensions: [".gif"], preview: "image" },
  "image/webp": { label: "WebP image", extensions: [".webp"], preview: "image" },
  "text/plain": { label: "Plain text", extensions: [".txt"], preview: "text" },
  "text/markdown": { label: "Markdown", extensions: [".md", ".markdown"], preview: "text" },
} as const;

export type AcceptedMediaType = keyof typeof ACCEPTED_MEDIA_TYPES;
export const ACCEPTED_MEDIA_TYPE_LIST = Object.keys(ACCEPTED_MEDIA_TYPES) as AcceptedMediaType[];
export const AcceptedMediaType = z.enum(
  ACCEPTED_MEDIA_TYPE_LIST as [AcceptedMediaType, ...AcceptedMediaType[]],
);

/** Default size limit; deployments may lower it (UPLOAD_MAX_BYTES), never raise it past this. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * quarantined: stored in the quarantine bucket, waiting for the scan.
 * clean: scanned, type confirmed, copied to the files bucket; downloadable.
 * rejected: the scan or the type check failed; kept in quarantine, never served.
 * scan_unavailable: no working scanner; kept in quarantine until a scan succeeds.
 */
export const UPLOAD_STATUSES = ["quarantined", "clean", "rejected", "scan_unavailable"] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/** Why an upload was refused or rejected. Stable codes; messages are for people. */
export const UPLOAD_ERROR_CODES = [
  "too_large",
  "empty",
  "type_not_accepted",
  "type_mismatch",
  "malware_detected",
  "scanner_unavailable",
  "storage_unavailable",
  "invalid_filename",
] as const;
export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

export const UploadView = z.object({
  id: z.string().regex(/^upl_[0-9a-hjkmnp-tv-z]{26}$/),
  filename: z.string(),
  declaredType: z.string(),
  detectedType: z.string().nullable(),
  byteSize: z.number().int().nonnegative(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  status: z.enum(UPLOAD_STATUSES),
  errorCode: z.enum(UPLOAD_ERROR_CODES).nullable(),
  errorMessage: z.string().nullable(),
  scanner: z.string().nullable(),
  scannedAt: z.iso.datetime({ offset: true }).nullable(),
  uploadedBy: z.object({ userId: z.uuid().nullable(), name: z.string().nullable() }),
  jobId: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type UploadView = z.infer<typeof UploadView>;

// Shapes returned by the API's files and jobs endpoints (Phase 07).
export type { JobStatus, JobView, UploadStatus, UploadView } from "@originos/contracts";

export interface FileSettings {
  readonly storage: "configured" | "not_configured";
  readonly scanner: "configured" | "not_configured";
  readonly maxUploadBytes: number;
  readonly acceptedTypes: readonly {
    readonly type: string;
    readonly label: string;
    readonly extensions: readonly string[];
  }[];
}

export type FilePreview =
  | { readonly kind: "text"; readonly text: string; readonly truncated: boolean }
  | { readonly kind: "image"; readonly url: string; readonly expiresAt: string }
  | { readonly kind: "none" };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

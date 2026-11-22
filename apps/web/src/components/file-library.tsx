"use client";

import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  DataTable,
  EmptyState,
  TextField,
} from "@originos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { downloadFileAction, previewFileAction } from "../app/actions/files";
import {
  type FilePreview,
  type FileSettings,
  type UploadStatus,
  type UploadView,
  formatBytes,
} from "../lib/file-types";
import { FormMessage } from "./auth/auth-panel";
import { ClientForm } from "./client-form";

const STATUS: Record<UploadStatus, { label: string; tone: BadgeTone }> = {
  quarantined: { label: "checking", tone: "info" },
  clean: { label: "clean", tone: "positive" },
  rejected: { label: "rejected", tone: "negative" },
  scan_unavailable: { label: "not scanned", tone: "warning" },
};

const SCANNERS: Record<string, string> = { clamav: "ClamAV" };

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Re-fetch the list while scans are pending, for up to two minutes. */
function useRefreshWhile(pending: boolean) {
  const router = useRouter();
  const ticks = useRef(0);
  useEffect(() => {
    if (!pending) {
      ticks.current = 0;
      return;
    }
    if (ticks.current >= 40) return;
    const timer = setTimeout(() => {
      ticks.current += 1;
      router.refresh();
    }, 3_000);
    return () => clearTimeout(timer);
  });
}

export function FileLibrary({
  settings,
  files,
  canUpload,
}: {
  readonly settings: FileSettings;
  readonly files: readonly UploadView[];
  readonly canUpload: boolean;
}) {
  useRefreshWhile(files.some((f) => f.status === "quarantined"));
  const [preview, setPreview] = useState<{ file: UploadView; data: FilePreview } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const download = async (file: UploadView) => {
    setRowError(null);
    const result = await downloadFileAction(file.id);
    if (!result.ok) return setRowError(`${file.filename}: ${result.message}`);
    window.location.assign(result.data.url);
  };
  const showPreview = async (file: UploadView) => {
    setRowError(null);
    const result = await previewFileAction(file.id);
    if (!result.ok) return setRowError(`${file.filename}: ${result.message}`);
    setPreview({ file, data: result.data });
  };

  return (
    <div className="flex flex-col gap-6">
      {settings.storage === "not_configured" ? (
        <Card
          title="File storage is not set up"
          description="This deployment has no object storage configured, so files cannot be uploaded yet."
        >
          <p className="text-sm text-fg-muted">
            An operator sets S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY for the API and
            the worker, and creates the quarantine and files buckets. See docs/DEVELOPMENT.md.
          </p>
        </Card>
      ) : (
        <>
          {settings.scanner === "not_configured" ? (
            <FormMessage tone="error">
              Malware scanning is not set up for this deployment. Uploaded files stay in quarantine
              and cannot be downloaded until a scanner checks them.
            </FormMessage>
          ) : null}
          {canUpload ? <UploadForm settings={settings} /> : null}
        </>
      )}

      <Card
        title="Files"
        description="Every upload is held in quarantine until its type is confirmed from its contents and a malware scan passes. Only clean files can be previewed or downloaded."
      >
        {rowError ? (
          <div className="mb-3">
            <FormMessage tone="error">{rowError}</FormMessage>
          </div>
        ) : null}
        <DataTable
          caption="Files in this organization"
          captionHidden
          rowKey={(f) => f.id}
          rows={files}
          empty={<EmptyState title="No files yet">Uploaded files appear here.</EmptyState>}
          columns={[
            {
              key: "name",
              header: "File",
              cell: (f) => (
                <div className="flex flex-col">
                  <span className="font-medium break-all">{f.filename}</span>
                  <span className="text-xs text-fg-muted">
                    {formatBytes(f.byteSize)} · {f.uploadedBy.name ?? "Former member"} ·{" "}
                    {formatTime(f.createdAt)}
                  </span>
                </div>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (f) => (
                <div className="flex flex-col gap-1">
                  <span>
                    <Badge label={STATUS[f.status].label} tone={STATUS[f.status].tone} />
                  </span>
                  {f.errorMessage ? (
                    <span className="text-sm text-fg-muted">{f.errorMessage}</span>
                  ) : null}
                  {f.scanner && f.scannedAt ? (
                    <span className="text-xs text-fg-muted">
                      Scanned by {SCANNERS[f.scanner] ?? f.scanner}, {formatTime(f.scannedAt)}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              key: "sha256",
              header: "SHA-256",
              mono: true,
              cell: (f) =>
                f.sha256 ? <span title={f.sha256}>{f.sha256.slice(0, 12)}…</span> : "—",
            },
            {
              key: "actions",
              header: "Actions",
              align: "end",
              cell: (f) =>
                f.status === "clean" ? (
                  <span className="inline-flex gap-2">
                    <Button
                      action="files.preview"
                      size="sm"
                      variant="ghost"
                      onClick={() => void showPreview(f)}
                    >
                      Preview
                    </Button>
                    <Button action="files.download" size="sm" onClick={() => void download(f)}>
                      Download
                    </Button>
                  </span>
                ) : (
                  <span className="text-sm text-fg-muted">Not available</span>
                ),
            },
          ]}
        />
      </Card>

      {preview ? (
        <Card title={`Preview: ${preview.file.filename}`}>
          <PreviewBody data={preview.data} name={preview.file.filename} />
          <div className="mt-3">
            <Button
              action="files.preview.close"
              size="sm"
              variant="ghost"
              onClick={() => setPreview(null)}
            >
              Close preview
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function PreviewBody({ data, name }: { readonly data: FilePreview; readonly name: string }) {
  if (data.kind === "text") {
    return (
      <>
        {/* Rendered as text, never as HTML or Markdown. */}
        <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface-alt p-3 text-sm whitespace-pre-wrap">
          {data.text}
        </pre>
        {data.truncated ? (
          <p className="mt-2 text-sm text-fg-muted">Showing the first 20,000 characters.</p>
        ) : null}
      </>
    );
  }
  if (data.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimizable asset
    return <img src={data.url} alt={`Preview of ${name}`} className="max-h-96 max-w-full" />;
  }
  return (
    <p className="text-sm text-fg-muted">
      No preview for this type. PDFs are not rendered in the browser here; download the file to open
      it.
    </p>
  );
}

function UploadForm({ settings }: { readonly settings: FileSettings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = settings.acceptedTypes.flatMap((t) => [t.type, ...t.extensions]).join(",");
  const types = settings.acceptedTypes.map((t) => t.label).join(", ");

  return (
    <Card
      title="Upload a file"
      description={`Accepted: ${types}. Up to ${formatBytes(settings.maxUploadBytes)}.`}
    >
      <ClientForm
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const file = new FormData(form).get("file");
          setError(null);
          setNotice(null);
          if (!(file instanceof File) || file.size === 0) {
            setError(file instanceof File ? "The file is empty." : "Choose a file first.");
            return;
          }
          if (file.size > settings.maxUploadBytes) {
            setError(
              `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(settings.maxUploadBytes)}.`,
            );
            return;
          }
          setBusy(true);
          void fetch("/api/files", {
            method: "POST",
            body: file,
            headers: {
              "content-type": "application/octet-stream",
              "x-upload-filename": encodeURIComponent(file.name),
              "x-upload-type": file.type || "application/octet-stream",
            },
          })
            .then(async (res) => {
              const body = (await res.json().catch(() => ({}))) as { message?: string };
              if (!res.ok) {
                setError(body.message ?? "The upload failed.");
                return;
              }
              setNotice(`${file.name} uploaded. It is being checked and appears below.`);
              form.reset();
              router.refresh();
            })
            .catch(() => setError("The upload did not reach the server. Try again."))
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex-1">
          <TextField
            id="upload-file"
            name="file"
            type="file"
            label="File"
            accept={accept}
            required
          />
        </div>
        <div>
          <Button action="files.upload" type="submit">
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </ClientForm>
      <div className="mt-3 flex flex-col gap-2" aria-live="polite">
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}
      </div>
    </Card>
  );
}

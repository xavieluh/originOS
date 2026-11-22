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
import { useState } from "react";
import { cancelJobAction, resumeJobAction, retryJobAction } from "../app/actions/files";
import type { JobStatus, JobView } from "../lib/file-types";
import { ConfirmButton, useAction } from "./action-helpers";

const STATUS: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "queued", tone: "neutral" },
  running: { label: "running", tone: "info" },
  waiting: { label: "waiting for a person", tone: "warning" },
  succeeded: { label: "succeeded", tone: "positive" },
  cancelled: { label: "cancelled", tone: "neutral" },
  dead: { label: "failed", tone: "negative" },
};

const FILTERS: readonly { label: string; status: JobStatus | null }[] = [
  { label: "All", status: null },
  { label: "Failed", status: "dead" },
  { label: "Waiting", status: "waiting" },
  { label: "Running", status: "running" },
  { label: "Queued", status: "pending" },
];

const TYPE_LABELS: Record<string, string> = { "ingest.scan_upload": "Check uploaded file" };

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function JobAdmin({
  jobs,
  status,
  canAct,
}: {
  readonly jobs: readonly JobView[];
  readonly status: JobStatus | null;
  readonly canAct: boolean;
}) {
  const { run, messages } = useAction();
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Filter jobs by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.label}
            action={`jobs.filter.${f.status ?? "all"}`}
            href={f.status ? `/settings/jobs?status=${f.status}` : "/settings/jobs"}
            size="sm"
            variant={f.status === status ? "primary" : "secondary"}
          >
            {f.label}
          </Button>
        ))}
      </nav>
      <Card
        title={status ? `${FILTERS.find((f) => f.status === status)?.label} jobs` : "Recent jobs"}
        description="Failed jobs ran out of attempts or hit an error that retrying would not fix; retrying starts them again with fresh attempts. Cancelling a running job stops it at its next checkpoint."
      >
        <div className="mb-3 flex flex-col gap-2">{messages}</div>
        <DataTable
          caption="Background jobs"
          captionHidden
          rowKey={(j) => j.id}
          rows={jobs}
          empty={
            <EmptyState title={status ? "No jobs with this status" : "No background jobs yet"} />
          }
          columns={[
            {
              key: "job",
              header: "Job",
              cell: (j) => (
                <div className="flex flex-col">
                  <span className="font-medium">{TYPE_LABELS[j.type] ?? j.type}</span>
                  <span className="text-xs text-fg-muted">
                    {j.subjectRef ? `${j.subjectRef} · ` : ""}
                    {formatTime(j.createdAt)}
                  </span>
                </div>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (j) => (
                <div className="flex flex-col gap-1">
                  <span>
                    <Badge label={STATUS[j.status].label} tone={STATUS[j.status].tone} />
                  </span>
                  {j.status === "running" && j.progressMessage ? (
                    <span className="text-sm text-fg-muted">
                      {j.progress}% · {j.progressMessage}
                    </span>
                  ) : null}
                  {j.cancelRequested && j.status === "running" ? (
                    <span className="text-sm text-fg-muted">Cancel requested</span>
                  ) : null}
                  {j.waitReason ? <span className="text-sm">{j.waitReason}</span> : null}
                  {j.lastError && j.status !== "succeeded" ? (
                    <span className="text-sm text-fg-muted break-all">
                      Last error: {j.lastError}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              key: "attempts",
              header: "Attempts",
              mono: true,
              cell: (j) => `${j.attempts}/${j.maxAttempts}`,
            },
            {
              key: "actions",
              header: "Actions",
              align: "end",
              cell: (j) =>
                canAct ? (
                  <JobActions job={j} run={run} />
                ) : (
                  <span className="text-sm text-fg-muted">—</span>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function JobActions({
  job,
  run,
}: {
  readonly job: JobView;
  readonly run: ReturnType<typeof useAction>["run"];
}) {
  const [note, setNote] = useState("");
  const label = TYPE_LABELS[job.type] ?? job.type;
  return (
    <div className="flex flex-col items-end gap-2">
      {job.status === "waiting" ? (
        <div className="flex flex-col items-end gap-2">
          <TextField
            id={`note-${job.id}`}
            label="Note (optional)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <span className="inline-flex gap-2">
            <Button
              action="jobs.approve"
              size="sm"
              onClick={() =>
                void run(
                  () => resumeJobAction(job.id, { decision: "approve", ...(note ? { note } : {}) }),
                  `${label}: approved; it continues shortly.`,
                )
              }
            >
              Approve
            </Button>
            <Button
              action="jobs.reject"
              size="sm"
              variant="danger"
              onClick={() =>
                void run(
                  () => resumeJobAction(job.id, { decision: "reject", ...(note ? { note } : {}) }),
                  `${label}: rejected.`,
                )
              }
            >
              Reject
            </Button>
          </span>
        </div>
      ) : null}
      <span className="inline-flex gap-2">
        {job.status === "dead" ? (
          <Button
            action="jobs.retry"
            size="sm"
            onClick={() => void run(() => retryJobAction(job.id), `${label}: queued again.`)}
          >
            Retry
          </Button>
        ) : null}
        {(job.status === "pending" || job.status === "waiting" || job.status === "running") &&
        !job.cancelRequested ? (
          <ConfirmButton
            action="jobs.cancel"
            label="Cancel job"
            confirmLabel="Confirm cancel"
            onConfirm={() =>
              void run(
                () => cancelJobAction(job.id),
                job.status === "running"
                  ? `${label}: cancel requested; it stops at its next checkpoint.`
                  : `${label}: cancelled.`,
              )
            }
          />
        ) : null}
      </span>
    </div>
  );
}

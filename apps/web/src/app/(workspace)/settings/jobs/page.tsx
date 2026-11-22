import { ErrorState, PageHeader } from "@originos/ui";
import { JOB_STATUSES } from "@originos/contracts";
import type { Metadata } from "next";
import { JobAdmin } from "../../../../components/job-admin";
import { can, type MyPermissions } from "../../../../lib/access-types";
import { apiFetch } from "../../../../lib/api";
import type { JobStatus, JobView } from "../../../../lib/file-types";
import { requireWorkspace } from "../../../../lib/session";

export const metadata: Metadata = { title: "Background jobs" };

export default async function JobsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string }>;
}) {
  await requireWorkspace();
  const { status: raw } = await searchParams;
  const status = (JOB_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as JobStatus)
    : null;
  const mine = await apiFetch<MyPermissions>("/v1/me/permissions");
  const header = (
    <PageHeader
      eyebrow="Settings"
      title="Background jobs"
      description="Work the platform does in the background, such as checking uploaded files. Review failed jobs, retry them, cancel work, or answer jobs that are waiting for a person."
    />
  );
  if (!mine.ok || !can(mine.data.permissions, "read", "jobs")) {
    return (
      <>
        {header}
        <ErrorState title="Only owners and admins can see background jobs">
          Ask an owner or admin of this organization if a job needs attention.
        </ErrorState>
      </>
    );
  }
  const jobs = await apiFetch<JobView[]>(
    `/v1/organization/jobs${status ? `?status=${status}` : ""}`,
  );
  return (
    <>
      {header}
      {jobs.ok ? (
        <JobAdmin
          jobs={jobs.data}
          status={status}
          canAct={can(mine.data.permissions, "admin", "jobs")}
        />
      ) : (
        <ErrorState title="Could not load jobs">{jobs.message}</ErrorState>
      )}
    </>
  );
}

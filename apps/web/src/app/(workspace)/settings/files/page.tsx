import { ErrorState, PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { FileLibrary } from "../../../../components/file-library";
import { can, type MyPermissions } from "../../../../lib/access-types";
import { apiFetch } from "../../../../lib/api";
import type { FileSettings, UploadView } from "../../../../lib/file-types";
import { requireWorkspace } from "../../../../lib/session";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage() {
  await requireWorkspace();
  const [mine, settings, files] = await Promise.all([
    apiFetch<MyPermissions>("/v1/me/permissions"),
    apiFetch<FileSettings>("/v1/files/settings"),
    apiFetch<UploadView[]>("/v1/files"),
  ]);
  const failed = [settings, files].find((r) => !r.ok);
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Files"
        description="Files your organization has uploaded, and whether each one passed the type check and malware scan."
      />
      {settings.ok && files.ok ? (
        <FileLibrary
          settings={settings.data}
          files={files.data}
          canUpload={mine.ok && can(mine.data.permissions, "write", "files")}
        />
      ) : (
        <ErrorState title="Could not load files">
          {failed && !failed.ok ? failed.message : null}
        </ErrorState>
      )}
    </>
  );
}

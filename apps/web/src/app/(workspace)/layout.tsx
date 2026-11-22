import type { ReactNode } from "react";
import { WorkspaceFrame } from "../../components/workspace-frame";
import { requireWorkspace } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireWorkspace();
  return (
    <WorkspaceFrame surface="workspace" session={session}>
      {children}
    </WorkspaceFrame>
  );
}

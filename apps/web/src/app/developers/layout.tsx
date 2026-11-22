import type { ReactNode } from "react";
import { WorkspaceFrame } from "../../components/workspace-frame";
import { requireWorkspace } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function DevelopersLayout({ children }: { children: ReactNode }) {
  const session = await requireWorkspace();
  return (
    <WorkspaceFrame surface="developers" session={session}>
      {children}
    </WorkspaceFrame>
  );
}

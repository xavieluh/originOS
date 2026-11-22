import type { ReactNode } from "react";
import { WorkspaceFrame } from "../../components/workspace-frame";

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return <WorkspaceFrame surface="developers">{children}</WorkspaceFrame>;
}

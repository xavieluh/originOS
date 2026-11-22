import { PublicShell, ThemeToggle } from "@originos/ui";
import type { ReactNode } from "react";
import { NextLink } from "../../components/next-link";
import { publicNav } from "../../lib/navigation";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell
      productName="OriginOS"
      nav={publicNav}
      linkComponent={NextLink}
      headerExtra={<ThemeToggle />}
      footer={<p>Development build. Nothing on this site is a live verification record yet.</p>}
    >
      {children}
    </PublicShell>
  );
}

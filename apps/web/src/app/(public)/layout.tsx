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
      footer={
        <p>
          Development build. Profile badges state what was checked, how and when; they are not trust
          scores.
        </p>
      }
    >
      {children}
    </PublicShell>
  );
}

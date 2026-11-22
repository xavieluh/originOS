import { PublicShell, ThemeToggle } from "@originos/ui";
import type { ReactNode } from "react";
import { NextLink } from "../../components/next-link";
import { publicNav } from "../../lib/navigation";

export const dynamic = "force-dynamic";

/** Sign-in, sign-up, recovery, onboarding and invitations share one narrow, focused layout. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell
      productName="OriginOS"
      nav={publicNav}
      linkComponent={NextLink}
      headerExtra={<ThemeToggle />}
      footer={
        <p>Development build. Accounts here are real records in this deployment&apos;s database.</p>
      }
    >
      <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">{children}</div>
    </PublicShell>
  );
}

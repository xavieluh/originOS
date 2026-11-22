"use client";

import { CommandBar, ThemeToggle, WorkspaceShell, type NavItem } from "@originos/ui";
import {
  ArrowLeft,
  Bot,
  Compass,
  FlaskConical,
  House,
  PenLine,
  Plug,
  Settings,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { UserMenu, WorkspaceSwitcher } from "./account-menus";
import { NextLink } from "./next-link";
import type { WorkspaceSession } from "../lib/session-types";
import {
  commandItems,
  developerSection,
  workspaceSections,
  type WorkspaceSectionId,
} from "../lib/navigation";

const icons: Record<WorkspaceSectionId, NonNullable<NavItem["icon"]>> = {
  home: House,
  agents: Bot,
  research: FlaskConical,
  publish: PenLine,
  trust: ShieldCheck,
  discover: Compass,
  integrations: Plug,
  settings: Settings,
};

const workspaceNav: NavItem[] = workspaceSections.map((s) => ({
  href: s.href,
  label: s.label,
  icon: icons[s.id],
}));
const workspaceSecondary: NavItem[] = [
  { href: developerSection.href, label: "Developer console", icon: SquareTerminal },
];
const developerNav: NavItem[] = [
  { href: developerSection.href, label: "Overview", icon: SquareTerminal },
];
const developerSecondary: NavItem[] = [
  { href: "/home", label: "Back to workspace", icon: ArrowLeft },
];
const commands = commandItems();

export function WorkspaceFrame({
  surface,
  session,
  children,
}: {
  readonly surface: "workspace" | "developers";
  readonly session: WorkspaceSession;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isDev = surface === "developers";
  return (
    <WorkspaceShell
      productName="OriginOS"
      surfaceLabel={isDev ? "Developer console" : "Workspace"}
      nav={isDev ? developerNav : workspaceNav}
      secondaryNav={isDev ? developerSecondary : workspaceSecondary}
      currentPath={pathname}
      linkComponent={NextLink}
      topBar={
        <>
          <div className="flex-1 sm:flex-none">
            <CommandBar items={commands} onNavigate={(href) => router.push(href)} />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <WorkspaceSwitcher session={session} />
            <UserMenu session={session} />
          </div>
          {/* On phones the theme control moves into the account menu to keep the bar on one line. */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
        </>
      }
      sidebarFooter={
        <p className="text-xs text-fg-muted">
          Development build. Signed in to {session.active.name} as {session.active.role}.
        </p>
      }
    >
      {children}
    </WorkspaceShell>
  );
}

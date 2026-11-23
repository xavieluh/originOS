import { allNavRoutes, developerSection, workspaceSections } from "../src/lib/navigation";

export const NAV_ROUTES = allNavRoutes();
export const GALLERY_ROUTE = "/design-system";

/** How many "not yet available" cards each route must show. */
export const PLANNED_COUNT: Record<string, number> = Object.fromEntries([
  ...workspaceSections.map((s) => [s.href, s.planned.length]),
  [developerSection.href, developerSection.planned.length],
  ["/", 3],
]);

/**
 * Every <button> the app may render, by data-action. A button outside this
 * list fails the suite, so no control can ship without a known behavior.
 */
export const BUTTON_ACTIONS = new Set([
  "nav.toggle",
  "command-bar.open",
  "drawer.close",
  "gallery.primary",
  "gallery.secondary",
  "gallery.ghost",
  "gallery.danger",
  "gallery.small",
  "gallery.disabled",
  "gallery.drawer-open",
  "gallery.form-submit",
  // Phase 04: accounts, organizations and invitations
  "workspace.switcher",
  "workspace.switch",
  "account.menu",
  "account.sign-out",
  "account.save-name",
  "account.change-password",
  "account.2fa-start",
  "account.2fa-confirm",
  "account.2fa-disable",
  "account.passkey-add",
  "account.passkey-remove",
  "account.session-revoke",
  "account.sessions-revoke-others",
  "auth.sign-in",
  "auth.sign-in-passkey",
  "auth.sign-up",
  "auth.resend-verification",
  "auth.request-reset",
  "auth.reset-password",
  "auth.verify-second-factor",
  "auth.second-factor-mode",
  "organization.create",
  "organization.open",
  "organization.rename",
  "invitation.send",
  "invitation.revoke",
  "invitation.revoke.confirm",
  "invitation.revoke.cancel",
  "invitation.accept",
  "invitation.switch-account",
  "member.leave",
  "member.leave.confirm",
  "member.leave.cancel",
  "member.make-owner",
  "member.make-owner.confirm",
  "member.make-owner.cancel",
  "member.remove",
  "member.remove.confirm",
  "member.remove.cancel",
  // Phase 05: permissions, agents, grants and consent
  "agent.create",
  "agent.disable",
  "agent.disable.confirm",
  "agent.disable.cancel",
  "grant.create",
  "grant.revoke",
  "grant.revoke.confirm",
  "grant.revoke.cancel",
  "consent.give",
  "consent.revoke",
  "consent.revoke.confirm",
  "consent.revoke.cancel",
  // Phase 07: files and background jobs
  "files.upload",
  "files.preview",
  "files.preview.close",
  "files.download",
  "jobs.retry",
  "jobs.approve",
  "jobs.reject",
  "jobs.cancel",
  "jobs.cancel.confirm",
  "jobs.cancel.cancel",
  // Phase 08: Origin Connect
  "integration.connect",
  "integration.check",
  "integration.disconnect",
  "integration.disconnect.confirm",
  "integration.disconnect.cancel",
]);

/** Account screens. Signed-out ones are checked without a session. */
export const SIGNED_OUT_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/two-factor",
  "/invitations/accept",
];
export const SIGNED_IN_ROUTES = [
  "/settings/account",
  "/settings/access",
  "/settings/consent",
  "/settings/files",
  "/settings/jobs",
  "/onboarding",
];

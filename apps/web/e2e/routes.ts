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
]);

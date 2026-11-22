/**
 * OriginOS design tokens: the single source for colors, type, spacing and
 * motion. `scripts/build-css.mjs` turns them into CSS custom properties
 * (dist/tokens.css); Tailwind maps utilities onto those properties, and
 * `test/contrast.test.ts` checks every text and UI pairing against WCAG 2.2.
 *
 * Visual direction: "archival ink on paper". Warm paper neutrals, a deep
 * verdigris accent for provenance, a serif display face for headings and a
 * monospace face for IDs, hashes and timestamps, which matter in this product.
 */

export type ThemeName = "light" | "dark";

export interface ColorTokens {
  /** Page background. */
  readonly bg: string;
  /** Cards, panels, inputs. */
  readonly surface: string;
  /** Sunken or alternate rows, sidebar. */
  readonly surfaceAlt: string;
  /** Decorative dividers (not required to meet 3:1). */
  readonly border: string;
  /** Borders of interactive controls; must meet 3:1 against bg and surface. */
  readonly borderStrong: string;
  readonly fg: string;
  readonly fgMuted: string;
  readonly accent: string;
  /** Text on accent backgrounds. */
  readonly accentFg: string;
  readonly accentSubtle: string;
  /** Text in accent color on bg/surface (links, active nav). */
  readonly accentText: string;
  readonly focus: string;
  readonly positive: string;
  readonly positiveSubtle: string;
  readonly warning: string;
  readonly warningSubtle: string;
  readonly negative: string;
  readonly negativeSubtle: string;
  readonly info: string;
  readonly infoSubtle: string;
  readonly overlay: string;
}

export const colors: Readonly<Record<ThemeName, ColorTokens>> = {
  light: {
    bg: "#f6f4ee",
    surface: "#ffffff",
    surfaceAlt: "#eeebe2",
    border: "#dcd7cb",
    borderStrong: "#857e70",
    fg: "#1b1a17",
    fgMuted: "#57534b",
    accent: "#0e5c56",
    accentFg: "#ffffff",
    accentSubtle: "#dcebe7",
    accentText: "#0b524d",
    focus: "#2f45c6",
    positive: "#1d6a3d",
    positiveSubtle: "#e0efe5",
    warning: "#7f5300",
    warningSubtle: "#f6ecd6",
    negative: "#a12428",
    negativeSubtle: "#f7e3e2",
    info: "#1f4f8c",
    infoSubtle: "#e2eaf5",
    overlay: "rgba(27, 26, 23, 0.45)",
  },
  dark: {
    bg: "#121210",
    surface: "#1b1a17",
    surfaceAlt: "#24221e",
    border: "#36332d",
    borderStrong: "#7d776b",
    fg: "#eceae4",
    fgMuted: "#b2ada1",
    accent: "#5cc3b6",
    accentFg: "#0a1f1c",
    accentSubtle: "#16322f",
    accentText: "#6fd0c3",
    focus: "#9aaaff",
    positive: "#72cf98",
    positiveSubtle: "#16301f",
    warning: "#e3b452",
    warningSubtle: "#33280f",
    negative: "#f28c8f",
    negativeSubtle: "#3a1a1b",
    info: "#8fb6f5",
    infoSubtle: "#172840",
    overlay: "rgba(0, 0, 0, 0.6)",
  },
};

export const fonts = {
  display: '"Fraunces Variable", "Iowan Old Style", Georgia, serif',
  body: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, "SFMono-Regular", Menlo, monospace',
} as const;

export const radii = { sm: "4px", md: "8px", lg: "14px", pill: "999px" } as const;

export const motion = {
  fast: "120ms",
  base: "180ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/** Text/background pairs that must meet WCAG 2.2 AA 4.5:1 (normal text). */
export const textPairs: readonly (readonly [keyof ColorTokens, keyof ColorTokens])[] = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["fg", "surfaceAlt"],
  ["fgMuted", "bg"],
  ["fgMuted", "surface"],
  ["fgMuted", "surfaceAlt"],
  ["accentText", "bg"],
  ["accentText", "surface"],
  ["accentText", "accentSubtle"],
  ["accentFg", "accent"],
  ["positive", "positiveSubtle"],
  ["positive", "surface"],
  ["warning", "warningSubtle"],
  ["warning", "surface"],
  ["negative", "negativeSubtle"],
  ["negative", "surface"],
  ["info", "infoSubtle"],
  ["info", "surface"],
  ["fgMuted", "accentSubtle"],
];

/** Non-text UI pairs that must meet WCAG 2.2 1.4.11 3:1 (control borders, focus ring). */
export const uiPairs: readonly (readonly [keyof ColorTokens, keyof ColorTokens])[] = [
  ["borderStrong", "bg"],
  ["borderStrong", "surface"],
  ["focus", "bg"],
  ["focus", "surface"],
  ["focus", "surfaceAlt"],
  ["accent", "bg"],
  ["accent", "surface"],
];

/** CSS custom-property name for a color token, e.g. fgMuted → --oo-fg-muted. */
export function cssVar(name: keyof ColorTokens): string {
  return `--oo-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

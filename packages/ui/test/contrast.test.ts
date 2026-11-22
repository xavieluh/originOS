import { describe, expect, it } from "vitest";
import { colors, cssVar, textPairs, uiPairs, type ThemeName } from "../src/tokens.js";

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("contrast helper", () => {
  it("matches known WCAG values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

for (const theme of ["light", "dark"] as ThemeName[]) {
  describe(`${theme} theme`, () => {
    const t = colors[theme];
    it.each(textPairs.map(([f, b]) => [f, b] as const))("text %s on %s meets 4.5:1", (f, b) => {
      expect(contrast(t[f], t[b])).toBeGreaterThanOrEqual(4.5);
    });
    it.each(uiPairs.map(([f, b]) => [f, b] as const))("UI %s against %s meets 3:1", (f, b) => {
      expect(contrast(t[f], t[b])).toBeGreaterThanOrEqual(3);
    });
  });
}

describe("cssVar", () => {
  it("kebab-cases token names", () => {
    expect(cssVar("fgMuted")).toBe("--oo-fg-muted");
    expect(cssVar("bg")).toBe("--oo-bg");
  });
});

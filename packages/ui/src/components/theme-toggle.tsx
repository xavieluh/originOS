"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useId, useState } from "react";

import {
  applyThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../theme.js";

const options: readonly { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle() {
  const name = useId();
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(readThemePreference(globalThis.localStorage));
  }, []);

  function choose(next: ThemePreference) {
    setPref(next);
    applyThemePreference(document.documentElement, next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this page.
    }
  }

  return (
    <fieldset
      className="inline-flex rounded-pill border border-border bg-surface p-0.5"
      data-testid="theme-toggle"
    >
      <legend className="sr-only">Colour theme</legend>
      {options.map(({ value, label, Icon }) => (
        <label
          key={value}
          className="relative inline-flex cursor-pointer items-center gap-1 rounded-pill px-1.5 py-1 text-xs sm:px-2 text-fg-muted has-[:checked]:bg-accent-subtle has-[:checked]:text-accent-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={pref === value}
            onChange={() => choose(value)}
            className="sr-only"
          />
          <Icon aria-hidden className="size-3.5" />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

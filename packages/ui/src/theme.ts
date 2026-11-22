// Framework-free theme helpers. Kept out of the "use client" module so server code can import them.

export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "originos-theme";

export function readThemePreference(
  storage: Pick<Storage, "getItem"> | undefined,
): ThemePreference {
  try {
    const v = storage?.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(root: HTMLElement, pref: ThemePreference): void {
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/**
 * Inline script for <head> so the stored theme applies before first paint.
 * Kept tiny and free of user input.
 */
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

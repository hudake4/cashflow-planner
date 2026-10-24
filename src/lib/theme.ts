/**
 * Light/dark appearance. A display preference of this browser (not household data), so it
 * lives in localStorage rather than the database. Dark is the default: the server renders
 * <html class="dark">, and THEME_BOOT_SCRIPT drops the class before first paint if the user
 * chose light, so there is no flash.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cashflow-theme";

export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light")document.documentElement.classList.remove("dark")}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
}

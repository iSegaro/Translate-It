// src/utils/theme.js

/**
 * Applies the specified theme to the document root.
 * If theme is "auto", it determines the theme based on system preference.
 * @param {string} theme - The theme to apply ('auto', 'light', 'dark').
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");

  let effectiveTheme = theme;
  if (theme === "auto") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    effectiveTheme = prefersDark ? "dark" : "light";
  }
  // Ensure effectiveTheme is either 'light' or 'dark'
  if (effectiveTheme !== 'light' && effectiveTheme !== 'dark') {
    effectiveTheme = 'light'; // Default to light if something unexpected happens
  }
  root.classList.add(`theme-${effectiveTheme}`);
}

/**
 * Resolves the theme preference to an actual theme ('light' or 'dark').
 * If the provided theme is 'auto', it uses system preference.
 * @param {string} themePreference - The theme preference ('auto', 'light', 'dark').
 * @returns {string} - Resolved theme ('light' or 'dark').
 */
export function getResolvedUserTheme(themePreference) {
  if (themePreference === "auto") {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
    return "light"; // Fallback if window.matchMedia is not available
  }
  return (themePreference === 'dark') ? 'dark' : 'light'; // Ensure only 'light' or 'dark'
}
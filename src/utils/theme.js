// src/utils/theme.js

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");

  if (theme === "auto") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    root.classList.add(prefersDark ? "theme-dark" : "theme-light");
  } else {
    root.classList.add(`theme-${theme}`);
  }
}

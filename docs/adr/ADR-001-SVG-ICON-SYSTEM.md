# ADR: SVG Icon System

**Status:** Accepted

---

## Context

The project had three concurrent icon rendering strategies with no documented standard:

1. **Inline `<svg>`** — SVG markup duplicated in Vue templates; no single source of truth; accessibility attributes inconsistent.
2. **`<img src="...svg">`** — Unable to respond to `currentColor`; hardcoded fills caused color bugs when parent themes changed (e.g., PdfToolbar fit-page/fit-width icons).
3. **CSS-only** — Three-dot kebab menu; acceptable for unique non-SVG patterns.

This fragmentation created:
- A color bug that required tracking root cause through rendering pipelines.
- Duplicated SVG path data across components (TTS icons alone appeared in 3 files).
- Inconsistent accessibility (some inline SVGs had `aria-hidden`, most did not).
- No clear answer for "where do new icons go?"

---

## Decision

Standardize on **CSS Mask** as the rendering technique for all monochrome UI icons, mediated by a shared `SvgIcon` component.

### How it works

- SVG files are stored in `src/icons/ui/` — the single source of truth.
- `SvgIcon` renders a `<span>` with `mask-image: url(<asset>)` and `background-color: currentColor`.
- Icon color is inherited from the parent element — theming is automatic.
- Icon size is controlled via the `:size` prop.

### Why CSS Mask

- **Zero build changes.** No new Vite plugin, no loader configuration. The `?url` suffix (already supported by Vite) resolves the SVG to a public URL.
- **currentColor theming.** The icon always matches parent text color — solves the color bug at the architectural level.
- **Decorative by default.** The `<span>` has no semantic meaning; `aria-hidden="true"` is the natural default. Only opt in to `role="img"` when the icon carries information.
- **Incremental adoption.** Any component can switch to `SvgIcon` independently. No flag day migration.
- **No asset preloading.** Unlike `@font-face` icon fonts, SVG files are loaded on demand by the browser.

---

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| **Inline `<svg>`** | Duplicates markup; no single source of truth; inconsistent accessibility. |
| **`vite-svg-loader`** | Requires a build plugin change; conflicts with `?url` imports used elsewhere in the project. |
| **`<img src="...svg">`** | Cannot inherit `currentColor`; color must be hardcoded in the SVG fill. |
| **SVG `<use>` references** | Cross-origin restrictions in extension contexts make external sprite sheets unreliable. |
| **`@iconify`** | External dependency with versioning risk; existing usage is limited to 5 subtitle/provider files. |
| **Icon font (CSS `content`)** | No standard for monochrome custom icons; accessibility via CSS pseudo-elements is fragile. |

---

## Consequences

### Positive

- **Theming is automatic.** All icons respond to parent `color` changes (hover, active, disabled, dark mode).
- **One canonical asset per icon.** No inline duplicates.
- **Accessibility is built in.** Decorative default; opt-in to `aria-label`.
- **Zero migration cost.** Each component can be converted independently.
- **Incremental by nature.** Phases can be shipped without waiting for full adoption.

### Negative

- **Single color only.** Multicolor/brand icons (provider logos, extension icon) must continue using `<img>` with PNG.
- **`?url` suffix required.** All SVG imports for monochrome icons must use `?url` to resolve to a public URL. This is a Vite convention that contributors must learn.
- **`viewBox` required.** SVG files missing a `viewBox` attribute (like `capture.svg`) cannot be used with CSS Mask until fixed.
- **Opacity becomes alpha.** `opacity` in SVG paths maps to alpha in the rendered mask — same visual result, but conceptually different.
- **Root-`<svg>` transforms unreliable.** `transform` on the root `<svg>` element has undefined behavior in CSS Mask context in some browsers. SVGs relying on this (like the original `fit-page.svg`) must be fixed.

---

## Migration Strategy

The migration is phased to allow incremental adoption with zero regressions:

- **Phase A** — Create `SvgIcon` shared component and its SCSS. No consumers yet.
- **Phase B** — Migrate one real consumer (PdfToolbar) to validate the API and fix any issues.
- **Phase C** — Documentation (this ADR, technical guide, AGENTS.md pointer).
- **Phase D+** — Per-feature migration PRs, prioritized by duplication and impact:
  1. TTS system (icons duplicated in 3+ components)
  2. TranslationWindowToolbar (4 icons, one file)
  3. Mobile views (duplicated back chevrons, star)
  4. DesktopFabMenu
  5. Remaining singletons

No feature should block on migration. Working code stays working.

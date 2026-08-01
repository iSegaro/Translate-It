# Icon System

## Overview

The project uses three icon strategies. Each has a clear purpose:

| Strategy | When to use | Example |
|---|---|---|
| `SvgIcon` (CSS Mask) | Monochrome UI icons | Toolbar buttons, action icons, chevrons |
| `<img>` with PNG | Brand/multicolor assets | Provider logos, extension icons |
| CSS-only | Unique non-SVG patterns | Three-dot kebab menu |

Avoid new inline `<svg>` for reusable monochrome UI icons. Existing inline SVGs should be migrated incrementally to `SvgIcon`. Exceptional cases with a justified architectural reason may still use inline `<svg>`, but this should be rare.

---

## SvgIcon — Monochrome UI Icons

### Component

`src/components/shared/SvgIcon.vue`

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `src` | String | required | Imported SVG URL (must use `?url` suffix) |
| `size` | Number \| String | `'1em'` | Number → px. String → any CSS unit. |
| `ariaLabel` | String | `''` | When set: `role="img"` + `aria-label`. When empty: `aria-hidden="true"` (decorative). |

### Usage

```vue
<script setup>
import SvgIcon from '@/components/shared/SvgIcon.vue'
import closeIcon from '@/icons/ui/close.svg?url'
</script>

<template>
  <button aria-label="Close">
    <SvgIcon :src="closeIcon" :size="16" />
  </button>
</template>
```

### Import Convention

All monochrome SVG imports must use the `?url` suffix:

```js
import iconName from '@/icons/ui/icon-name.svg?url'
```

The `?url` suffix tells Vite to resolve the import to the asset's public URL, which `mask-image: url()` requires.

### Color

Color is inherited from the parent element via `background-color: currentColor`:

```css
.svg-icon {
  background-color: currentColor;
}
```

Set `color` on the parent button to theme the icon:

```css
button { color: #333; }
button:hover { color: #0066cc; }
```

The SVG asset's `fill` attribute is ignored in mask context. It does not need to be `currentColor`.

### Size

Pass as a number (px) or string (any CSS unit):

```vue
<SvgIcon :src="icon" :size="16" />       <!-- 16px -->
<SvgIcon :src="icon" :size="'1.5em'" />   <!-- 1.5em -->
<SvgIcon :src="icon" :size="'2rem'" />    <!-- 2rem -->
```

### Accessibility

- **Decorative icons (default):** Omit `ariaLabel`. The `<span>` renders `aria-hidden="true"`. The parent button must carry `aria-label`.
- **Informational icons:** Pass `ariaLabel`. The component renders `role="img"` with the label. Rarely needed — most icons in the project are decorative.

---

## `<img>` — Brand & Multicolor Icons

Provider logos, extension icons, and any multicolor SVG/PNG continue using `<img>`.

```vue
<img
  :src="providerIcon"
  :alt="t('provider_name')"
>
```

- Always provide `alt` text. Use `alt=""` for decorative images.
- Provider icons use PNG in `src/icons/providers/`.
- Extension icons use PNG in `src/icons/extension/`.

---

## SVG Asset Conventions

### Location

| Type | Directory |
|---|---|
| Monochrome UI icons | `src/icons/ui/` |
| Provider logos | `src/icons/providers/` |
| Extension icons | `src/icons/extension/` |
| Language flags | `src/icons/flags/` |

### Required Attributes

Every SVG in `src/icons/ui/` must have:

- `viewBox` — required for CSS Mask scaling. Without this, the icon may render at the wrong size or aspect ratio.
- `width` and `height` — optional but recommended for correct intrinsic sizing.

### Fill

`fill` values are ignored in CSS Mask context. Assets may keep their existing `fill` attributes. They do not need to be changed to `currentColor`.

### Naming

- Kebab-case only: `icon-name.svg`
- Descriptive: `close.svg`, not `x.svg`
- Semantic: `trash-small.svg`, not `trash.svg` when a smaller variant exists

### Transform on Root `<svg>`

Do not use `transform` on the root `<svg>` element. Browsers may not apply it reliably in CSS Mask context. Wrap transformed content in a `<g>`:

```svg
<!-- Correct -->
<svg viewBox="0 0 24 24">
  <g transform="rotate(90 12 12)">
    <path d="..."/>
  </g>
</svg>
```

---

## Migration Guidelines

### Priority

1. **TTS icons** — highest duplication (speaker, stop, error appear in 3+ files).
2. **TranslationWindowToolbar** — 4 icons, single file, shared component.
3. **Mobile views** — back chevrons duplicated in 4 files.
4. **DesktopFabMenu** — 4 icons including progress circle.
5. **Remaining singletons** — FieldIcon, FontSelector, PageTranslationButton.

### Process

1. Extract the SVG to `src/icons/ui/` if not already there.
2. Import with `?url` suffix.
3. Replace inline `<svg>` or `<img>` with `<SvgIcon>`.
4. Verify size and color match visually.
5. Verify `aria-hidden` is correctly inherited from SvgIcon default.
6. Remove any now-unused CSS sizing classes.

### What NOT to do

- Do not add `ariaLabel` to icons inside interactive buttons (they are decorative).
- Avoid new inline `<svg>` for reusable monochrome UI icons.
- Do not import monochrome SVGs without `?url`.
- Do not use SvgIcon for brand/multicolor assets.

---

## Existing Technical Debt

| Item | Priority |
|---|---|
| 29 inline SVGs across 14 components | High |
| TTS icons duplicated in 3 components | High |
| 4 identical back chevrons | High |
| `capture.svg` lacks `viewBox` (26.8KB) | High |
| `?url` imports used with `<img>` tags (eye-open, eye-hide) | Medium |
| 14 provider `.svg` files unused (PNG is standard) | Medium |
| `IconButton` component overlap with SvgIcon | Medium |
| SVGRepo metadata in several SVGs | Low |
| `Firefox_Browser_Add-ons_logo.svg` naming inconsistency | Low |

Refer to the ADR in `docs/adr/ADR-SVG-ICON-SYSTEM.md` for the architectural rationale behind these decisions.

# CSS Architecture Guide

## Overview

This document describes the modern, principled CSS architecture implemented in the Translate-It extension. The architecture follows best practices for maintainability, performance, and future-proofing.

## Key Principles

### 1. **Principled CSS Variables**
- Safe SCSS variable interpolation using mixins and functions
- Automatic fallback values for browser compatibility
- Central management of design tokens

### 2. **Modern Layout Methods**
- CSS Grid for complex layouts (TranslationWindow)
- CSS Containment for performance optimization
- Logical properties for internationalization

### 3. **Strategic !important Usage**
- Natural CSS cascade respected where possible
- !important used only when necessary for Shadow DOM isolation
- Prevents external page style interference
- Maintains predictable styling in web page context

## When to use `<style scoped>` vs. Adjacent SCSS

The extension operates in two distinct environments. Your choice of styling method depends entirely on **where** the component will be rendered.

### 1. Content Scripts (Shadow DOM)
**Environment:** UI injected into third-party websites (e.g., Tooltip, FAB, Translation Window).
- **🚫 Internal `<style scoped>` is PROHIBITED:** Styles are injected into the host page's `<head>` and cannot penetrate the Shadow Root.
- **✅ Use Component-Adjacent SCSS:** Create a matching `.scss` file. It will be automatically injected into the Shadow Root via the Glob Pipeline.
- **Requirement:** Must use `!important` for all visual properties.

### 2. Standard UI Pages (Popup, Options, Sidepanel)
**Environment:** Extension-owned pages that render in their own isolated document.
- **✅ Internal `<style scoped>` is ALLOWED:** Since these are standard web pages (not Shadow DOM), Vue's default scoping works perfectly.
- **Optional:** You can still use Adjacent SCSS for consistency, but it's not strictly required here.
- **Requirement:** Standard CSS rules apply (no mandatory `!important`).

### Summary Comparison

| Environment | UI Type | How Styles are Loaded | `main.scss` Import Required? | `!important` Required? |
| :--- | :--- | :--- | :--- | :--- |
| **Content Script** | Shadow DOM | **Automated Glob Injection** | **No** (Automatic) | **Yes (Mandatory)** |
| **Popup** | Standard Page | **Standard Bundle** | **Yes** (Manual) | No |
| **Sidepanel** | Standard Page | **Standard Bundle** | **Yes** (Manual) | No |
| **Options** | Standard Page | **Standard Bundle** | **Yes** (Manual) | No |

---

## Shadow DOM Isolation

### CSS Isolation Strategy
The Translate-It extension renders all UI components in a Shadow DOM. We use a **Robust Automated SCSS Injection Pipeline** to manage styles.

#### 1. Component-Adjacent SCSS (The Standard Pattern)
For every Vue component (e.g., `MyComponent.vue`), a matching SCSS file (e.g., `MyComponent.scss`) must be created in the same directory.

- **Why?** Internal `<style scoped>` blocks in `.vue` files are NOT supported for Shadow DOM components because Vite's string-injection mechanism is fragile with SFC styles.
- **Mechanism:** `src/core/content-scripts/chunks/lazy-vue-app.js` uses a **Whitelist-based** `import.meta.glob` to automatically discover and inject SCSS files from the following performance-safe directories:
  - `@/apps/content/components/**/*.scss` (Core content UI)
  - `@/components/shared/**/*.scss` (Shared reusable components)
  - `@/features/**/components/**/*.scss` (Feature-specific UI)
- **Benefit:** 100% build stability, zero manual registration for content scripts, and prevents bloating the host page with unrelated extension styles.

#### 2. Strategic !important Usage
Inside the Shadow DOM, `!important` is **mandatory** for all visual properties. This prevents host website styles from leaking into the extension or breaking the UI via global resets (like `all: initial`).

---

### Best Practices for Shadow DOM Styling

#### DO ✅
- **Create Matching SCSS Files**: Always create `ComponentName.scss` next to `ComponentName.vue`.
- **Use !important**: Apply it to all visual properties in the SCSS file.
- **Use Design Tokens**: Utilize CSS variables from `_variables.scss` for theming.
- **Use Namespace Classes**: Wrap your SCSS in a component-specific class (e.g., `.ti-my-component { ... }`).

#### DON'T ❌
- **Avoid <style scoped>**: Do not write styles inside `.vue` files for content components; they will not be injected into the Shadow DOM.
- **Avoid Inline Styles**: Minimize the use of `:style` for static visual properties.
- **Manual Registration**: You no longer need to `@use` every component's SCSS in a global file; the system finds them automatically.

---

## Developer Workflow

### Step 1: Create your component
If you create `NewFeature.vue`, also create `NewFeature.scss` in the same folder.

### Step 2: Write your styles
In `NewFeature.scss`, write your styles. 
- **CRITICAL:** Use `!important` for all visual properties if the component will be used in **Shadow DOM**.

### Step 3: Registration (The "Where does it show up?" Rule)
- **If used ONLY in Shadow DOM**:
  - Ensure the component is within a **Whitelisted Directory** (see the *Shadow DOM Isolation* section above).
  - The system will find it automatically. No manual registration required.
- **If used in Popup / Sidepanel / Options**: 
  - You **MUST** manually add `@use "../../path/to/NewFeature";` to `src/assets/styles/main.scss`.
- **Note**: If you create a NEW root directory for UI components that must work in Shadow DOM, you must add it to the whitelist in `lazy-vue-app.js`.

---

## Architecture Components

### SCSS Mixins and Functions

#### 1. CSS Properties Generator
```scss
@mixin css-properties($prefix: 'ti', $properties: ()) {
  @each $name, $value in $properties {
    --#{$prefix}-#{$name}: #{$value};
  }
}
```

**Usage:**
```scss
:root {
  @include css-properties('ti', (
    'window-width': $selection-window-max-width,
    'window-padding': $spacing-md
  ));
}
```

#### 2. Safe CSS Variable Function
```scss
@function css-var($name, $fallback: null) {
  @if $fallback {
    @return var(--ti-#{$name}, #{$fallback});
  } @else {
    @return var(--ti-#{$name});
  }
}
```

**Usage:**
```scss
.component {
  width: #{css-var('window-width', 300px)};
  padding: #{css-var('window-padding', 16px)};
}
```

### Layout Architecture

#### 1. CSS Grid for Complex Components
```scss
.ti-window {
  display: grid;
  grid-template-rows: auto 1fr; // header auto, body flexible
  container-type: inline-size; // Enable container queries
}
```

#### 2. CSS Containment for Performance
```scss
.ti-window-body {
  contain: layout style; // Establish containment
  overflow-x: clip; // Modern way to clip overflow
}
```

#### 3. Logical Properties
```scss
.component {
  inline-size: 300px;           // Instead of width
  margin-inline: 5px;           // Instead of margin-left/right
  padding-block-start: 8px;     // Instead of padding-top
}
```

## File Structure

### Special Entry Points (Content Scripts)

The extension uses specific entry points to manage the boundary between the extension UI and the host website.

#### 1. `content-app-global.scss` (Shadow DOM Root)
- **Role**: Base styles for the extension's UI inside the Shadow DOM.
- **Content**: Shadow Root resets (`:host`), CSS variables, and global utility classes for the extension's components.
- **Injection**: Loaded via `lazy-vue-app.js` and injected directly into the `shadowRoot`.
- **Constraint**: Should NOT contain styles for the host page.

#### 2. `content-main-dom.scss` / `.css` (Host Page Root)
- **Role**: Critical styles that MUST exist in the host page's Main DOM to work.
- **Content**: 
  - Cursor changes (`cursor: crosshair`) when in "Select Element" mode.
  - Element highlighting (Outlines) during selection.
  - Translation direction support for translated text injected into the page.
- **Injection**: Injected into the host page's `<head>` via a `<style>` or `<link>` tag.
- **Constraint**: Keep it minimal to avoid interfering with the host website's layout.

### Core SCSS Files

#### `/src/assets/styles/base/_mixins.scss`
- CSS Properties Generator mixin
- Safe CSS Variable function
- Component-specific mixins (window-dimensions)
- Common utility mixins

#### `/src/assets/styles/base/_variables.scss`
- SCSS variables for compilation
- Theme-specific CSS custom properties
- Design tokens and spacing system

#### `/src/assets/styles/components/_ti-window.scss`
- Modern window component styles
- CSS Grid layout implementation
- Safe variable usage examples

### Documentation Files

#### `/src/assets/styles/README-CSS-VARIABLES.md`
- Best practices guide
- Common pitfalls and solutions
- Future usage patterns

## Design Tokens

### Spacing System
```scss
// SCSS Variables
$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 20px;

// CSS Custom Properties
:root {
  --ti-window-padding: #{$spacing-md};
  --ti-window-body-margin: 5px;
}
```

### Typography
```scss
$font-family-base: "Vazirmatn", "Segoe UI", sans-serif;
$font-size-sm: 12px;
$font-size-base: 14px;
```

### Color System
```scss
:root.theme-light {
  --bg-color: #ffffff;
  --text-color: #202124;
  --border-color: #e0e0e0;
}

:root.theme-dark {
  --bg-color: #202124;
  --text-color: #e8eaed;
  --border-color: #3c4043;
}
```

## Component Implementation

### TranslationWindow Example

#### SCSS Structure
```scss
// 1. CSS Custom Properties Definition
:root {
  @include window-dimensions; // Uses mixin for safe interpolation
}

// 2. Component Base Styles
.ti-window {
  display: grid;
  grid-template-rows: auto 1fr;
  container-type: inline-size;

  // 3. Variant Styles
  &.normal-window {
    width: #{css-var('normal-window-width', 300px)};
    min-height: #{css-var('normal-window-min-height', 120px)};
  }
}

// 4. Child Component Styles
.ti-window-body {
  padding: #{css-var('window-padding', 16px)};
  contain: layout style;
  overflow-x: clip;
}
```

#### Vue Component Integration
```vue
<template>
  <div class="ti-window normal-window" :class="[theme, { visible: isVisible }]">
    <div class="ti-window-header">
      <!-- Header content -->
    </div>
    <div class="ti-window-body">
      <!-- Body content -->
    </div>
  </div>
</template>

<style scoped>
/* Component-specific styles only */
/* Base styles handled by global CSS */
</style>
```

## Performance Optimizations

### 1. CSS Containment
```scss
.component {
  contain: layout style; // Isolate layout calculations
}
```

### 2. Modern Overflow Handling
```scss
.content {
  overflow-x: clip; // Better than hidden
}
```

### 3. Container Queries
```scss
.ti-window {
  container-type: inline-size;
}

@container (min-width: 300px) {
  .content {
    // Responsive styles
  }
}
```

## Migration Patterns

### From SFC Internal Styles
```vue
<!-- ❌ Before (MyComponent.vue) -->
<template><div class="ti-item" /></template>
<style scoped>.ti-item { color: red; }</style>

<!-- ✅ After (MyComponent.vue) -->
<template><div class="ti-item" /></template>
<!-- No style block here -->

<!-- ✅ After (MyComponent.scss in same folder) -->
.ti-item { color: red !important; }
```

### From Legacy Inline JS
```vue
<!-- ❌ Before (Inline Hacks) -->
<template>
  <div :style="`background: ${settingsStore.isDark ? '#222' : '#fff'} !important;`" />
</template>

<!-- ✅ After (Component-Adjacent SCSS) -->
<template>
  <div class="ti-component" />
</template>

/* In MyComponent.scss */
.ti-component {
  background: var(--bg-color, #ffffff) !important;
}
```

## Testing and Validation

### CSS Validation
- ESLint SCSS rules
- Stylelint configuration
- Build-time variable checking

### Browser Testing
- Chrome DevTools CSS debugging
- Firefox CSS Grid inspector
- Cross-browser compatibility testing

### Performance Testing
- CSS containment effectiveness
- Layout recalculation metrics
- Memory usage monitoring

## Best Practices

### DO ✅
- Use CSS Grid for complex layouts
- Implement CSS containment for performance
- Use safe variable functions with fallbacks
- Follow logical properties for i18n
- Establish design token system

### DON'T ❌
- Use !important declarations unnecessarily (only for Shadow DOM isolation)
- Hardcode values in CSS
- Mix SCSS variables directly in CSS properties
- Rely on complex CSS specificity
- Ignore browser compatibility
- Apply aggressive CSS resets that break component functionality

## Future Roadmap

### Planned Improvements
- [ ] Enhanced container query usage
- [ ] Advanced CSS custom property types
- [ ] CSS Houdini integration
- [ ] Performance monitoring integration

### Experimental Features
- [ ] CSS @layer support
- [ ] Advanced CSS math functions
- [ ] CSS color-mix() implementation

## Troubleshooting

### Common Issues

#### 1. Undefined CSS Variables
**Problem:** `var(--ti-variable)` returns undefined
**Solution:** Use safe function with fallback
```scss
// Use this
width: #{css-var('variable', 300px)};

// Instead of this
width: var(--ti-variable);
```

#### 2. SCSS Variable Interpolation
**Problem:** `--var: #{$undefined}` causes compile error
**Solution:** Use css-properties mixin
```scss
// Use this
@include css-properties('ti', (
  'var': $scss-variable
));

// Instead of this
--ti-var: #{$scss-variable};
```

## Conclusion

The modern CSS architecture provides a solid foundation for maintainable, performant, and future-proof styling. By following these patterns and using the provided tools, developers can avoid common CSS pitfalls and build robust UI components.

---

*Last Update: March 2026*
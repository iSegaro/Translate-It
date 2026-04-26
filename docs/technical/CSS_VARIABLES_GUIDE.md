# CSS Variables & Design Tokens Guide

This document explains the "Safe CSS Variable System" used in Translate-It. It ensures type safety, provides reliable fallbacks, and manages design tokens effectively across Shadow DOM boundaries.

## The Problem and The Solution

### ❌ The Legacy Problem (Fragile)
```scss
:root {
  --ti-window-width: #{$scss-variable}; // Fails if $scss-variable is undefined or null
}

.component {
  width: var(--ti-window-width); // No fallback if the variable fails to load
}
```

### ✅ The Robust Solution (Safe System)
We use a combination of SCSS Mixins and Functions to guarantee stability.

---

## 1. Defining Variables Safely (`css-properties` Mixin)
Instead of manual assignment, use the `@mixin css-properties`. It iterates through a map and ensures proper prefixing and value interpolation.

```scss
@mixin css-properties($prefix: 'ti', $properties: ()) {
  @each $name, $value in $properties {
    --#{$prefix}-#{$name}: #{$value};
  }
}
```

**Usage Example:**
```scss
:root {
  @include css-properties('ti', (
    'window-width': $selection-window-max-width,
    'window-padding': $spacing-md
  ));
}
```

---

## 2. Consuming Variables Safely (`css-var` Function)
Never use `var()` directly for project tokens. Use the `css-var()` function to ensure a mandatory fallback value is provided.

```scss
@function css-var($name, $fallback: null) {
  @if $fallback {
    @return var(--ti-#{$name}, #{$fallback});
  } @else {
    @return var(--ti-#{$name});
  }
}
```

**Usage Example:**
```scss
.ti-component {
  width: #{css-var('window-width', 300px)};
  padding: #{css-var('window-padding', 16px)};
}
```

---

## Key Benefits

1. **Type Safety**: SCSS will throw a compile-time error if a referenced SCSS variable doesn't exist.
2. **Fallback Guarantee**: The function pattern encourages/enforces providing a fallback, ensuring the UI doesn't "break" if a CSS variable isn't injected.
3. **Maintainability**: Centralizing tokens in a map makes it easier to change themes or spacing globally.
4. **Shadow DOM Compatibility**: This pattern is essential for bridging JS-calculated values (like coordinates) with SCSS in a Shadow DOM environment.

---

## Future-Proofing New Components

When creating a new complex component, follow this pattern:

```scss
// 1. Define specific vars in a mixin (inside your component SCSS or a shared file)
@mixin new-component-vars {
  @include css-properties('ti', (
    'component-width': $component-width,
    'component-height': $component-height
  ));
}

// 2. Apply to root
:root {
  @include new-component-vars;
}

// 3. Use safely
.ti-new-component {
  width: #{css-var('component-width', 200px)};
  height: #{css-var('component-height', 100px)};
}
```

---
*Last Update: April 2026*

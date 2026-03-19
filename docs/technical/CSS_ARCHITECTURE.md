# CSS Architecture Guide (2025)

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

## Shadow DOM Isolation

### CSS Isolation Strategy
The Translate-It extension renders all UI components in a Shadow DOM to prevent style conflicts with host pages. This requires special CSS considerations:

#### 1. **Minimal Reset Approach**
```scss
:host {
  display: block !important;
  position: fixed !important;
  direction: ltr !important;
  text-align: left !important;
}
```

#### 2. **Component-Specific Direction**
- WindowsManager containers (header, window frame) are forced LTR
- TranslationDisplay maintains dynamic direction based on content
- All interactive components use LTR for consistent UI

#### 3. **Selective !important Usage**
```scss
.ti-field-icon {
  /* Essential properties need !important for Shadow DOM */
  position: fixed !important;
  pointer-events: all !important;
  z-index: 2147483647 !important;

  /* Non-essential properties follow natural cascade */
  transition: all 0.25s ease;
}
```

### Best Practices for Shadow DOM Styling

#### DO ✅
- Use !important for positioning and z-index in Shadow DOM
- Force LTR on UI containers but keep content dynamic
- Test on pages with aggressive CSS resets
- Use `unicode-bidi: plaintext` for proper text direction

#### DON'T ❌
- Apply global resets with `all: initial/unset`
- Override text direction in translation content
- Neglect cross-browser Shadow DOM behavior

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

### From Legacy CSS
```scss
// ❌ Before
.component {
  width: 300px !important;
  background: #fff !important;
}

// ✅ After
.component {
  width: #{css-var('component-width', 300px)};
  background: var(--bg-color, #ffffff);
}
```

### From Hardcoded Values
```scss
// ❌ Before
:root {
  --ti-width: #{$undefined-variable}; // Potential runtime error
}

// ✅ After
:root {
  @include css-properties('ti', (
    'width': $safe-variable // Compile-time safety
  ));
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

*Last Updated: 2025-09-16*
*Next Review: 2025-12-16*
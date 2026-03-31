# Solution: CSS Class & Shadow DOM Injection Guide (Final Automated Version)

## Executive Summary
The styling issues in this project originated from **Shadow DOM Isolation**. We have now implemented a **Robust Automated SCSS Injection Pipeline** that automatically discovers and injects all component styles into the Shadow DOM without breaking the build process.

## The Final Solution: Component-Adjacent SCSS
We have moved away from internal `<style scoped>` blocks (which caused build errors in Shadow DOM strings) to a "Component-Adjacent SCSS" pattern.

### 1. The Pattern
For every Vue component (e.g., `MyComponent.vue`), we create a matching SCSS file (e.g., `MyComponent.scss`) in the same folder.
- **Vue file**: Contains template and logic.
- **SCSS file**: Contains all visual styles (with `!important`).

### 2. Build-Time Discovery (Automated Glob)
In `src/core/content-scripts/chunks/lazy-vue-app.js`, we use Vite's `import.meta.glob` to automatically find all these files:
```javascript
const standaloneStyles = import.meta.glob([
  '@/apps/content/**/*.scss',
  '@/components/**/*.scss',
  '@/features/**/*.scss',
  '!**/_*.scss'
], { query: '?inline', import: 'default', eager: true });
```
This tells Vite to eagerly collect every SCSS file in the content/component folders and provide them as raw strings.

### 3. Safe Global Reset
The `:host` in `content-app-global.scss` is configured with `pointer-events: none !important` to ensure the extension never blocks clicks on the host website. Interactive UI elements explicitly enable `pointer-events: auto !important`.

---

## Developer Workflow (Standard for this Project)

### Step 1: Create your component
If you create `NewFeature.vue`, also create `NewFeature.scss` in the same folder.

### Step 2: Write your styles
In `NewFeature.scss`, write your styles. They will be **automatically** picked up by the build system.
```scss
.ti-new-feature {
  background: var(--ti-mobile-bg, #fff) !important;
  /* Use !important for all visual properties */
}
```

### Step 3: Use Design Tokens
Always use the CSS variables (Design Tokens) defined in the project.

---

## Why this is the "Best" Approach?
1.  **Zero Manual Registration**: No need to `@use` or `@import` files manually.
2.  **100% Build Stability**: Avoids "Unexpected /" errors common with SFC style extraction in strings.
3.  **Clean Separation**: Better organization of styles and logic.
4.  **No Click Blocking**: Safe Shadow DOM interaction with the host page.

**Status**: Fully Automated & Production Ready (March 2026).

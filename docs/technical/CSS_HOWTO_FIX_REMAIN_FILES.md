# Instruction: CSS Refactoring & Technical Debt Cleanup (Final)

## Objective
Refactor all legacy "CSS hacks" into the **"Component-Adjacent SCSS"** pattern.

**Goal:** Move styles from JS/Inline/SFC strings into dedicated `.scss` files that are automatically discovered by the build system.

---

## The Final Architecture: "Component-Adjacent SCSS"
Vite and Shadow DOM have specific constraints in this project. We have settled on the most robust solution:
- All component styles must be in a dedicated `.scss` file next to the `.vue` file.
- Example: `MyComponent.vue` + `MyComponent.scss`.
- These files are automatically collected by `lazy-vue-app.js` via Glob Import.

---

## Investigation Strategy (How to find debt)

Search for the following patterns to identify modules needing refactoring:

1.  **Search for large `:style` bindings:**
    Look for components where the `:style` binding handles more than just `transform`, `top`, or `left`.

2.  **Search for `!important` inside JS strings:**
    `grep -r "!important" src/apps/content/components/`
    *(Any JS file with CSS-like strings is a target).*

3.  **Search for Vue SFC Internal Styles:**
    Check for components with `<style scoped>` blocks. They should be moved to adjacent `.scss` files to avoid build fragility.

---

## Refactoring Workflow (The "Fix")

For every identified component, follow this workflow:

### Step 1: Create Adjacent SCSS
If the component is `MyComponent.vue`, create `MyComponent.scss` in the same folder.

### Step 2: Extract Styles
- Move all static visual styles from JS/Template into the new `.scss` file.
- Use the class name from the component (e.g., `.ti-my-component`).
- **CRITICAL:** Add `!important` to all visual properties in the SCSS file for Shadow DOM stability.

### Step 3: Use Design Tokens
Always use project variables where possible: `var(--ti-mobile-bg, #ffffff)`.

### Step 4: Cleanup Template & Script
- Remove large computed style objects from JS.
- Simplify the `:style` binding to only handle truly dynamic coordinates.
- Remove unnecessary reactive variables used only for styling.


---

## Safety Rules
- **Do not break coordinates:** Always keep `top`, `left`, `transform`, and `z-index` (if dynamic) in the `:style` binding.
- **Maintain logic:** Ensure that `v-if` and `v-show` conditions remain intact.
- **Verify RTL:** Ensure `[dir='rtl']` rules are preserved.

**Status**: Ready for Refactoring (Final Pattern).

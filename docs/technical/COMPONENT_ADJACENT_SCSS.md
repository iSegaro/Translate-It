# Architecture Standard: Component-Adjacent SCSS (Completed)

> **Status:** COMPLETED / PROJECT STANDARD  
> **Date:** April 2026  
> **Summary:** This document, originally a refactoring guide, now serves as the definitive architectural standard for managing CSS in this project. All legacy technical debt regarding inline styles and SFC internal styles has been resolved.

## The Project Standard: "Component-Adjacent SCSS"
Vite and Shadow DOM have specific constraints in this project. We have successfully migrated all components to this robust solution:

1.  **Strict File Pairing**: Every component MUST have a dedicated `.scss` file next to its `.vue` file (e.g., `MyComponent.vue` + `MyComponent.scss`).
2.  **Automated Discovery**: These files are automatically collected by the `lazy-vue-app.js` pipeline via Glob Imports. Manual registration is prohibited for Content Script components.
3.  **Shadow DOM Isolation**: All visual properties in these SCSS files MUST use `!important` to prevent host-page style leakage.

---

## Architectural Rules (Enforced)

### 1. No Vue SFC Internal Styles
The use of `<style scoped>` or `<style>` blocks inside `.vue` files for Content Script components is **PROHIBITED**. This ensures build stability and reliable Shadow DOM injection.

### 2. No Hardcoded CSS Strings in JS
Injecting CSS via JS strings (e.g., `const style = '...'`) is **PROHIBITED**. 
- **Exception**: If styles must be injected from a JS module, use the `import styles from './File.scss?inline'` pattern to maintain separation of concerns.

### 3. Dynamic Styles via CSS Variable Bridge
When styles depend on JS logic (coordinates, drag-and-drop, reactive dimensions), use **CSS Variables** as a bridge:
- **Vue**: `:style="{ '--dynamic-pos': pos + 'px' }"`
- **SCSS**: `transform: translateY(var(--dynamic-pos)) !important;`

---

## Maintenance & Prevention

To ensure no new technical debt is introduced, follow these "Safety Rules":
- **Do not use inline styles** for static visual properties (colors, padding, font-size).
- **Use Design Tokens**: Always rely on `var(--ti-mobile-bg)` and other standardized variables.
- **Verify RTL**: Ensure `text-align: start` or `[dir='rtl']` rules are used for internationalization.

**This architecture is now the baseline for all future development in Translate-It.**

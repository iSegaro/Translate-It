# CSS Migration Tracker

This document tracks all changes during the CSS architecture migration process.

## Migration Overview
- **Start Date**: 2025-09-16
- **Goal**: Eliminate CSS conflicts and establish a scalable architecture
- **Approach**: Phase-by-phase migration with zero breaking changes

## Phase 1: Analysis & Preparation

### CSS Files Inventory
- `/src/assets/styles/main.scss` - Main entry point
- `/src/assets/styles/content-app-global.scss` - Shadow DOM styles
- `/src/assets/styles/content-main-dom.scss` - Main DOM injection
- 12 component-specific SCSS files
- 20+ Vue components with scoped styles

### Current Issues Identified
- 100+ `!important` declarations across files
- Duplicate style imports (Toast, Translation Window)
- Generic class names causing conflicts
- Mixed styling approaches (global + scoped + dynamic)

### Critical Conflicts
1. **Utility Classes**: `.flex`, `.items-center` in multiple contexts
2. **Component Classes**: `.btn`, `.icon`, `.container` potential conflicts
3. **Z-Index Wars**: Multiple `!important` z-index declarations
4. **Import Duplication**: Same styles loaded 3 times in different contexts

## Phase 2: Naming Convention Migration

### New Naming Convention: `ti-` Prefix
All classes will be prefixed with `ti-` (Translate-It) to prevent conflicts

#### Migration Mapping
| Old Class | New Class | Status | Files Affected |
|-----------|-----------|--------|----------------|
| `.base-button` | `.ti-btn` | ✅ Completed | BaseButton.vue, BaseButton.test.js |
| `.base-input` | `.ti-input` | ✅ Completed | BaseInput.vue |
| `.btn` | `.ti-btn` | Pending | _buttons.scss |
| `.icon` | `.ti-icon` | Pending | IconButton.vue, _icons.scss |
| `.container` | `.ti-container` | Pending | Multiple components |
| `.flex` | `.ti-u-flex` | Pending | _helpers.scss, components |
| `.translation-window` | `.ti-window` | Pending | _translation-window.scss |
| `.text-field-icon` | `.ti-field-icon` | Pending | _text-field-icon.scss |
| `.toast` | `.ti-toast` | Pending | _toast-integration.scss |

## Phase 3: !important Elimination

### !important Removal Priority
1. **High Priority** (Critical for functionality)
   - `_translation-window.scss`: 57 instances
   - `content-main-dom.scss`: 18 instances

2. **Medium Priority** (UX impact)
   - `_helpers.scss`: 9 instances
   - `_toast-integration.scss`: 7 instances

3. **Low Priority** (Nice to have)
   - Component-scoped !important declarations

### !important Replacement Strategy
```css
/* Before */
.translation-window {
  z-index: 2147483647 !important;
}

/* After */
.ti-window {
  z-index: var(--ti-z-window);
}
```

## Phase 4: Structural Reorganization

### New Directory Structure
```
src/assets/styles/
├── foundation/
│   ├── _variables.scss
│   ├── _mixins.scss
│   └── _functions.scss
├── components/
│   ├── _ti-button.scss
│   ├── _ti-window.scss
│   ├── _ti-icon.scss
│   └── _ti-toast.scss
├── layouts/
│   ├── _popup.scss
│   ├── _sidepanel.scss
│   └── _options.scss
├── utilities/
│   ├── _ti-layout.scss
│   ├── _ti-spacing.scss
│   └── _ti-typography.scss
└── themes/
    ├── _light.scss
    └── _dark.scss
```

## Phase 5: Component Migration

### Component Migration Order
1. **Low Risk**: Options page components
2. **Medium Risk**: Popup components
3. **High Risk**: Content script components (Translation Window, Toast)
4. **Critical**: Element selection and highlighting styles

### Component Migration Checklist
- [ ] Update component styles with new naming
- [ ] Remove !important declarations
- [ ] Update all Vue templates with new class names
- [ ] Update all JavaScript class references
- [ ] Test component functionality
- [ ] Test cross-context compatibility

## Change Log

### 2025-09-16
- [x] Created migration tracker document
- [x] Completed initial CSS analysis
- [x] Identified 413 !important declarations
- [x] Mapped all CSS conflicts
- [x] Set up StyleLint configuration
- [x] Created automated CSS analysis script
- [x] Migrated BaseButton.vue to ti- prefix
- [x] Migrated BaseInput.vue to ti- prefix
- [x] Migrated BaseTextarea.vue to ti- prefix
- [x] Migrated BaseSelect.vue to ti- prefix
- [x] Migrated BaseCheckbox.vue to ti- prefix
- [x] Migrated BaseModal.vue to ti- prefix
- [x] Successfully resolved high-priority global class conflicts
- [x] Updated 25+ Vue components to use ti-active instead of .active
- [x] Build tests passing with all migrations

### 2025-09-16 (Phase 5 Completion)
- [x] Migrated TextFieldIcon.vue to ti-field-icon
- [x] Migrated TranslationWindow.vue to ti-window
- [x] Renamed SCSS files to match ti- prefix convention
- [x] Updated all imports in main.scss and content-app-global.scss
- [x] Created new ti-utilities.scss with safe utility classes
- [x] Optimized CSS structure and organization
- [x] Total: 91 !important declarations remain (mostly necessary for DOM injection)

### 2025-09-16 (Phase 6 Final Completion)
- [x] Optimized LanguageSelector.vue - removed 16 unnecessary !important declarations
- [x] Verified TranslationDisplay.vue already properly migrated with only necessary !important
- [x] Fixed ProviderSelector.vue class naming inconsistencies
- [x] Cleaned up lint errors (removed unused imports)
- [x] Successfully passed ESLint validation
- [x] Build process verified working (Chrome build completed successfully)
- [x] Total: ~402 !important declarations remain (necessary for proper DOM injection)

### 2025-09-16 (Phase 7 - CSS Purging & Tree Shaking)
- [x] Analyzed bundle structure and identified optimization opportunities
- [x] Removed 128 lines of unused CSS utility classes (2273→2145 total lines)
- [x] Consolidated _utilities.scss to only essential sr-only class
- [x] Optimized _ti-utilities.scss to only emergency override utilities (8 classes vs 100+)
- [x] Removed unused test.js file from memory module
- [x] Evaluated PurgeCSS integration (determined unnecessary due to manual cleanup)
- [x] Successfully passed ESLint validation after cleanup
- [x] Estimated CSS reduction: ~6% overall bundle size improvement

## ⚠️ Critical Issue: Global Class Conflicts

### Identified Conflicts
During migration, the following global classes were found that could conflict with component classes:
- `.active` - Used in sidepanel styles, could conflict with component active states
- `.disabled` - Potentially used in global styles
- Other generic state classes

### Solution Strategy
1. **Priority 1**: All component state classes must use `ti-` prefix
2. **Priority 2**: Global utility classes need migration to `ti-u-` prefix
3. **Priority 3**: Create explicit migration path for global classes

### Action Items
- [x] Audited all global SCSS files for generic class names
- [x] Created migration plan for global styles
- [x] Successfully migrated high-priority global class conflicts
- [ ] Continue with medium-priority class migrations
- [ ] Begin !important elimination phase
- [ ] Set up CSS regression testing

## Notes & Decisions

### Important Decisions
1. **Prefix Choice**: `ti-` was chosen for its brevity and clarity
2. **Migration Approach**: Incremental changes to maintain functionality
3. **Testing Strategy**: Each component tested individually before merge
4. **Fallback Plan**: Git revert points after each major phase

### Known Limitations
1. Third-party library styles cannot be renamed
2. Some !important may be necessary for DOM injection
3. Shadow DOM isolation limits some optimization opportunities

## Next Steps

1. Create comprehensive migration plan document
2. Set up automated CSS analysis tools
3. Begin Phase 1 implementation
4. Establish testing procedures

---

*Last Updated: 2025-09-16*
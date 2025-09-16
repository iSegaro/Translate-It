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
| `.btn` | `.ti-btn` | Pending | BaseButton.vue, _buttons.scss |
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
- [ ] Created migration tracker document
- [ ] Completed initial CSS analysis
- [ ] Identified 100+ !important declarations
- [ ] Mapped all CSS conflicts

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
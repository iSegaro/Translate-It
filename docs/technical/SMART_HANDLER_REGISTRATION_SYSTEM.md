# Smart Handler Registration System

## Overview
The **Smart Handler Registration System** is a feature-based exclusion system that provides dynamic handler lifecycle management with real-time settings updates. Unlike traditional systems that register all handlers and check exclusions at runtime, this system only registers handlers when they are actually needed based on feature settings and URL exclusions.

## Key Features
- **Centralized Event Monitoring** - Uses `InteractionCoordinator` to manage global listeners efficiently.
- **Dynamic Activation/Deactivation** - Features activate/deactivate without requiring page refresh.
- **On-Demand Loading (Lazy)** - Heavy feature code is only loaded when a trigger (click/shortcut) occurs.
- **Forced Utility Loading** - Allows loading core logic (like Revert/ESC) even if the main feature is disabled.
- **Memory-Efficient** - Only active handlers and required listeners consume resources.

---

## Architecture Components

### 1. InteractionCoordinator (`src/core/content-scripts/InteractionCoordinator.js`)
The **InteractionCoordinator** acts as the system's "Gatekeeper." It manages lightweight global listeners (`mouseup`, `keydown`, `contextmenu`) and decides when to trigger the full loading of a feature.

```javascript
class InteractionCoordinator {
  async sync() {
    const isEnabled = settingsManager.isExtensionEnabled() && !this.isPageExcluded;

    // 1. Text Selection Listener
    const canSelect = isEnabled && this.exclusionChecker.isFeatureEnabled('textSelection');
    this._manageListener('textSelection', 'mouseup', this.handlers.textSelection, canSelect);

    // 2. Keyboard (Shortcut OR Revert/ESC needed)
    const canShortcut = isEnabled && (this.exclusionChecker.isFeatureEnabled('shortcut') || this.revertMightBeNeeded);
    this._manageListener('shortcut', 'keydown', this.handlers.shortcut, canShortcut, window);
  }
}
```

**Key Responsibilities:**
- Monitors `revertMightBeNeeded` flag to keep Escape key active after a translation.
- Listens for `select-mode-activated` to prioritize ESC monitoring.
- Triggers `lazy-features.js` for actual code loading.

### 2. Lazy Feature Loader (`src/core/content-scripts/chunks/lazy-features.js`)
Handles the dynamic `import()` of feature modules. It now supports a **force** parameter to bypass setting-based exclusion for critical utility operations.

```javascript
export async function loadFeature(featureName, force = false) {
  // ...
  switch (featureName) {
    case 'shortcut':
      return await loadShortcutFeature(force); // force=true allows loading Revert logic even if shortcut is OFF
  }
}
```

### 3. FeatureManager (`src/core/managers/content/FeatureManager.js`)
Central orchestrator for feature lifecycle. It ensures that when a feature is deactivated, all its resources (DOM elements, listeners) are cleaned up and the lazy-loading cache is invalidated.

```javascript
async deactivateFeature(featureName) {
  const handler = this.featureHandlers.get(featureName);
  if (handler) {
    await handler.deactivate();
    this.featureHandlers.delete(featureName);
    
    // Invalidate lazy cache
    const { notifyFeatureDeactivated } = await import('./chunks/lazy-features.js');
    notifyFeatureDeactivated(featureName);
  }
}
```

---

## Content Script Integration

The main content script (`src/core/content-scripts/index-main.js`) is now extremely lean, delegating all listener management to the Coordinator:

```javascript
// index-main.js
const { interactionCoordinator } = await import('./InteractionCoordinator.js');
await interactionCoordinator.initialize();
```

---

## Feature Lifecycle & Exclusion Mapping

### URL & Setting Mapping
| Feature | Setting | Exclusion Rule | Trigger Event |
| :--- | :--- | :--- | :--- |
| `selectElement` | `TRANSLATE_WITH_SELECT_ELEMENT` | `ELEMENT_SELECTION_EXCLUDED_SITES` | `contextmenu` / FAB Click |
| `textSelection` | `TRANSLATE_ON_TEXT_SELECTION` | `TRANSLATE_EXCLUDED_SITES` | `mouseup` (Selection) |
| `textFieldIcon` | `ENABLE_SHORTCUT_FOR_TEXT_FIELDS` | `TEXT_FIELD_EXCLUDED_SITES` | `focusin` |
| `shortcut` | `TRANSLATE_ON_TEXT_SELECTION` | `TRANSLATE_EXCLUDED_SITES` | `keydown` (Ctrl+/) |

### Special Case: Revert (ESC)
The Revert functionality is unique because it must work even if the user has disabled shortcuts.
1. `SelectElementManager` or `ShortcutHandler` emits `ELEMENT_TRANSLATIONS_AVAILABLE`.
2. `InteractionCoordinator` sets `revertMightBeNeeded = true`.
3. Even if `shortcut` is disabled, `InteractionCoordinator` keeps the `keydown` listener active.
4. On `Escape`, it calls `loadFeature('shortcut', true)` (Forced Load).

---

## Benefits
1. **Zero Impact on Startup** - No heavy features are loaded until the user actually interacts with the page.
2. **Robustness** - The system recovers from settings changes in real-time by re-syncing the Coordinator.
3. **Clean Architecture** - Separation between "Event Detection" (Coordinator) and "Business Logic" (Handlers).
4. **Reliable Revert** - User can always undo translations regardless of their current shortcut settings.

---

**Last Updated**: April 2026

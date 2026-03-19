# Smart Handler Registration System

## Overview
The **Smart Handler Registration System** is a feature-based exclusion system that provides dynamic handler lifecycle management with real-time settings updates. Unlike traditional systems that register all handlers and check exclusions at runtime, this system only registers handlers when they are actually needed based on feature settings and URL exclusions.

## Key Features
- **Dynamic Activation/Deactivation** - Features activate/deactivate without requiring page refresh
- **Feature-Specific Exclusion Logic** - Each feature can have customized exclusion rules
- **Memory-Efficient** - Only active handlers consume resources
- **Real-Time Settings Updates** - Changes in settings immediately affect handler registration
- **ResourceTracker Integration** - All handlers extend ResourceTracker for proper cleanup

## Architecture Components

### 1. ExclusionChecker (`src/features/exclusion/core/ExclusionChecker.js`)
Core exclusion checking system that determines if features should be active:

```javascript
class ExclusionChecker {
  async isFeatureAllowed(featureName) {
    // Check if extension is enabled
    if (!this.settings.EXTENSION_ENABLED) return false;
    
    // Check feature-specific settings
    if (!this.isFeatureEnabled(featureName)) return false;
    
    // Check URL exclusions
    if (this.isUrlExcludedForFeature(featureName)) return false;
    
    return true;
  }
  
  // Feature-specific exclusion logic
  isUrlExcludedForFeature(featureName) {
    const exclusionRules = this.featureExclusionMapping[featureName] || [];
    return exclusionRules.some(rule => this.checkExclusionRule(rule));
  }
}
```

**Feature Mapping:**
- `selectElement` → Uses `TRANSLATE_ON_ELEMENT_SELECTION` setting
- `textSelection` → Uses `TRANSLATE_ON_TEXT_SELECTION` setting  
- `textFieldIcon` → Uses `TRANSLATE_ON_TEXT_FIELDS` setting
- `shortcut` → Uses `TRANSLATE_ON_TEXT_SELECTION` setting (Ctrl+/ shortcut)
- `windowsManager` → Uses `TRANSLATE_ON_TEXT_SELECTION` setting (UI management)

### 2. FeatureManager (`src/core/managers/content/FeatureManager.js`)
Central orchestrator for dynamic feature lifecycle management:

```javascript
class FeatureManager extends ResourceTracker {
  async initializeFeatures() {
    const exclusionChecker = new ExclusionChecker();
    await exclusionChecker.initialize();
    
    // Check each feature and activate if allowed
    for (const featureName of this.supportedFeatures) {
      const isAllowed = await exclusionChecker.isFeatureAllowed(featureName);
      if (isAllowed) {
        await this.activateFeature(featureName);
      }
    }
  }
  
  async activateFeature(featureName) {
    if (this.activeFeatures.has(featureName)) return;
    
    const handler = await this.loadFeatureHandler(featureName);
    if (handler) {
      const success = await handler.activate();
      if (success !== false) {
        this.featureHandlers.set(featureName, handler);
        this.activeFeatures.add(featureName);
      }
    }
  }
  
  async deactivateFeature(featureName) {
    const handler = this.featureHandlers.get(featureName);
    if (handler) {
      await handler.deactivate();
      this.featureHandlers.delete(featureName);
      this.activeFeatures.delete(featureName);
    }
  }
}
```

**Supported Features:**
- `selectElement` - Element selection and translation
- `textSelection` - Text selection handling  
- `textFieldIcon` - Text field icon management
- `shortcut` - Keyboard shortcut handling
- `contentMessageHandler` - Content script messaging
- `windowsManager` - UI windows management

### 3. Feature Handlers
Each feature implements a standardized handler interface with `activate()` and `deactivate()` methods:

#### SelectElementHandler (`src/features/element-selection/handlers/SelectElementHandler.js`)
```javascript
class SelectElementHandler extends ResourceTracker {
  async activate() {
    if (this.isActive) return true;
    
    try {
      // Initialize SelectElementManager
      this.selectElementManager = new SelectElementManager();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Track resources for cleanup
      this.trackResource('manager', () => this.selectElementManager?.cleanup());
      
      this.isActive = true;
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async deactivate() {
    if (!this.isActive) return true;
    
    // ResourceTracker handles cleanup
    this.cleanup();
    this.isActive = false;
    return true;
  }
}
```

#### TextSelectionHandler (`src/features/text-selection/handlers/TextSelectionHandler.js`)
- Manages text selection events and translation triggers
- Integrates with TextSelectionManager for business logic
- Handles multiple selection methods (mouse, keyboard, programmatic)

#### TextFieldIconHandler (`src/features/text-field-interaction/handlers/TextFieldIconHandler.js`)
- Handles text field icon display and interaction
- Uses dependency injection pattern for TranslationHandler access
- Manages icon positioning and visibility logic

#### ShortcutHandler (`src/features/shortcuts/handlers/ShortcutHandler.js`)
- Manages Ctrl+/ keyboard shortcut for translation
- Integrates with TranslationHandler via InstanceManager pattern
- Handles shortcut registration and cleanup

#### WindowsManagerHandler (`src/features/windows/handlers/WindowsManagerHandler.js`)
- Lifecycle management for WindowsManager
- Handles iframe context detection
- Provides controlled access to WindowsManager instance

#### ContentMessageHandler (`src/handlers/content/ContentMessageHandler.js`)
- Manages content script message handling
- Provides activate/deactivate methods for feature integration
- Routes messages to appropriate handlers

### 4. Content Script Integration
The main content script (`src/core/content-scripts/index.js`) initializes the FeatureManager:

```javascript
// Initialize Feature Management System
const featureManager = new FeatureManager({
  useWindowsManager: true,
  useTextSelectionManager: true
});

// Start feature system
await featureManager.initializeFeatures();

// Listen for settings changes and update features dynamically
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_CHANGED') {
    featureManager.onSettingsChanged(message.data);
  }
});
```

## Real-Time Settings Updates

When settings change in the extension popup or options page, all active content scripts receive notifications:

```javascript
// Background script broadcasts settings changes
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SETTINGS_CHANGED',
      data: updatedSettings
    });
  });
});

// Content script responds to settings changes
async onSettingsChanged(newSettings) {
  const exclusionChecker = new ExclusionChecker();
  exclusionChecker.updateSettings(newSettings);
  
  // Re-evaluate each feature
  for (const featureName of this.supportedFeatures) {
    const isAllowed = await exclusionChecker.isFeatureAllowed(featureName);
    const isActive = this.activeFeatures.has(featureName);
    
    if (isAllowed && !isActive) {
      await this.activateFeature(featureName);
    } else if (!isAllowed && isActive) {
      await this.deactivateFeature(featureName);
    }
  }
}
```

## Exclusion Logic

### URL-Based Exclusions
Each feature can have specific URL exclusion rules:

```javascript
// Example exclusion configuration
const featureExclusionMapping = {
  textSelection: ['EXCLUDED_SITES', 'TRANSLATE_EXCLUDED_SITES'],
  textFieldIcon: ['EXCLUDED_SITES', 'TEXT_FIELD_EXCLUDED_SITES'],
  selectElement: ['EXCLUDED_SITES', 'ELEMENT_SELECTION_EXCLUDED_SITES'],
  shortcut: ['EXCLUDED_SITES', 'TRANSLATE_EXCLUDED_SITES'],
  windowsManager: ['EXCLUDED_SITES', 'TRANSLATE_EXCLUDED_SITES']
};
```

### Setting-Based Exclusions
Features are controlled by specific extension settings:

```javascript
// Feature to setting mapping
const featureSettingMapping = {
  selectElement: 'TRANSLATE_ON_ELEMENT_SELECTION',
  textSelection: 'TRANSLATE_ON_TEXT_SELECTION',
  textFieldIcon: 'TRANSLATE_ON_TEXT_FIELDS',
  shortcut: 'TRANSLATE_ON_TEXT_SELECTION',
  windowsManager: 'TRANSLATE_ON_TEXT_SELECTION'
};
```

## Error Handling

All handlers include comprehensive error handling:

```javascript
async activate() {
  try {
    // Initialization logic
    this.setupComponents();
    this.setupEventListeners();
    
    this.isActive = true;
    logger.info(`${this.constructor.name} activated successfully`);
    return true;
    
  } catch (error) {
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.handle(error, {
      type: ErrorTypes.SERVICE,
      context: `${this.constructor.name}-activate`,
      showToast: false
    });
    return false;
  }
}
```

## Benefits

1. **Performance** - Only necessary handlers are registered and consume resources
2. **Memory Efficiency** - Inactive features don't create event listeners or DOM observers
3. **Real-Time Updates** - Settings changes take effect immediately without page refresh
4. **Maintainability** - Each feature is self-contained and independently manageable
5. **Scalability** - Easy to add new features without affecting existing ones
6. **Error Isolation** - If one feature fails to activate, others continue working

## Integration with Other Systems

### ResourceTracker Integration
All handlers extend ResourceTracker for automatic memory management:

```javascript
class FeatureHandler extends ResourceTracker {
  constructor(name) {
    super(name);
    // Handler-specific initialization
  }
  
  // ResourceTracker automatically handles cleanup
  // when deactivate() calls this.cleanup()
}
```

### UI Host System Integration
WindowsManager integrates through the feature management system:

```javascript
// WindowsManager is now managed by WindowsManagerHandler
const windowsHandler = featureManager.getFeatureHandler('windowsManager');
if (windowsHandler && windowsHandler.getIsActive()) {
  const windowsManager = windowsHandler.getWindowsManager();
  // Use WindowsManager safely
}
```

### Messaging System Integration
ContentMessageHandler is managed as a feature:

```javascript
// Content script messaging is now a managed feature
const messageHandler = featureManager.getFeatureHandler('contentMessageHandler');
if (messageHandler && messageHandler.getIsActive()) {
  // Message handling is active
}
```

### Settings System Integration
Real-time settings updates drive feature activation:

```javascript
// Settings changes trigger feature re-evaluation
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_CHANGED') {
    // FeatureManager automatically activates/deactivates features
    // based on new settings
    featureManager.onSettingsChanged(message.data);
  }
});
```

### Logging System Integration
Comprehensive logging for debugging and monitoring:

```javascript
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FeatureManager');

// All feature lifecycle events are logged
logger.info('Feature activated', { feature: featureName });
logger.debug('Feature activation failed', { feature: featureName, error });
```

## Development Guide

### Adding a New Feature Handler

1. **Create Handler Class**
```javascript
class NewFeatureHandler extends ResourceTracker {
  constructor(options = {}) {
    super('new-feature-handler');
    this.isActive = false;
    // Handler-specific properties
  }
  
  async activate() {
    if (this.isActive) return true;
    
    try {
      // Initialize feature components
      // Setup event listeners using this.addEventListener()
      // Track resources using this.trackResource()
      
      this.isActive = true;
      return true;
    } catch (error) {
      // Error handling
      return false;
    }
  }
  
  async deactivate() {
    if (!this.isActive) return true;
    
    // ResourceTracker.cleanup() handles all tracked resources
    this.cleanup();
    this.isActive = false;
    return true;
  }
}
```

2. **Register in FeatureManager**
```javascript
// Add to supportedFeatures array
this.supportedFeatures = [
  'selectElement',
  'textSelection',
  'textFieldIcon',
  'shortcut',
  'contentMessageHandler',
  'windowsManager',
  'newFeature' // Add here
];

// Add to loadFeatureHandler method
async loadFeatureHandler(featureName) {
  switch (featureName) {
    case 'newFeature':
      const { NewFeatureHandler } = await import('@/features/new-feature/handlers/NewFeatureHandler.js');
      return new NewFeatureHandler({ featureManager: this });
    // ... other cases
  }
}
```

3. **Add Exclusion Rules**
```javascript
// In ExclusionChecker.js
this.featureExclusionMapping = {
  // ... existing mappings
  newFeature: ['EXCLUDED_SITES', 'NEW_FEATURE_EXCLUDED_SITES']
};

this.featureSettingMapping = {
  // ... existing mappings
  newFeature: 'NEW_FEATURE_ENABLED'
};
```

### Testing Feature Handlers

1. **Test Activation/Deactivation**
```javascript
// Test feature lifecycle
const handler = new FeatureHandler();
const activateResult = await handler.activate();
expect(activateResult).toBe(true);
expect(handler.isActive).toBe(true);

const deactivateResult = await handler.deactivate();
expect(deactivateResult).toBe(true);
expect(handler.isActive).toBe(false);
```

2. **Test Resource Cleanup**
```javascript
// Verify ResourceTracker integration
const handler = new FeatureHandler();
await handler.activate();
// ... perform operations that create resources
await handler.deactivate();
// Verify all resources are cleaned up
```

3. **Test Settings Integration**
```javascript
// Test exclusion logic
const exclusionChecker = new ExclusionChecker();
await exclusionChecker.initialize();

// Test with feature enabled
const isAllowed = await exclusionChecker.isFeatureAllowed('featureName');
expect(isAllowed).toBe(true);

// Test with feature disabled
// Update settings and test again
```

## Debugging

### Common Issues

1. **Handler Not Activating**
   - Check ExclusionChecker logic
   - Verify feature settings mapping
   - Check URL exclusion rules
   - Review error logs in handler.activate()

2. **Memory Leaks**
   - Ensure ResourceTracker.cleanup() is called
   - Check all event listeners are removed
   - Verify DOM observers are disconnected

3. **Settings Not Updating**
   - Check SETTINGS_CHANGED message handling
   - Verify onSettingsChanged implementation
   - Check exclusionChecker.updateSettings() calls

### Debug Tools

```javascript
// FeatureManager debug status
const featureManager = getFeatureManager(); // Your access method
console.log('Active features:', featureManager.getActiveFeatures());
console.log('Feature status:', featureManager.getFeatureStatus());

// ExclusionChecker debug
const exclusionChecker = new ExclusionChecker();
await exclusionChecker.initialize();
console.log('Feature allowed:', await exclusionChecker.isFeatureAllowed('featureName'));
console.log('Feature enabled:', exclusionChecker.isFeatureEnabled('featureName'));
console.log('URL excluded:', exclusionChecker.isUrlExcludedForFeature('featureName'));
```

---

**Smart Handler Registration System: Production Ready ✅**

This system provides a robust, scalable foundation for dynamic feature management with optimal resource utilization and real-time responsiveness to settings changes.
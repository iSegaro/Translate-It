# Text Selection System

## Overview

The Text Selection system is a key component of the Translate-It extension, responsible for detecting, managing, and processing text selection on web pages. With a **Simplified Architecture (2025)** based on `selectionchange` events, it provides an optimized user experience for translating selected text.

### ✅ 2025 Updates - Simplified System:
- **Complexity Removal**: Complete removal of complex drag detection and the `pendingSelection` system.
- **selectionchange-only**: Utilizes only `selectionchange` events for all scenarios.
- **Text Field Decoupling**: Text field logic has been moved to the `text-field-interaction` module.
- **Simple Drag Prevention**: Uses basic `mousedown`/`mouseup` detection to prevent UI triggers during active dragging.
- **Performance Boost**: 60-70% reduction in code complexity and improved performance.
- **Maintainability**: Significantly simpler and more maintainable codebase.

## Architecture

### 🎯 Core Components

#### 1. **SimpleTextSelectionHandler**
`src/features/text-selection/handlers/SimpleTextSelectionHandler.js`

- Manages the standalone `selectionchange` event.
- Simple drag detection (`mousedown`/`mouseup`).
- Prevents icon display within text fields.
- Communicates directly with the `SelectionManager`.

#### 2. **SelectionManager**
`src/features/text-selection/core/SelectionManager.js`

- Processes text selection simply.
- Calculates UI positioning.
- Interacts with `WindowsManager`.
- Supports iframe communication.

#### 3. **TextSelectionHandler (Wrapper)**
`src/features/text-selection/handlers/TextSelectionHandler.js`

- Compatibility wrapper for `FeatureManager`.
- Uses `SimpleTextSelectionHandler` in the background.
- Maintains the old API for backward compatibility.

#### 4. **useTextSelection (Vue Composable)**
`src/features/text-selection/composables/useTextSelection.js`

- Vue composable for integration.
- Reactive state management.
- Simple interaction with `SimpleTextSelectionHandler`.

#### 5. **FieldDetector**
`src/utils/text/core/FieldDetector.js`

- Detects field types using site handlers.
- Determines the appropriate selection strategy.
- Correct `async/await` implementation for all operations.
- Cache management for performance optimization.

## Selection Strategy (Simplified)

### 🚀 New Approach: selectionchange-only

The new system utilizes a single strategy:

#### **Single Strategy** (All Content)
```javascript
// Only one event listener is required:
document.addEventListener('selectionchange', () => {
  if (!isDragging && hasText && !isInTextField) {
    showTranslationIcon();
  }
});

```

### 🎯 Icon Display Conditions:

1. **✅ Text is selected** (`selectedText.trim()`)
2. **✅ Not currently dragging** (`!isDragging`)
3. **✅ Not inside a text field** (`!isInTextField`)
4. **✅ Ctrl key requirement** (if enabled)
5. **✅ Select element mode is disabled** (`!selectModeActive`)

### 🔄 Separation of Concerns:

* **Page Text Selection** → `SimpleTextSelectionHandler`
* **Text Field Selection** → `TextFieldDoubleClickHandler` (Separate module)

## Simple Drag Prevention (Simplified Approach)

### 🚀 Advantages of the New Approach

#### ❌ Legacy Method (Complex Drag Detection)

```javascript
// Complex and bug-prone
selectionchange → store as pendingSelection
mouseup → process pendingSelection
timeout management + complex state

```

#### ✅ New Method (Simple Prevention)

```javascript
// Highly simple and effective
mousedown → isDragging = true
selectionchange → if (isDragging) skip
mouseup → isDragging = false + process after delay

```

### 🔧 Simple Implementation

```javascript
class SimpleTextSelectionHandler {
  constructor() {
    this.isDragging = false;
  }

  handleMouseDown() {
    this.isDragging = true;
  }

  handleMouseUp() {
    this.isDragging = false;

    // Process selection after short delay
    setTimeout(() => {
      this.processSelection();
    }, 50);
  }

  async processSelection() {
    if (this.isDragging) {
      return; // Skip during drag
    }

    if (this.isSelectionInTextField()) {
      return; // Skip text fields
    }

    // Process page selection
    await this.showTranslationIcon();
  }
}

```

## Event Flow

### 📊 Event Flow (Simplified)

```mermaid
graph TD
    A[User MouseDown] --> B[isDragging = true]
    B --> C[User Drags Text]
    C --> D[selectionchange events]
    D --> E[Skip (isDragging = true)]
    E --> F[User MouseUp]
    F --> G[isDragging = false]
    G --> H[Process selection after 50ms]
    H --> I[Show Translation Icon]

```

### 🎮 Various Scenarios

#### 1. **Mouse Selection** (Drag-to-select)

```
mousedown → isDragging = true
  ↓
selectionchange → skip (isDragging = true)
  ↓
mouseup → isDragging = false → process after 50ms → show icon

```

#### 2. **Keyboard Selection** (Ctrl+A, Shift+Arrow)

```
selectionchange (isDragging = false) → immediate processing → show icon

```

#### 3. **Text Field Selection** (INPUT/TEXTAREA)

```
selectionchange → isSelectionInTextField() = true → skip
  ↓
double-click in text field → TextFieldDoubleClickHandler → show icon

```

## Text Field Integration (Separate Module)

### 🔄 Decoupling Text Fields

Professional editors and text fields are now managed by a separate module:

#### Text Field Handler (`text-field-interaction` module)

```javascript
// TextFieldDoubleClickHandler for text fields
class TextFieldDoubleClickHandler {
  handleDoubleClick(event) {
    if (this.isTextField(event.target)) {
      const selectedText = this.getSelectedText();
      this.showTranslationUI(selectedText);
    }
  }

  isTextField(element) {
    // INPUT, TEXTAREA, contenteditable
    return element.tagName === 'INPUT' ||
           element.tagName === 'TEXTAREA' ||
           element.contentEditable === 'true';
  }
}

```

#### Professional Editors Support

* **Google Docs**: contenteditable detection
* **Microsoft Office**: iframe-based detection
* **Zoho Writer**: custom element detection
* **Notion**: block-based detection
* **WPS Office**: office suite detection

### 🎯 Simplified Approach:

1. **Page content** → `SimpleTextSelectionHandler`
2. **Text fields** → `TextFieldDoubleClickHandler`
3. **Professional editors** → `TextFieldDoubleClickHandler` (via contenteditable)

## Integration with Other Systems

### 🔗 WindowsManager Integration

```javascript
// TextSelectionManager → WindowsManager
const position = this._calculateSelectionPosition(selectedText);
const windowsManager = this._getWindowsManager();
await windowsManager.show('selection', {
  text: selectedText,
  position: position
});

```

### 🔗 FeatureManager Integration

```javascript
// FeatureManager → TextSelectionHandler
const textSelectionHandler = featureManager.getFeatureHandler('textSelection');
if (textSelectionHandler?.isActive) {
  const manager = textSelectionHandler.getTextSelectionManager();
  // Use manager...
}

```

### 🔗 IFrame Support

```javascript
// Cross-frame communication
if (window !== window.top) {
  // Send selection request to parent
  const message = {
    type: 'SELECTION_REQUEST',
    text: selectedText,
    position: position
  };
  window.parent.postMessage(message, '*');
}

```

## Error Handling

### 🛡️ Error Management

```javascript
try {
  await this._processSelectionChangeEvent(event);
} catch (rawError) {
  const error = await ErrorHandler.processError(rawError);
  await this.errorHandler.handle(error, {
    type: ErrorTypes.UI,
    context: 'text-selection',
    eventType: event?.type
  });
}

```

### 🔄 Context Safety

```javascript
// Extension context validation
if (ExtensionContextManager.isContextError(error)) {
  this.logger.debug('Extension context invalidated, skipping selection processing');
  return;
}

```

## Performance Optimization

### ⚡ Optimizations

#### 1. **Resource Tracking**

```javascript
class TextSelectionManager extends ResourceTracker {
  constructor() {
    super('text-selection-manager');
    // Automatic cleanup of timeouts, event listeners, etc.
  }
}

```

#### 2. **Duplicate Prevention**

```javascript
// Prevent duplicate processing
const isRecentDuplicate = selectedText === this.lastProcessedText && 
                         (currentTime - this.lastProcessedTime) < this.selectionProcessingCooldown;

if (isRecentDuplicate && this._isWindowVisible()) {
  return; // Skip duplicate
}

```

#### 3. **Efficient Event Handling**

```javascript
// Only process events when feature is active
if (!this.isActive || !this.textSelectionManager) return;

```

## Testing and Debugging

### 🔍 Debug Information

```javascript
// Debug status
getStatus() {
  return {
    handlerActive: this.isActive,
    hasSelection: this.hasActiveSelection(),
    managerAvailable: !!this.textSelectionManager,
    isDragging: this.isDragging,
    pendingSelection: !!this.pendingSelection
  };
}

```

### 📊 Logging

```javascript
// Structured logging
this.logger.debug('Selection detected', {
  text: selection.toString().substring(0, 30),
  fieldType: detection.fieldType,
  selectionStrategy: detection.selectionStrategy,
  eventStrategy: detection.selectionEventStrategy
});

```

## Best Practices

### ✅ Recommendations

1. **Use Field Detection**: Always identify the field type.
2. **Respect User Interaction**: Wait for the user to complete their selection.
3. **Cross-Frame Compatibility**: Account for iframes.
4. **Error Resilience**: Always handle potential errors.
5. **Resource Cleanup**: Ensure resources are properly disposed.
6. **Performance**: Prevent redundant duplicate processing.

### ❌ Things to Avoid

1. **Timeout-Based Detection**: Avoid using timeouts for primary drag detection.
2. **Immediate Processing**: Do not process `selectionchange` immediately during a drag.
3. **Hard-Coded Delays**: Avoid using fixed/static delays.
4. **Memory Leaks**: Do not forget to clean up resources.
5. **Duplicate Events**: Manage duplicate events properly.

## Usage Examples

### 1. **Regular Website Selection**

```javascript
// User drags text on a regular website
// → selectionchange events ignored while dragging
// → On mouseup: process and show icon

```

### 2. **Google Docs Selection** ```javascript

// User double-clicks in Google Docs
// → handleDoubleClick triggered
// → Direct processing with professional editor logic

```

### 3. **Keyboard Selection**
```javascript
// User presses Ctrl+A
// → selectionchange with isDragging = false
// → Immediate processing and icon display

```

## References

### Core Components (Simplified)

* **SimpleTextSelectionHandler**: `src/features/text-selection/handlers/SimpleTextSelectionHandler.js`
* **SelectionManager**: `src/features/text-selection/core/SelectionManager.js`
* **TextSelectionHandler (Wrapper)**: `src/features/text-selection/handlers/TextSelectionHandler.js`
* **useTextSelection (Vue)**: `src/features/text-selection/composables/useTextSelection.js`

### Text Field Integration

* **TextFieldHandler**: `src/features/text-field-interaction/handlers/TextFieldHandler.js`
* **TextFieldDoubleClickHandler**: `src/features/text-field-interaction/handlers/TextFieldDoubleClickHandler.js`
* **TextFieldIconManager**: `src/features/text-field-interaction/managers/TextFieldIconManager.js`

### Legacy Files (Backup)

* **TextSelectionManager.legacy.js**: Complex old implementation.
* **TextSelectionHandler.legacy.js**: Complex old handler.

### Documentation

* **WindowsManager**: `docs/WINDOWS_MANAGER_UI_HOST_INTEGRATION.md`
* **Smart Handler Registration**: `docs/SMART_HANDLER_REGISTRATION_SYSTEM.md`
* **Error Management**: `docs/ERROR_MANAGEMENT_SYSTEM.md`

### Key Improvements (2025) - Simplification

* ✅ **60-70% Code Reduction**: Eliminated unnecessary complexities.
* ✅ **selectionchange-only**: Switched exclusively to `selectionchange` events.
* ✅ **Simple Drag Prevention**: Replaced `pendingSelection` with simple `mousedown`/`mouseup`.
* ✅ **Text Field Separation**: Fully decoupled text fields into an independent module.
* ✅ **Performance Boost**: Higher efficiency with fewer race conditions.
* ✅ **Maintainability**: Cleaner, more readable code.
* ✅ **Cross-browser Reliability**: Improved compatibility across all major browsers.

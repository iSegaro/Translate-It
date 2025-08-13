# WindowsManager System Documentation

## 📋 Overview

The **WindowsManager** is a modular, sophisticated system responsible for managing translation UI components (icons and windows) across different document contexts including iframes. It provides a unified interface for creating, positioning, animating, and managing translation windows with full cross-frame communication support.

## 🎯 Key Features

- **Modular Architecture**: 18 specialized modules for different responsibilities
- **Cross-Frame Support**: Full iframe communication and coordination  
- **Smart Positioning**: Intelligent window placement with viewport awareness
- **Theme Integration**: Light/dark theme support with real-time switching
- **Animation System**: Smooth transitions and feedback animations
- **Drag & Drop**: Interactive window dragging with constraints
- **Translation Integration**: Direct integration with translation providers
- **TTS Support**: Text-to-speech functionality
- **Extension Context Safety**: Graceful handling of context invalidation

---

## 🏗️ Architecture Overview

```
WindowsManager (Orchestrator)
├── Core Layer
│   ├── WindowsConfig      # Configuration constants
│   ├── WindowsState       # State management
│   └── WindowsFactory     # UI element creation
├── Cross-Frame Layer
│   ├── CrossFrameManager  # Main cross-frame coordinator
│   ├── FrameRegistry      # Frame registration & mapping
│   └── MessageRouter      # Message routing & handling
├── Positioning Layer
│   ├── PositionCalculator # Position calculations
│   └── SmartPositioner    # Intelligent positioning
├── Interaction Layer
│   ├── ClickManager       # Click handling & outside clicks
│   └── DragHandler        # Drag & drop functionality
├── Animation Layer
│   └── AnimationManager   # Animation transitions
├── Translation Layer
│   ├── TranslationHandler # Translation requests
│   ├── TranslationRenderer# Content rendering
│   └── TTSManager         # Text-to-speech
├── Theme Layer
│   └── ThemeManager       # Theme management
└── Utils Layer
    └── DismissAll         # Cleanup utilities
```

---

## 📦 Module Details

### Core Modules

#### WindowsConfig
**Purpose**: Central configuration and constants
```javascript
// Usage
import { WindowsConfig } from './core/WindowsConfig.js';
const timeout = WindowsConfig.TIMEOUTS.TRANSLATION_TIMEOUT;
const zIndex = WindowsConfig.Z_INDEX.POPUP;
```

**Key Features:**
- Animation duration constants
- CSS class definitions
- Z-index management
- Cross-frame message types
- Style variables for themes

#### WindowsState
**Purpose**: Centralized state management
```javascript
// Usage
const state = new WindowsState(frameId);
state.setVisible(true);
state.setIconMode(false);
state.validateState(); // Returns validation result
```

**State Properties:**
- `isVisible`: Window visibility status
- `isIconMode`: Icon mode status
- `pendingTranslationWindow`: Transition flag
- `isTranslationCancelled`: Cancellation status
- `isDragging`: Drag state
- `isInIframe`: Frame context

#### WindowsFactory
**Purpose**: UI element creation with extension context safety
```javascript
// Usage
const factory = new WindowsFactory();
const icon = factory.createTranslateIcon(targetDocument);
const popup = factory.createPopupHost(frameId);
```

**Factory Methods:**
- `createTranslateIcon()`: Translation trigger icon
- `createPopupHost()`: Main popup container
- `createPopupContainer()`: Shadow DOM container
- `createTTSIcon()`: Text-to-speech icons
- `createCopyIcon()`: Copy functionality icons

### Cross-Frame Communication

#### CrossFrameManager
**Purpose**: Main coordinator for iframe communication
```javascript
// Usage
const crossFrame = new CrossFrameManager({ debugCrossFrame: true });
crossFrame.enableGlobalClickBroadcast();
crossFrame.requestWindowCreation(text, position);
```

**Key Features:**
- Global click broadcasting
- Window creation requests
- Frame registration coordination
- Message routing delegation

#### FrameRegistry
**Purpose**: Frame registration and mapping
```javascript
// Usage
const registry = new FrameRegistry();
const frameId = registry.currentFrameId;
const iframe = registry.getIframeByFrameId(frameId);
```

**Registry Features:**
- Unique frame ID generation
- Parent-child frame mapping
- Cross-origin safe operations
- Cleanup on destruction

#### MessageRouter
**Purpose**: Message routing and handling
```javascript
// Usage
const router = new MessageRouter(frameRegistry, {
  onOutsideClick: handler,
  onWindowCreationRequest: handler
});
```

**Message Types:**
- Frame registration
- Broadcast requests/apply
- Outside click events
- Window creation requests/responses

### Positioning System

#### PositionCalculator
**Purpose**: Position calculations across frame contexts
```javascript
// Usage
const calculator = new PositionCalculator();
const position = calculator.calculateIconPosition(selection, providedPos);
const topPosition = calculator.calculateCoordsForTopWindow(position);
```

**Calculation Features:**
- Icon positioning from text selection
- Cross-frame coordinate transformation
- Iframe offset calculations
- Viewport boundary validation

#### SmartPositioner
**Purpose**: Intelligent window positioning
```javascript
// Usage
const positioner = new SmartPositioner(positionCalculator);
const smartPos = positioner.calculateSmartPosition(position, topWindow);
positioner.applyInitialStyles(element, position);
```

**Smart Features:**
- Viewport boundary respect
- Fixed element collision avoidance
- Dynamic repositioning
- Transform origin optimization

### Interaction Management

#### ClickManager
**Purpose**: Click event handling and outside click detection
```javascript
// Usage
const clickManager = new ClickManager(crossFrameManager, state);
clickManager.setHandlers({ onOutsideClick, onIconClick });
clickManager.addOutsideClickListener();
```

**Click Features:**
- Outside click detection
- Cross-frame click broadcasting
- Icon click handling
- Event delegation

#### DragHandler
**Purpose**: Drag and drop functionality
```javascript
// Usage
const dragHandler = new DragHandler(positionCalculator);
dragHandler.setupDragHandlers(element, dragHandle);
```

**Drag Features:**
- Mouse event handling
- Viewport constraint enforcement
- Visual feedback
- Cross-document compatibility

### Animation System

#### AnimationManager
**Purpose**: Animation transitions and feedback
```javascript
// Usage
const animator = new AnimationManager();
await animator.animateIconIn(iconElement);
await animator.animateWindowOut(windowElement);
```

**Animation Types:**
- Icon appearance/disappearance
- Window fade in/out
- Scale transitions
- Loading animations
- Hover effects

### Translation Integration

#### TranslationHandler
**Purpose**: Translation request management
```javascript
// Usage
const handler = new TranslationHandler();
const result = await handler.performTranslation(text, options);
handler.cancelAllTranslations();
```

**Translation Features:**
- Async translation requests
- Request timeout management
- Message ID generation
- Error handling
- Request cancellation

#### TranslationRenderer
**Purpose**: Translation content rendering
```javascript
// Usage
const renderer = new TranslationRenderer(factory, ttsManager);
renderer.renderTranslationContent(container, translatedText, originalText);
```

**Rendering Features:**
- Markdown support
- RTL/LTR text direction
- TTS integration
- Copy functionality
- Error display

#### TTSManager
**Purpose**: Text-to-speech functionality
```javascript
// Usage
const tts = new TTSManager();
await tts.speakTextUnified(text);
const icon = tts.createTTSIcon(text, title, factory);
```

**TTS Features:**
- Multiple TTS methods (unified, Google, Web Speech)
- Language detection
- Icon creation with handlers
- Error fallback chains

### Theme System

#### ThemeManager
**Purpose**: Theme management and application
```javascript
// Usage
const themeManager = new ThemeManager();
await themeManager.initialize();
await themeManager.applyThemeToHost(hostElement);
```

**Theme Features:**
- Automatic theme detection
- Real-time theme switching
- CSS variable management
- Storage synchronization
- Dark/light mode support

---

## 🚀 Usage Examples

### Basic Window Creation

```javascript
import { WindowsManager } from './windows/WindowsManager.js';

// Create instance
const windowsManager = new WindowsManager({
  debugCrossFrame: true,
  fadeInDuration: 50,
  fadeOutDuration: 125
});

// Show translation window/icon
await windowsManager.show(selectedText, position);

// Clean up
windowsManager.dismiss();
windowsManager.destroy();
```

### Cross-Frame Communication

```javascript
// In iframe - request window creation in main document
const crossFrame = new CrossFrameManager();
crossFrame.requestWindowCreation(selectedText, position);

// In main document - handle window creation
crossFrame.setEventHandlers({
  onWindowCreationRequest: async (data, sourceWindow) => {
    await createWindowInMainDocument(data.selectedText, data.position);
    crossFrame.notifyWindowCreated(data.frameId, true, windowId);
  }
});
```

### Custom Positioning

```javascript
const calculator = new PositionCalculator();
const positioner = new SmartPositioner(calculator);

// Calculate smart position
const iconPos = calculator.calculateIconPosition(selection, initialPos);
const smartPos = positioner.calculateSmartPosition(iconPos, topWindow);

// Apply with constraints
positioner.applyInitialStyles(element, smartPos);
```

### Theme Integration

```javascript
const themeManager = new ThemeManager();

// Initialize and apply
await themeManager.initialize();
await themeManager.applyThemeToHost(hostElement);

// Listen for changes
themeManager.setThemeChangeCallback((newTheme, oldTheme) => {
  console.log(`Theme changed from ${oldTheme} to ${newTheme}`);
});
```

### Animation Sequences

```javascript
const animator = new AnimationManager();

// Icon sequence
await animator.animateIconIn(iconElement);
// ... user interaction ...
await animator.animateIconOut(iconElement);

// Window sequence
await animator.animateWindowIn(windowElement);
// ... display content ...
await animator.animateWindowOut(windowElement);
```

---

## 🔧 Configuration

### WindowsConfig Constants

```javascript
static ANIMATION = {
  FADE_IN_DURATION: 50,
  FADE_OUT_DURATION: 125,
  SCALE_TRANSITION: 'transform 0.1s ease-out, opacity 50ms ease-in-out'
};

static POSITIONING = {
  POPUP_WIDTH: 330,
  POPUP_HEIGHT: 120,
  ICON_SIZE: 24,
  VIEWPORT_MARGIN: 10
};

static TIMEOUTS = {
  OUTSIDE_CLICK_DELAY: 600,
  TRANSLATION_TIMEOUT: 30000,
  TTS_TIMEOUT: 15000
};
```

### Theme Variables

```javascript
static STYLES = {
  POPUP_VARIABLES: {
    light: {
      '--sw-bg-color': '#f8f8f8',
      '--sw-text-color': '#333',
      '--sw-border-color': '#ddd'
    },
    dark: {
      '--sw-bg-color': '#2a2a2a',
      '--sw-text-color': '#e0e0e0',
      '--sw-border-color': '#444'
    }
  }
};
```

---

## 🛠️ Development Guidelines

### Adding New Features

1. **Identify the appropriate module** for your feature
2. **Follow the module's interface pattern**
3. **Update the main WindowsManager** if needed
4. **Add proper error handling**
5. **Include extension context validation**
6. **Test cross-frame compatibility**

### Module Communication

```javascript
// ✅ Good - Using dependency injection
class NewFeature {
  constructor(positionCalculator, animationManager) {
    this.positionCalculator = positionCalculator;
    this.animationManager = animationManager;
  }
}

// ❌ Bad - Direct imports create tight coupling
class NewFeature {
  someMethod() {
    const position = new PositionCalculator().calculate();
  }
}
```

### Error Handling

```javascript
// ✅ Extension context safety
async createIcon() {
  if (!isExtensionContextValid()) {
    this.logger.warn('Extension context invalid');
    return;
  }
  
  try {
    const iconUrl = browser.runtime.getURL("icon.png");
    // ... create icon
  } catch (error) {
    throw new Error("Extension context invalidated.");
  }
}
```

### Cross-Frame Considerations

- Always check `isInIframe` for frame-specific logic
- Use `CrossFrameManager` for inter-frame communication
- Position calculations must account for iframe offsets
- Event broadcasting should respect frame boundaries

---

## 🧪 Testing

### Unit Testing Approach

```javascript
// Test individual modules
describe('PositionCalculator', () => {
  it('should calculate icon position from selection', () => {
    const calculator = new PositionCalculator();
    const mockSelection = createMockSelection();
    const position = calculator.calculateIconPosition(mockSelection);
    expect(position).toHaveProperty('x');
    expect(position).toHaveProperty('y');
  });
});
```

### Integration Testing

```javascript
// Test module interactions
describe('WindowsManager Integration', () => {
  it('should coordinate modules correctly', async () => {
    const manager = new WindowsManager();
    await manager.show(selectedText, position);
    expect(manager.state.isVisible).toBe(true);
    expect(manager.displayElement).toBeTruthy();
  });
});
```

### Cross-Frame Testing

- Test in iframe and main document contexts
- Verify message passing between frames
- Test position calculations across frame boundaries
- Validate cleanup in both contexts

---

## 🐛 Troubleshooting

### Common Issues

#### "Extension context invalidated"
**Cause**: Extension reloaded or disabled during operation
**Solution**: Graceful handling is already implemented

#### Window appears in wrong position
**Cause**: Iframe coordinate transformation issues
**Check**: `PositionCalculator.calculateCoordsForTopWindow()`

#### Cross-frame communication not working
**Cause**: Frame registration or message routing issues
**Check**: `FrameRegistry` setup and `MessageRouter` handlers

#### Animation stuttering
**Cause**: Multiple animation requests or CSS conflicts
**Check**: `AnimationManager` state and CSS transitions

### Debugging Tools

```javascript
// Enable debug logging
const windowsManager = new WindowsManager({
  debugCrossFrame: true
});

// State inspection
console.log(windowsManager.state.getSnapshot());

// Frame information
console.log(windowsManager.crossFrameManager.getFrameInfo());

// Validation
console.log(windowsManager.state.validateState());
```

---

## 📊 Performance Considerations

### Bundle Size Impact
- **Total modules**: 18 files, ~4,277 lines
- **Main class**: Reduced from 2,182 to ~400 lines (81% reduction)
- **Lazy loading**: Modules loaded on demand
- **Tree shaking**: Unused code eliminated

### Memory Management
- Proper event listener cleanup
- State reset on dismissal
- Animation cleanup
- Cross-frame registry cleanup

### Optimization Tips
- Use `dismiss()` instead of recreating instances
- Implement debouncing for rapid position changes
- Cache expensive calculations
- Minimize DOM queries

---

## 🔄 Migration Guide

### From Legacy WindowsManager

The new modular system maintains full backward compatibility:

```javascript
// Old usage still works
import WindowsManager from './WindowsManager.js';
const manager = new WindowsManager();
await manager.show(text, position);

// New modular usage
import { 
  WindowsManager, 
  PositionCalculator, 
  ThemeManager 
} from './windows/index.js';
```

### API Compatibility

All public methods and properties remain the same:
- `show(selectedText, position)`
- `dismiss(withFadeOut)`
- `destroy()`
- `isVisible` property
- `isIconMode` property

---

## 📚 Related Documentation

- [Translation System](./TRANSLATION_SYSTEM.md) - Translation provider integration
- [TTS System](./TTS_SYSTEM.md) - Text-to-speech functionality
- [Messaging System](./MessagingSystem.md) - Cross-extension communication
- [Architecture](./ARCHITECTURE.md) - Overall system architecture

---

## 📝 Changelog

### v1.0.0 (January 2025)
- ✅ Complete modular refactoring
- ✅ 18 specialized modules created
- ✅ Cross-frame communication improved
- ✅ Extension context safety added
- ✅ Theme integration enhanced
- ✅ Animation system modularized
- ✅ 81% complexity reduction in main class

---

*This documentation is part of the Translate-It extension project. For more information, see the main [Architecture Documentation](./ARCHITECTURE.md).*
# Translate-It Extension Architecture

## Overview

This project is a **modern browser extension** for AI-powered translation built with **Vue.js architecture**, supporting **Chrome and Firefox** with **Manifest V3**. The extension has undergone complete modernization from vanilla JavaScript to a well-organized, scalable Vue.js architecture with cross-browser compatibility.

## Current Status: Phase 5 Complete ✅

### Completed Modernization:
- ✅ **Vue.js Migration**: Options page fully migrated with modern Vue components
- ✅ **Cross-Browser Architecture**: Chrome and Firefox with MV3 support and compatibility layer
- ✅ **Unified Messaging System**: Standardized messaging with specialized messengers
- ✅ **Centralized Storage System**: StorageCore with intelligent caching and event system
- ✅ **Background Service Modernization**: Service worker with cross-browser feature detection
- ✅ **Provider System**: 10+ translation providers with factory pattern
- ✅ **Project Structure Reorganization**: Complete 5-phase reorganization with logical file grouping
- ✅ **Migration System**: Automatic legacy data migration and import/export compatibility

---

## 🏗️ Core Architecture Overview

### System Architecture Flow

```
User Interaction (Vue Components / Content Scripts)
    ↓
MessagingCore (Standardized Message Format)
    ↓
SimpleMessageHandler (Cross-browser routing)
    ↓
Background Handlers (Feature-specific processing)
    ↓
Core Services (Translation, Storage, Providers)
    ↓
Browser APIs (Cross-browser compatibility layer)
```

---

## 📁 Project Structure (Post Phase 5 Reorganization)

```
src/
├── 🔵 core/                          # Core foundation systems
│   ├── SimpleMessageHandler.js       # Cross-browser message routing
│   ├── EnhancedUnifiedMessenger.js   # Advanced messaging functionality
│   ├── TranslationHandler.js         # Main translation orchestration
│   ├── EventHandler.js               # User interaction handling
│   ├── InstanceManager.js            # Singleton pattern management
│   ├── TranslationService.js         # Core translation logic
│   └── provider-registry.js          # Provider protocol definitions
│
├── 🟢 messaging/                      # Unified messaging system
│   ├── core/
│   │   ├── MessagingCore.js           # Main messaging core & factory
│   │   ├── MessageActions.js          # Standardized action constants
│   │   └── MessageFormat.js           # Message format validation
│   ├── specialized/                   # Feature-specific messengers
│   │   ├── TTSMessenger.js
│   │   ├── CaptureMessenger.js
│   │   ├── TranslationMessenger.js
│   │   └── SelectionMessenger.js
│   └── composables/
│       └── useMessaging.js            # Vue integration
│
├── 🔶 storage/                        # Centralized storage system
│   ├── core/
│   │   ├── StorageCore.js             # Main storage manager
│   │   └── SecureStorage.js           # Encryption utilities
│   ├── modules/                       # Domain-specific storage
│   │   ├── SettingsStorage.js
│   │   └── HistoryStorage.js
│   └── composables/
│       ├── useStorage.js              # Storage composables
│       └── useStorageItem.js
│
├── 🟣 providers/                      # Translation provider system
│   ├── core/
│   │   ├── BaseProvider.js            # Abstract base provider
│   │   ├── ProviderFactory.js         # Provider factory pattern
│   │   └── ProviderRegistry.js        # Provider registration
│   └── implementations/               # Provider implementations
│       ├── google/                    # Google services
│       ├── openai/                    # OpenAI & OpenRouter
│       ├── microsoft/                 # Bing Translate
│       ├── browser/                   # Browser Translation API
│       └── custom/                    # DeepSeek, WebAI, Yandex
│
├── 🔴 handlers/                       # Event and message handlers
│   ├── content/                       # Content script handlers
│   │   ├── CaptureHandler.js
│   │   └── TTSHandler.js
│   ├── lifecycle/                     # Extension lifecycle
│   │   ├── InstallHandler.js
│   │   └── ExtensionLifecycleHandler.js
│   └── [other handlers...]
│
├── 🟡 managers/                       # Service and feature managers
│   ├── core/                          # Core managers
│   │   ├── FeatureManager.js
│   │   ├── NotificationManager.js
│   │   └── LifecycleManager.js
│   ├── browser-specific/              # Browser-specific implementations
│   │   ├── tts/                       # TTS managers
│   │   ├── capture/                   # Capture managers
│   │   └── panel/                     # Panel/sidebar managers
│   └── content/                       # Content script managers
│       ├── VueBridgeManager.js        # Vue component injection
│       ├── SelectElementManager.js        # Element selection
│       └── WindowsManager.js          # Floating windows
│
├── 🟠 utils/                          # Organized utility functions
│   ├── core/                          # Core utilities
│   │   ├── helpers.js
│   │   ├── debounce.js
│   │   └── validation.js
│   ├── browser/                       # Browser compatibility
│   │   ├── compatibility.js
│   │   ├── events.js
│   │   └── platform.js
│   ├── i18n/                          # Internationalization
│   │   ├── i18n.js
│   │   ├── languages.js
│   │   └── localization.js
│   ├── text/                          # Text processing
│   │   ├── extraction.js
│   │   ├── detection.js
│   │   └── markdown.js
│   ├── ui/                            # UI utilities
│   │   ├── theme.js
│   │   ├── html-sanitizer.js
│   │   └── exclusion.js
│   └── framework/                     # Framework compatibility
│
├── 📱 components/                     # Vue components
│   ├── base/                          # Base UI components
│   ├── feature/                       # Feature-specific components
│   ├── content/                       # Content script components
│   └── shared/                        # Shared components
│
├── 📄 views/                          # Vue pages
│   ├── options/                       # ✅ Fully migrated options page
│   ├── popup/                         # Popup interface
│   └── sidepanel/                     # Sidepanel interface
│
├── 🗂️ store/                          # Pinia state management
├── 🎯 background/                     # Background service core
├── 📄 content-scripts/                # Content script entry points
├── 🎨 composables/                    # Vue composables
├── ⚙️ config.js                       # Configuration management
└── 📋 services/                       # Business logic services
```

---

## 🔵 Core Foundation Systems (src/core/)

The `src/core/` directory contains the foundational systems that power the entire extension:

### SimpleMessageHandler.js
**Cross-browser message routing with Promise-based API**
- Handles all message routing between extension contexts
- Provides context-aware routing for MessagingStandards integration
- Uses webextension-polyfill for Chrome/Firefox compatibility
- Supports both action-based and context-based message routing

```javascript
// Register handler for specific action
messageHandler.register('TRANSLATE', handleTranslate);

// Register context-specific handler
messageHandler.registerContextHandler('popup', 'TRANSLATE', handlePopupTranslate);
```

### TranslationHandler.js
**Main translation orchestration with strategy pattern**
- Central orchestrator for all translation operations
- Integrates with platform-specific strategies (WhatsApp, Twitter, Instagram, etc.)
- Manages translation state and error handling
- Coordinates with FeatureManager and NotificationManager

**Key Responsibilities:**
- Platform detection and strategy selection
- Translation request orchestration
- Error handling and user notifications
- Integration with EventHandler for user interactions

### EventHandler.js
**User interaction handling and event processing**
- Handles text selection, keyboard shortcuts, and element targeting
- Integrates with text extraction utilities for translation preparation
- Manages selection windows and translation UI
- Coordinates with IconBehavior for visual feedback

**Key Features:**
- Text selection detection and processing
- Element interaction handling
- Platform-specific behavior adaptation
- Translation preparation and cleanup

### EnhancedUnifiedMessenger.js & UnifiedMessenger.js
**Messaging system foundation**
- Provides unified messaging interface across extension contexts
- Supports specialized messengers for different feature domains
- Ensures message format standardization
- Handles cross-context communication

### InstanceManager.js
**Singleton pattern management**
- Manages singleton instances of core services
- Provides controlled access to TranslationHandler
- Ensures proper initialization order
- Supports testing and development scenarios

---

## 🟢 Messaging System Architecture (src/messaging/)

### MessagingCore.js
**Unified messaging factory and core**
- Combines MessagingStandards factory functionality
- Provides context-specific messenger instances
- Ensures standardized message formats
- Integrates with specialized messengers

```javascript
import { MessagingCore } from '@/messaging/core/MessagingCore.js';

// Get context-specific messenger
const popupMessenger = MessagingCore.getMessenger('popup');

// Use specialized messengers
await popupMessenger.specialized.translation.translate(text, options);
await popupMessenger.specialized.tts.speak(text, language);
```

### Message Flow Architecture

```
Vue Component / Content Script
    ↓ (standardized message)
MessagingCore.getMessenger(context)
    ↓ (MessageFormat validation)
Specialized Messenger (TTS/Capture/Translation/Selection)
    ↓ (webextension-polyfill)
browser.runtime.sendMessage()
    ↓
Background: SimpleMessageHandler
    ↓ (route to appropriate handler)
Background Handler Execution
    ↓ (standardized response)
Response to Component
```

### Specialized Messengers

#### TTSMessenger.js
```javascript
// TTS operations
await messenger.specialized.tts.speak(text, language, options);
await messenger.specialized.tts.stop();
```

#### CaptureMessenger.js
```javascript
// Screen capture operations
await messenger.specialized.capture.captureScreen(options);
await messenger.specialized.capture.captureArea(bounds);
```

#### TranslationMessenger.js
```javascript
// Translation operations
const result = await messenger.specialized.translation.translate(text, {
  sourceLang: 'en',
  targetLang: 'fa',
  provider: 'google'
});
```

#### SelectionMessenger.js
```javascript
// Element selection operations
await messenger.specialized.selection.activateMode('translate');
await messenger.specialized.selection.deactivateMode();
```

---

## 🔶 Storage System Architecture (src/storage/)

### StorageCore.js
**Centralized storage management with caching and events**

**Key Features:**
- Intelligent Map-based caching system
- Event-driven change notifications
- Cross-browser compatibility via webextension-polyfill
- Comprehensive error handling

```javascript
import { storageManager } from '@/storage/core/StorageCore.js';

// Basic storage operations
const data = await storageManager.get(['key1', 'key2']);
await storageManager.set({ key1: 'value1' });
await storageManager.remove(['key1']);

// Event listening
storageManager.addEventListener('change', (changes) => {
  console.log('Storage changed:', changes);
});
```

### Storage Modules

#### SettingsStorage.js
- Manages extension settings with validation
- Integrates with SecureStorage for sensitive data
- Provides setting-specific methods and validation

#### HistoryStorage.js
- Manages translation history
- Provides cleanup and maintenance operations
- Integrates with search and filtering functionality

### Vue Integration

#### useStorage.js Composable
```javascript
import { useStorage } from '@/storage/composables/useStorage.js';

// Reactive storage access
const { data, save, remove, loading, error } = useStorage(['settings', 'history']);

// Auto-save on changes
watch(data, async (newData) => {
  await save();
});
```

#### useStorageItem.js Composable
```javascript
import { useStorageItem } from '@/storage/composables/useStorageItem.js';

// Single item with auto-sync
const { value, save, loading } = useStorageItem('userSettings', {});
```

---

## 🟣 Provider System Architecture (src/providers/)

### BaseProvider.js
**Abstract base class for all translation providers**

```javascript
export class BaseProvider {
  async translate(text, sourceLang, targetLang, translateMode) {
    throw new Error('translate method must be implemented');
  }
  
  async translateImage(imageData, sourceLang, targetLang, translateMode) {
    throw new Error('translateImage not supported by this provider');
  }
  
  async testConnection() {
    // Base implementation with API key validation
  }
}
```

### ProviderFactory.js
**Factory pattern for provider instantiation**

```javascript
import { ProviderFactory } from '@/providers/core/ProviderFactory.js';

const factory = new ProviderFactory();

// Get provider instance (cached)
const provider = factory.getProvider('google-translate');

// Get supported providers
const providers = factory.getSupportedProviders();

// Reset provider instances
factory.resetProviders(); // Reset all
factory.resetProviders('google-translate'); // Reset specific
```

### Provider Implementations

#### Google Services (src/providers/implementations/google/)
- **GoogleTranslate.js**: Free Google Translate API
- **GoogleGemini.js**: Google Gemini AI for translation with context understanding

#### OpenAI Services (src/providers/implementations/openai/)
- **OpenAI.js**: Direct OpenAI API integration
- **OpenRouter.js**: OpenRouter aggregation service

#### Microsoft Services (src/providers/implementations/microsoft/)
- **BingTranslate.js**: Microsoft Bing Translator API

#### Browser Services (src/providers/implementations/browser/)
- **BrowserAPI.js**: Chrome 138+ Browser Translation API

#### Custom Services (src/providers/implementations/custom/)
- **DeepSeek.js**: DeepSeek AI translation service
- **WebAI.js**: Local server integration
- **YandexTranslate.js**: Yandex translation service
- **CustomProvider.js**: Generic OpenAI-compatible API provider

### Creating New Providers

```javascript
import { BaseProvider } from '@/providers/core/BaseProvider.js';

class NewProvider extends BaseProvider {
  constructor() {
    super('new-provider');
  }
  
  async translate(text, sourceLang, targetLang, translateMode) {
    // Implementation
    return translatedText;
  }
  
  async testConnection() {
    // Test API connectivity
    return { success: true };
  }
}

// Register the provider
import { providerRegistry } from '@/providers/core/ProviderRegistry.js';
providerRegistry.register('new-provider', NewProvider, {
  name: 'New Provider',
  supportedFeatures: ['text', 'image']
});
```

---

## 🔴 Handler System Architecture

### Background Handlers (src/background/handlers/)

The background handlers are organized by feature domain for clear separation of concerns:

#### Translation Handlers (src/background/handlers/translation/)
- **handleTranslate.js**: Main translation processing
- **handleTranslateText.js**: Text-specific translation
- **handleRevertTranslation.js**: Translation reversal

#### Screen Capture Handlers (src/background/handlers/screen-capture/)
- **handleStartAreaCapture.js**: Initiate area selection
- **handleStartFullScreenCapture.js**: Full screen capture
- **handleProcessAreaCaptureImage.js**: Process captured image
- **handlePreviewConfirmed.js / handlePreviewCancelled.js**: Preview handling
- **handleCaptureError.js**: Error handling

#### TTS Handlers (src/background/handlers/tts/)
- **handleSpeak.js**: Text-to-speech operations (unified cross-browser handler)

#### Common Handlers (src/background/handlers/common/)
- **handlePing.js**: Health check and connectivity
- **handleOpenOptionsPage.js**: Options page navigation
- **handleShowOSNotification.js**: System notifications
- **handleRefreshContextMenus.js**: Context menu updates

#### Lifecycle Handlers (src/background/handlers/lifecycle/)
- **handleExtensionLifecycle.js**: Extension startup/shutdown
- **handleBackgroundReloadExtension.js**: Development reload
- **handleContextInvalid.js**: Context invalidation handling

### Content Handlers (src/handlers/content/)

#### CaptureHandler.js
**Content-side screen capture operations**
- Handles capture UI injection
- Manages area selection interface
- Coordinates with background capture handlers

#### TTSHandler.js
**Content-side TTS functionality**
- Manages content script TTS operations
- Handles TTS UI feedback
- Coordinates with background TTS system

### Lifecycle Handlers (src/handlers/lifecycle/)

#### InstallHandler.js
**Installation and migration handling**
- Detects legacy extension data
- Performs automatic migration
- Handles first-time installation

#### ExtensionLifecycleHandler.js
**Runtime lifecycle management**
- Manages extension updates
- Handles context invalidation
- Coordinates with background lifecycle

---

## 📄 Content Scripts Architecture (src/content-scripts/)

### Content Script Entry Point (src/content-scripts/index.js)
**Unified content script initialization**

```javascript
// Content script flow
import { vueBridge } from "../managers/content/VueBridgeManager.js";
import { contentTTSHandler } from "../handlers/content/TTSHandler.js";
import EventHandler from "../core/EventHandler.js";
import { SelectElementManager } from "../managers/content/SelectElementManager.js";

// Initialize core systems
const translationHandler = getTranslationHandlerInstance();
const eventHandler = new EventHandler(translationHandler, featureManager);
const selectElementManager = new SelectElementManager();

// Initialize Vue bridge
await vueBridge.initialize();
```

### VueBridgeManager.js
**Vue component injection system**

**Key Features:**
- Micro-app architecture for injecting Vue components
- Component registry for reusable UI elements
- Pinia store integration in content scripts
- Message-based component lifecycle management

```javascript
import { VueBridgeManager } from '@/managers/content/VueBridgeManager.js';

// Create micro Vue app
await vueBridge.createMicroApp('translation-tooltip', {
  component: 'TranslationTooltip',
  props: { text: 'Hello', translation: 'سلام' },
  container: document.body
});

// Destroy micro app
await vueBridge.destroyMicroApp('translation-tooltip');
```

### Content Manager Integration

#### SelectElementManager.js
**Element selection functionality**
- Handles element targeting and selection
- Integrates with translation workflow
- Manages selection UI and feedback

#### WindowsManager.js
**Floating window management**
- Manages translation popup windows
- Handles window positioning and lifecycle
- Coordinates with Vue components

---

## 🟡 Browser-Specific Manager System (src/managers/browser-specific/)

### Cross-Browser Architecture Pattern

The extension uses feature detection and browser-specific implementations:

#### TTS System (src/managers/browser-specific/tts/)

**Simplified Cross-Browser TTS Architecture**
- **TTSChrome.js** (OffscreenTTSManager): Chrome's offscreen documents for audio processing
- **TTSFirefox.js** (BackgroundTTSManager): Firefox background page audio context

**Automatic Browser Detection:**
- Feature detection via `browser.offscreen?.hasDocument` determines implementation
- Dynamic loading through `FeatureLoader.loadTTSManager()`
- Direct message routing: `TTS_STOP`/`TTS_PAUSE`/`TTS_RESUME` → offscreen, `TTS_SPEAK` → background
- Content script fallback through `TTSHandler.js` when needed

**Message Flow:**
```
Vue Component → TTSMessenger → MessageActions.TTS_SPEAK → handleSpeak.js → FeatureLoader → TTSChrome/TTSFirefox
Content Script → TTSHandler.js → Web Speech API (fallback)
Offscreen Document → Direct TTS control (TTS_STOP, TTS_PAUSE, TTS_RESUME)
```

#### Capture System (src/managers/browser-specific/capture/)

**CaptureManager.js** - Unified capture interface
- **CaptureOffscreen.js**: Chrome offscreen API for screen capture
- **CaptureContent.js**: Firefox content script fallback

#### Panel System (src/managers/browser-specific/panel/)

**Browser-Specific Panel Implementations:**
- **SidepanelManager.js**: Chrome's native side panel API
- **SidebarManager.js**: Firefox's sidebar action API

### Feature Detection Pattern

```javascript
import { detectFeatures } from '@/utils/browser/feature-detection.js';

const features = await detectFeatures();

if (features.offscreenDocuments) {
  // Use Chrome offscreen API
} else if (features.sidebarAction) {
  // Use Firefox sidebar
} else {
  // Use fallback implementation
}
```

---

## 🟠 Organized Utilities System (src/utils/)

### Core Utilities (src/utils/core/)
**Essential functionality used throughout the extension**

- **helpers.js**: General helper functions, DOM manipulation, extension context validation
- **debounce.js**: Debouncing utility for performance optimization
- **validation.js**: Input validation and form validation utilities

### Browser Utilities (src/utils/browser/)
**Browser compatibility and platform detection**

- **compatibility.js**: Cross-browser API compatibility layer
- **events.js**: Event simulation and handling utilities
- **platform.js**: Platform and browser detection

### Internationalization Utilities (src/utils/i18n/)
**Localization and language support**

- **i18n.js**: Main internationalization system
- **languages.js**: Language definitions and mappings
- **localization.js**: Localization helper functions
- **langUtils.js**: Language-specific utilities

### Text Processing Utilities (src/utils/text/)
**Text extraction, processing, and manipulation**

- **extraction.js**: Advanced text extraction from DOM elements
- **detection.js**: Text detection and language identification
- **markdown.js**: Simple Markdown processing
- **textDetection.js**: Text direction and formatting detection

### UI Utilities (src/utils/ui/)
**User interface and visual utilities**

- **theme.js**: Theme management and switching
- **html-sanitizer.js**: HTML sanitization for security
- **exclusion.js**: Site exclusion management

### Framework Utilities (src/utils/framework/)
**Framework compatibility and text insertion**

- **framework-compat/**: Comprehensive framework detection and text insertion strategies
- Supports various web frameworks and editors (Google Docs, React, Vue, etc.)

---

## 📱 Vue.js Integration Architecture

### Component Organization

#### Base Components (src/components/base/)
**Reusable UI building blocks**
- BaseButton, BaseInput, BaseDropdown, BaseModal, etc.
- Consistent styling and behavior
- Accessibility support

#### Feature Components (src/components/feature/)
**Translation-specific functionality**
- LanguageSelector, ProviderSelector, TranslationBox
- TTSControl, TranslationHistory, AdvancedFeatures
- API settings components for each provider

#### Content Components (src/components/content/)
**Components injected into web pages**
- TranslationTooltip, CapturePreview, ScreenSelector
- Lightweight components for content script injection

### Vue Pages (src/views/)

#### Options Page (src/views/options/) - ✅ Fully Migrated
**Complete modern Vue.js implementation**
- Responsive 3-column layout with sidebar navigation
- 8 feature tabs: Languages, Activation, Prompt, API, Import/Export, Advance, Help, About
- Full theme support (light/dark/auto)
- Comprehensive form validation
- Real-time settings synchronization

#### Popup Page (src/views/popup/)
**Translation interface in popup window**
- Compact translation form
- Language selection and provider choice
- TTS controls and clipboard integration

#### Sidepanel Page (src/views/sidepanel/)
**Extended translation interface**
- Full-featured translation workspace
- Translation history panel
- Advanced provider settings

### Pinia Store Integration

#### Enhanced Settings Store (src/store/core/settings.js)
```javascript
import { useSettingsStore } from '@/store/core/settings.js';

const settingsStore = useSettingsStore();

// Reactive settings access
const sourceLanguage = computed(() => settingsStore.settings.SOURCE_LANG);

// Save settings
await settingsStore.saveSettings({ SOURCE_LANG: 'en' });

// Get specific setting
const apiKey = await settingsStore.getSetting('OPENAI_API_KEY');
```

### Vue Composables Integration

#### useMessaging.js
```javascript
import { useMessaging } from '@/messaging/composables/useMessaging.js';

const { sendMessage, specialized } = useMessaging('popup');

// Use specialized messengers
await specialized.translation.translate(text, options);
```

#### useBrowserAPI.js
```javascript
import { useBrowserAPI } from '@/composables/useBrowserAPI.js';

const { 
  browserAPIReady, 
  sendMessage, 
  storage, 
  tabs, 
  notifications 
} = useBrowserAPI();
```

---

## 🎯 Development Guidelines for AI Systems

### Finding Functionality

#### Core Systems Location Guide
- **Message Routing**: `src/core/SimpleMessageHandler.js`
- **Translation Logic**: `src/core/TranslationHandler.js`
- **User Interactions**: `src/core/EventHandler.js`
- **Provider Management**: `src/providers/core/ProviderFactory.js`
- **Storage Operations**: `src/storage/core/StorageCore.js`
- **Cross-browser Features**: `src/managers/browser-specific/`

#### Handler Organization
- **Background Message Handlers**: `src/background/handlers/[feature]/`
- **Content Script Handlers**: `src/handlers/content/`
- **Lifecycle Management**: `src/handlers/lifecycle/`

#### Utility Functions
- **Core Utilities**: `src/utils/core/` (helpers, validation, debounce)
- **Browser Utils**: `src/utils/browser/` (compatibility, platform detection)
- **Text Processing**: `src/utils/text/` (extraction, detection, processing)
- **UI Utils**: `src/utils/ui/` (theme, sanitization, exclusion)

### Adding New Features

#### Creating New Providers
1. Extend `BaseProvider` class
2. Implement required methods (`translate`, `testConnection`)
3. Register in `ProviderRegistry`
4. Add configuration UI in `src/components/feature/api-settings/`

#### Adding New Handlers
1. Create handler in appropriate `src/background/handlers/[category]/`
2. Register in `SimpleMessageHandler`
3. Add corresponding action in `MessageActions.js`
4. Create frontend interface in Vue components

#### Extending Messaging System
1. Add new specialized messenger in `src/messaging/specialized/`
2. Register in `MessagingCore`
3. Add action constants in `MessageActions.js`
4. Implement corresponding background handlers

### Import Patterns (Post Phase 5 Reorganization)

```javascript
// Core systems
import { MessagingCore } from '@/messaging/core/MessagingCore.js';
import { storageManager } from '@/storage/core/StorageCore.js';
import { ProviderFactory } from '@/providers/core/ProviderFactory.js';

// Organized utilities
import { logME, isEditable } from '@/utils/core/helpers.js';
import { detectPlatform } from '@/utils/browser/platform.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { extractTextFromElement } from '@/utils/text/extraction.js';
import { applyTheme } from '@/utils/ui/theme.js';

// Handlers
import { CaptureHandler } from '@/handlers/content/CaptureHandler.js';
import { InstallHandler } from '@/handlers/lifecycle/InstallHandler.js';

// Managers
import { TTSManager } from '@/managers/browser-specific/tts/TTSManager.js';
import { VueBridgeManager } from '@/managers/content/VueBridgeManager.js';
```

### Testing and Validation

#### Build Commands
```bash
# Development builds
pnpm run dev:chrome      # Chrome development server
pnpm run dev:firefox     # Firefox development server

# Production builds
pnpm run build:chrome    # Chrome production build
pnpm run build:firefox   # Firefox production build

# Testing
pnpm run test:vue:run    # Vue component unit tests
pnpm run pre-submit      # Full validation (lint + test + build)
```

#### Validation Checklist
- [ ] All imports use correct organized paths
- [ ] Message routing works through SimpleMessageHandler
- [ ] Cross-browser compatibility maintained
- [ ] Vue components properly integrated
- [ ] Storage operations use StorageCore
- [ ] Error handling implemented

---

## 📋 File Reference Guide

### Essential Files for AI Navigation

#### Core System Entry Points
- **`src/core/SimpleMessageHandler.js`** - Main message routing system
- **`src/core/TranslationHandler.js`** - Central translation orchestration
- **`src/messaging/core/MessagingCore.js`** - Unified messaging factory
- **`src/storage/core/StorageCore.js`** - Centralized storage management
- **`src/providers/core/ProviderFactory.js`** - Provider instantiation

#### Background Service Architecture
- **`src/background/index.js`** - Background service entry point
- **`src/background/handlers/index.js`** - Handler registration
- **`src/background/translation-engine.js`** - Translation orchestration

#### Content Script Architecture
- **`src/content-scripts/index.js`** - Content script entry point
- **`src/managers/content/VueBridgeManager.js`** - Vue component injection
- **`src/managers/content/SelectElementManager.js`** - Element selection

#### Vue.js Integration
- **`src/store/core/settings.js`** - Enhanced settings store
- **`src/composables/useBrowserAPI.js`** - Unified browser API access
- **`src/views/options/OptionsApp.vue`** - Fully migrated options page

#### Configuration and Setup
- **`src/config.js`** - Extension configuration
- **`CLAUDE.md`** - Development guidelines and commands
- **`package.json`** - Dependencies and scripts

### System Dependencies Map

```
Core Systems:
├── SimpleMessageHandler → All background handlers
├── TranslationHandler → Providers, Strategies, EventHandler
├── MessagingCore → Specialized messengers, Vue composables
├── StorageCore → Vue stores, Settings management
└── ProviderFactory → All provider implementations

Cross-System Integration:
├── Vue Components → MessagingCore → SimpleMessageHandler → Background Handlers
├── Content Scripts → VueBridgeManager → Vue Components
├── Background → ProviderFactory → Provider Implementations
└── Settings Store → StorageCore → Browser Storage API
```

This architecture represents a **modern, scalable, and maintainable browser extension** built with **latest web technologies** and **best practices**. The system is designed for **future enhancements**, **cross-browser compatibility**, and **comprehensive AI-powered translation functionality**.
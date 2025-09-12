# Translate-It Extension Architecture

## Overview

**Modern Vue.js browser extension** for AI-powered translation supporting **Chrome and Firefox** with **Manifest V3**. Built with comprehensive modular architecture, advanced state management, and robust error handling.

## 🎯 Current Status ✅

**Latest Changes:**
- ✅ **Complete Vue.js Migration** - Modern reactive component architecture
- ✅ **Modular System Design** - 18+ specialized modules and systems
- ✅ **Advanced State Management** - Pinia stores with reactive data
- ✅ **Comprehensive Error Handling** - Unified error management system
- ✅ **Cross-Frame Communication** - Advanced iframe support
- ✅ **IFrame Support System** - Streamlined iframe functionality with ResourceTracker integration and essential components
- ✅ **Unified TTS System (2025)** - Complete TTS unification with automatic language fallback and cross-context coordination
- ✅ **Text Selection System (2025)** - Modular architecture with SiteHandlerRegistry, static imports, and professional editor support
- ✅ **Storage Management** - Centralized storage with caching
- ✅ **Logging System** - Production-ready structured logging
- ✅ **Provider System** - 10+ translation providers with a hierarchical factory pattern (`BaseProvider`, `BaseTranslateProvider`, `BaseAIProvider`), integrated with `RateLimitManager` and `StreamingManager`.
- ✅ **Cross-Browser Support** - Chrome and Firefox MV3
- ✅ **UI Host System** - Centralized Vue app in Shadow DOM for all in-page UI
- ✅ **Unified Messaging System** - Race-condition-free messaging with intelligent timeout management
- ✅ **Smart Handler Registration System** - Feature-based exclusion with dynamic handler lifecycle management and real-time settings updates
- ✅ **Memory Garbage Collector** - Advanced memory management system preventing memory leaks with support for DOM, Browser APIs, custom event systems, and Critical Protection System

---

## 📚 Documentation Index

### Core Documentation
- **[Architecture](ARCHITECTURE.md)** - This file - Complete system overview and integration guide
- **[Unified Messaging System](MessagingSystem.md)** - Race-condition-free inter-component communication with intelligent timeout management
- **[Translation System](TRANSLATION_SYSTEM.md)** - Translation engine, providers, and request handling
- **[Provider Implementation Guide](PROVIDERS.md)** - Complete guide for implementing translation providers with BaseProvider, RateLimitManager, and Circuit Breaker
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)** - Centralized error handling and context safety
- **[Storage Manager](STORAGE_MANAGER.md)** - Unified storage API with caching and events
- **[Logging System](LOGGING_SYSTEM.md)** - Structured logging with performance optimization
- **[Memory Garbage Collector](MEMORY_GARBAGE_COLLECTOR.md)** - Advanced memory management system with Critical Protection for essential resources

### Feature-Specific Documentation
- **[Smart Handler Registration System](SMART_HANDLER_REGISTRATION_SYSTEM.md)** - Dynamic feature lifecycle management with exclusion logic
- **[Windows Manager Integration](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md)** - Guide for the event-driven integration with the UI Host
- **[Text Actions System](TEXT_ACTIONS_SYSTEM.md)** - Copy/paste/TTS functionality with Vue integration
- **[TTS System](TTS_SYSTEM.md)** - Advanced Text-to-Speech with stateful Play/Pause/Resume controls
- **[Text Selection System](TEXT_SELECTION_SYSTEM.md)** - **Modular Architecture (2025)** - Static import system, site handler registry, professional editor support with drag detection
- **[UI Host System](UI_HOST_SYSTEM.md)** - Centralized Shadow DOM UI management
- **[Select Element System](SELECT_ELEMENT_SYSTEM.md)** - System for selecting and translating DOM elements
- **[IFrame Support System](../features/iframe-support/README.md)** - Streamlined iframe functionality with essential components and Vue integration

### Media Assets
- **[Video Tutorials](Introduce.mp4)** - Introduction and feature overview
- **[API Key Tutorial](HowToGet-APIKey.mp4)** - Step-by-step API configuration
- **[Screenshots](Images/)** - Interface screenshots and architectural diagrams
- **[Store Assets](Store/)** - Chrome and Firefox store promotional materials

### Getting Started
1. **New Developers**: Start with [Architecture](ARCHITECTURE.md) → [Messaging System](MessagingSystem.md)
2. **Feature Development**: [Smart Handler Registration](SMART_HANDLER_REGISTRATION_SYSTEM.md) → [Translation System](TRANSLATION_SYSTEM.md)
3. **Translation Features**: [Translation System](TRANSLATION_SYSTEM.md) → [Provider Implementation Guide](PROVIDERS.md)
4. **Provider Development**: [Provider Implementation Guide](PROVIDERS.md) → [Provider System](#-provider-system)
5. **UI Development**: [Windows Manager](WINDOWS_MANAGER.md) → [Text Actions](TEXT_ACTIONS_SYSTEM.md)
6. **IFrame Integration**: [IFrame Support System](../features/iframe-support/README.md) → [Cross-Frame Communication](#-smart-messaging-system)
7. **Error Handling**: [Error Management](ERROR_MANAGEMENT_SYSTEM.md) → [Logging System](LOGGING_SYSTEM.md)
8. **Storage Operations**: [Storage Manager](STORAGE_MANAGER.md)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                            │
│  Vue Apps (Popup/Sidepanel/Options) → Components → Composables │
│  Pinia Stores → State Management → Reactive Data               │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED MESSAGING LAYER                     │
│  useMessaging → UnifiedMessaging → MessageHandler → Direct     │
│  Cross-Frame Communication → Window Management                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKGROUND LAYER                             │
│  Service Worker → Message Handlers → Translation Engine        │
│  Feature Loader → System Managers → Cross-Browser Support      │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORE SYSTEMS                                │
│  Provider Factory → BaseProvider (BaseTranslateProvider, BaseAIProvider) → RateLimitManager → StreamingManager → Storage Manager → Error Handler            │
│  Logger System → Unified TTS System → Windows Manager → Memory Garbage Collector │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONTENT LAYER                                │
│  Content Scripts → Smart Feature Management → UI Host System   │
│  Feature-Based Registration → Dynamic Handler Lifecycle        │
│  Principled Text Selection (2025) → Element Selection → Text Field Icons → Context Integration │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure (Post-Migration)

```
src/
├── 🎯 apps/                     # Vue Applications (Entry Points)
│   ├── popup/                  # PopupApp.vue + components
│   │   ├── PopupApp.vue            # Main popup application
│   │   └── components/             # Popup-specific components
│   ├── sidepanel/              # SidepanelApp.vue + components  
│   │   ├── SidepanelApp.vue        # Main sidepanel application
│   │   ├── SidepanelLayout.vue     # Layout wrapper
│   │   └── components/             # Sidepanel components
│   ├── options/                # OptionsApp.vue + tabs
│   │   ├── OptionsApp.vue          # Main options application
│   │   ├── OptionsLayout.vue       # Layout wrapper
│   │   ├── OptionsSidebar.vue      # Options sidebar
│   │   ├── About.vue               # About page
│   │   ├── components/             # Options components
│   │   └── tabs/                   # Configuration tabs
│   └── content/                # ContentApp.vue (UI Host)
│       └── components/             # Content UI components
│
├── 🧩 components/              # Vue Components (Preserved Structure)
│   ├── base/                   # Base UI components
│   ├── shared/                 # Shared components
│   │   ├── LanguageSelector.vue    # Language selection
│   │   ├── ProviderSelector.vue    # Provider selection
│   │   ├── TranslationDisplay.vue  # Translation display
│   │   ├── TranslationInputField.vue # Input field
│   │   ├── UnifiedTranslationInput.vue # Unified input
│   │   └── TTSButton.vue           # TTS controls
│   ├── feature/                # Feature-specific components
│   │   └── api-settings/           # API configuration
│   ├── layout/                 # Layout components
│   ├── popup/                  # Popup components
│   ├── sidepanel/              # Sidepanel components  
│   └── content/                # Content script components
│
├── 🎨 composables/             # Vue Composables (Reorganized)
│   ├── core/                  # useExtensionAPI, useBrowserAPI
│   │   ├── useDirectMessage.js     # Direct messaging
│   │   └── useExtensionAPI.js      # Extension API wrapper
│   ├── ui/                    # useUI, usePopupResize  
│   │   ├── usePopupResize.js       # Popup resizing
│   │   └── useUI.js                # UI state management
│   ├── storage/               # useStorage, useStorageItem
│   └── shared/                # Other shared composables
│       ├── useClipboard.js         # Clipboard operations
│       ├── useErrorHandler.js      # Error handling
│       ├── useI18n.js              # Internationalization
│       ├── useLanguages.js         # Language management
│       └── useUnifiedI18n.js       # Unified i18n
│
├── 🏪 features/               # Feature-Based Organization (NEW)
│   ├── translation/
│   │   ├── core/              # TranslationEngine, ProviderFactory, StreamingManager
│   │   │   └── translation-engine.js # Translation coordination
│   │   ├── handlers/          # handleTranslate.js, etc.
│   │   ├── stores/            # translation.js store
│   │   ├── composables/       # useTranslation, useTranslationModes
│   │   ├── providers/         # BaseProvider, BaseTranslateProvider, BaseAIProvider, Google, OpenAI, DeepSeek, etc.
│   │   └── utils/             # Translation utilities
│   ├── tts/                   # ✅ UNIFIED TTS SYSTEM (2025)
│   │   ├── handlers/          # TTS background handlers
│   │   ├── composables/       # useTTSSmart.js - SINGLE SOURCE OF TRUTH
│   │   └── core/              # TTSGlobalManager - exclusive playback coordination
│   ├── screen-capture/
│   │   ├── handlers/          # Background capture handlers
│   │   ├── stores/            # capture.js store
│   │   ├── composables/       # useScreenCapture
│   │   ├── managers/          # Capture managers
│   │   └── utils/             # Image processing
│   ├── element-selection/
│   │   ├── managers/          # SelectElementManager
│   │   ├── handlers/          # SelectElementHandler
│   │   └── utils/             # Selection utilities
│   ├── text-selection/
│   │   └── handlers/          # TextSelectionHandler
│   ├── text-field-interaction/
│   │   ├── managers/          # TextFieldIconManager
│   │   └── handlers/          # TextFieldIconHandler
│   ├── shortcuts/
│   │   └── handlers/          # ShortcutHandler
│   ├── exclusion/
│   │   ├── core/              # ExclusionChecker
│   │   └── composables/       # useExclusionChecker
│   ├── text-actions/
│   │   ├── composables/       # useCopyAction, usePasteAction
│   │   └── components/        # ActionToolbar, CopyButton
│   ├── subtitle/
│   │   ├── core/              # BaseSubtitleHandler, NetflixSubtitleHandler
│   │   ├── handlers/          # Subtitle handlers
│   │   └── stores/            # subtitle.js store
│   ├── windows/
│   │   ├── managers/          # WindowsManager (business logic)
│   │   ├── handlers/          # WindowsManagerHandler
│   │   ├── components/        # TranslationWindow
│   │   ├── composables/       # useWindowsManager
│   │   └── managers/          # Position, animation, theme managers
│   ├── iframe-support/
│   │   ├── managers/          # IFrameManager (core functionality)
│   │   ├── composables/       # useIFrameSupport, useIFrameDetection (simplified)
│   │   └── README.md          # Streamlined documentation
│   ├── history/
│   │   ├── stores/            # history.js store
│   │   ├── composables/       # useHistory
│   │   ├── components/        # History components
│   │   └── storage/           # History storage logic
│   └── settings/
│       ├── stores/            # settings.js store
│       ├── composables/       # Settings composables
│       └── storage/           # Settings storage
│
├── 🔧 shared/                 # Shared Systems (Moved from top-level)
│   ├── messaging/             # Smart messaging system
│   │   ├── core/              # MessagingCore, SmartMessaging
│   │   └── composables/       # useMessaging
│   ├── storage/               # Storage management
│   │   ├── core/              # StorageCore, SecureStorage
│   │   └── composables/       # useStorage, useStorageItem
│   ├── error-management/      # Error handling
│   │   ├── ErrorHandler.js    # Main error handler
│   │   ├── ErrorMatcher.js    # Error matching
│   │   └── ErrorMessages.js   # Error messages
│   ├── logging/               # Logging system
│   │   ├── logger.js          # Main logger
│   │   └── logConstants.js    # Log constants
│   └── config/                # Configuration
│       └── config.js          # Application config
│
├── 🏗️ core/                  # Core Infrastructure  
│   ├── background/            # Service worker & lifecycle
│   │   ├── index.js           # Background entry point
│   │   ├── feature-loader.js  # Feature loading
│   │   ├── handlers/          # Background message handlers
│   │   └── listeners/         # Event listeners
│   ├── content-scripts/       # Content script entry
│   │   └── index.js           # Content script entry
│   ├── memory/                # Memory Garbage Collector System with Critical Protection
│   │   ├── MemoryManager.js   # Core memory management with critical resource support
│   │   ├── ResourceTracker.js # Resource tracking mixin with critical protection
│   │   ├── SmartCache.js      # TTL-based caching
│   │   ├── GlobalCleanup.js   # Lifecycle cleanup hooks
│   │   ├── MemoryMonitor.js   # Memory usage monitoring
│   │   └── index.js           # Module exports
│   ├── managers/              # Core managers
│   │   ├── core/              # LifecycleManager  
│   │   ├── content/           # FeatureManager, TextSelectionManager
│   │   └── browser-specific/  # Browser-specific managers
│   ├── helpers.js             # Core helper functions
│   ├── validation.js          # Data validation
│   ├── extensionContext.js    # Extension context management
│   └── tabPermissions.js      # Tab permissions
│
├── 🛠️ utils/                 # Pure Utilities (Simplified)
│   ├── browser/               # Browser compatibility
│   ├── text/                  # Text processing utilities
│   │   ├── core/              # Modern text processing (2025)
│   │   │   ├── FieldDetector.js    # Modern field detection
│   │   │   ├── SelectionDetector.js # Modern selection detection
│   │   │   └── types.js            # Shared types and interfaces
│   │   ├── registry/          # Site Handler Registry (2025)
│   │   │   └── SiteHandlerRegistry.js # Handler management
│   │   ├── sites/             # Site-specific handlers (2025)
│   │   │   ├── base/               # Base handler classes
│   │   │   │   ├── BaseSiteHandler.js    # Abstract base
│   │   │   │   ├── GoogleSuiteHandler.js # Google Docs/Slides
│   │   │   │   └── MicrosoftOfficeHandler.js # MS Office
│   │   │   ├── ZohoWriterHandler.js    # Zoho Writer support
│   │   │   ├── WPSHandler.js           # WPS Office support
│   │   │   └── NotionHandler.js        # Notion workspace support
│   │   ├── FieldDetector.js   # Legacy wrapper (backward compatibility)
│   │   ├── SelectionDetector.js # Legacy wrapper (backward compatibility)
│   │   ├── detection.js       # Text detection
│   │   ├── extraction.js      # Text extraction
│   │   ├── markdown.js        # Markdown processing
│   │   └── textDetection.js   # Text detection utilities
│   ├── ui/                    # UI utilities
│   │   └── html-sanitizer.js  # HTML sanitization
│   ├── i18n/                  # Internationalization utils
│   ├── framework/             # Framework compatibility
│   └── rendering/             # Rendering utilities
│   │   ├── common/                 # Common operations
│   │   └── index.js                # Handler registry
│   └── listeners/          # Event listeners
│       └── onContextMenuClicked.js # Context menu events
│
├── 🏭 providers/           # Translation provider system
│   ├── core/
│   │   ├── ProviderFactory.js      # Provider factory
│   │   ├── ProviderRegistry.js     # Provider registration
│   │   └── BaseProvider.js         # Base provider class
│   ├── implementations/    # Provider implementations
│   │   ├── google/                 # Google services
│   │   │   ├── GoogleTranslate.js  # Google Translate
│   │   │   └── GoogleGemini.js     # Google Gemini
│   │   ├── openai/                 # OpenAI services
│   │   │   ├── OpenAI.js           # OpenAI provider
│   │   │   └── OpenRouter.js       # OpenRouter provider
│   │   ├── microsoft/              # Microsoft services
│   │   │   └── BingTranslate.js    # Bing Translate
│   │   ├── browser/                # Browser APIs
│   │   │   └── BrowserAPI.js       # Native browser translation
│   │   └── custom/                 # Custom providers
│   │       ├── DeepSeek.js         # DeepSeek provider
│   │       ├── WebAI.js            # WebAI provider
│   │       ├── YandexTranslate.js  # Yandex provider
│   │       └── CustomProvider.js   # Generic custom provider
│   ├── register-providers.js       # Provider registration
│   └── index.js                    # Provider exports
│
├── 🔧 utils/               # Utility modules
│   ├── core/               # Core utilities
│   │   ├── logger.js               # Logging system
│   │   ├── extensionContext.js     # Extension context management
│   │   └── StorageManager.js       # Storage management
│   ├── i18n/               # Internationalization
│   ├── text/               # Text processing
│   ├── browser/            # Browser compatibility
│   └── ui/                 # UI utilities
│
├── 📄 content-scripts/     # Content scripts
│   └── index.js                    # Main content script entry
│
├── 🎨 assets/              # Static assets
│   ├── icons/              # Application icons
│   └── styles/             # Global styles
│       ├── global.scss             # Global styles
│       ├── variables.scss          # CSS variables
│       └── _api-settings-common.scss # API settings styles
│
└── 🔧 managers/            # System managers
    ├── core/
    │   └── LifecycleManager.js     # Central message router
    ├── content/select-element/
    │           └── SelectElementManager.js # Element selection manager
    └── browser-specific/   # Browser-specific implementations
        └── tts/                    # TTS implementations
```

---

## 🔄 Unified Messaging System

### Overview
The Unified Messaging system provides **race-condition-free communication** between Vue components, background scripts, and content scripts with **intelligent timeout management**. See [Unified Messaging System Documentation](MessagingSystem.md) for complete details.

### Vue Integration

**useMessaging Composable** - Unified messaging interface for Vue components:
```javascript
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

// In Vue component setup()
const { sendMessage, createMessage } = useMessaging('popup')

// Automatic timeout management (recommended)
const response = await sendMessage(
  createMessage(MessageActions.TRANSLATE, { 
    text: 'Hello',
    targetLang: 'fa'
  })
)

// Settings operations with fast timeout
const settingsResponse = await sendMessage(
  createMessage(MessageActions.GET_SETTINGS, {})
)
```

### Unified Messaging Architecture

**UnifiedMessaging.js** - Intelligent timeout management system:
```javascript
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js'

// Automatic timeout based on action type
const response = await sendMessage(message)

// Fast actions: 2-3 second timeout for UI operations
// Medium actions: 8-15 second timeout for translation
// Long actions: 20+ second timeout for media processing

// Custom timeout control
const response = await sendMessage(message, {
  timeout: 10000
})
```

**MessageFormat** - Foundation utilities (unchanged):
```javascript
export const MessageFormat = {
  create: (action, data, context) => ({ ... }),
  validate: (message) => boolean,
  createSuccessResponse: (data) => ({ ... }),
  createErrorResponse: (error) => ({ ... })
}
```

**MessageActions.js** - All available message types:
```javascript
// Translation actions
TRANSLATE: 'TRANSLATE'
TRANSLATE_SELECTION: 'TRANSLATE_SELECTION'
TRANSLATE_PAGE: 'TRANSLATE_PAGE'

// TTS actions
TTS_SPEAK: 'TTS_SPEAK',
GOOGLE_TTS_PAUSE: 'GOOGLE_TTS_PAUSE',
GOOGLE_TTS_RESUME: 'GOOGLE_TTS_RESUME',
TTS_STOP: 'TTS_STOP',
GOOGLE_TTS_STOP_ALL: 'GOOGLE_TTS_STOP_ALL',
GOOGLE_TTS_GET_STATUS: 'GOOGLE_TTS_GET_STATUS'

// UI actions
OPEN_SIDEPANEL: 'OPEN_SIDEPANEL'
ACTIVATE_SELECT_ELEMENT_MODE: 'ACTIVATE_SELECT_ELEMENT_MODE'

// Vue integration actions
GET_EXTENSION_INFO: 'GET_EXTENSION_INFO'
CAPTURE_SCREEN_AREA: 'CAPTURE_SCREEN_AREA'
// ... and 30+ more actions
```

### Context-Aware Messaging

Each component filters messages by context to prevent cross-interference:
```javascript
// In popup component
browser.runtime.onMessage.addListener((message) => {
  if (message.context !== MessageContexts.POPUP) {
    return false // Ignore non-popup messages
  }
  // Handle popup-specific updates
})
```

---

## 🎯 Background Service

### Service Worker Architecture
Modern Manifest V3 service worker with dynamic feature loading:

```javascript
// Background service entry point
import { LifecycleManager } from '@/managers/core/LifecycleManager.js'
import { FeatureLoader } from '@/background/feature-loader.js'

const lifecycleManager = new LifecycleManager()
const featureLoader = new FeatureLoader()

lifecycleManager.initialize()
```

### Message Handler Organization
Handlers are organized by feature category for maintainability:

**Translation Operations:**
- `handleTranslate.js` - Main translation processor (ALL translation requests)
- `handleTranslateText.js` - Direct text translation
- `handleTranslateImage.js` - Image translation with OCR
- `handleRevertTranslation.js` - Translation reversal

**Vue Integration:**
- `handleGetExtensionInfo.js` - Extension metadata for Vue apps
- `handleTestProviderConnection.js` - Provider connectivity testing
- `handleSaveProviderConfig.js` - Provider configuration storage
- `handleCaptureScreenArea.js` - Screen capture integration

**Element Selection:**
- `handleActivateSelectElementMode.js` - Element selection activation
- `handleSetSelectElementState.js` - State management
- `handleGetSelectElementState.js` - State retrieval

**Screen Capture:**
- `handleStartFullScreenCapture.js` - Full screen capture
- `handleProcessAreaCaptureImage.js` - Area capture processing
- `handlePreviewConfirmed.js` - Capture confirmation

**Sidepanel & UI:**
- `handleOpenSidePanel.js` - Sidepanel opening
- `handleTriggerSidebarFromContent.js` - Content script triggers

**Subtitle Translation:**
- `handleSubtitleTranslate.js` - Subtitle translation processing
- `handleSubtitleStatus.js` - Subtitle translation status
- `handleSubtitleToggle.js` - Enable/disable subtitle translation

**System Management:**
- `handlePing.js` - Health checks
- `handleBackgroundReloadExtension.js` - Extension reloading
- `handleExtensionLifecycle.js` - Lifecycle management

### Dynamic Feature Loading
```javascript
export class FeatureLoader {
  async loadTTSManager() {
    const hasOffscreen = typeof browser.offscreen?.hasDocument === "function"
    
    if (hasOffscreen) {
      // Chrome: Use offscreen documents
      const { OffscreenTTSManager } = await import("@/managers/browser-specific/tts/TTSChrome.js")
      return new OffscreenTTSManager()
    } else {
      // Firefox: Use background page audio
      const { BackgroundTTSManager } = await import("@/managers/browser-specific/tts/TTSFirefox.js")
      return new BackgroundTTSManager()
    }
  }
}
```

---

## 🏭 Provider System

### Factory Pattern
```javascript
import { ProviderFactory } from '@/providers/core/ProviderFactory.js'

const provider = ProviderFactory.create('openai', config)
const result = await provider.translate(text, options)
```

### Available Providers
- **Google Translate** - Free, fast
- **OpenAI** - GPT-powered translation
- **DeepSeek** - AI translation service
- **Local** - Browser built-in translation
- **10+ more providers**

### TranslationEngine
Coordinates translation requests and provider selection:

```javascript
import { TranslationEngine } from '@/features/translation/core/translation-engine.js'

const engine = new TranslationEngine()
const result = await engine.translate({
  text: 'Hello',
  targetLang: 'fa',
  provider: 'openai'
})
```

---

## 🗂️ Vue.js State Management

### Pinia Store Architecture
The extension uses Pinia for reactive state management across all Vue applications:

**Core Stores:**
```javascript
// Global settings store
import { useSettingsStore } from '@/store/core/settings.js'

const settings = useSettingsStore()
await settings.updateProvider('openai')
await settings.saveApiKey('OPENAI_API_KEY', 'sk-...')
```

**Feature-Specific Stores:**
```javascript
// Translation state
import { useTranslationStore } from '@/store/modules/translation.js'
const translation = useTranslationStore()
translation.setResult(translatedText)

// History management
import { useHistoryStore } from '@/store/modules/history.js'
const history = useHistoryStore()
await history.addEntry(originalText, translatedText)

// TTS state
import { useTTSStore } from '@/store/modules/tts.js'
const tts = useTTSStore()
await tts.speak(text, language)

// Subtitle translation state
import { useSubtitleStore } from '@/store/modules/subtitle.js'
const subtitle = useSubtitleStore()
subtitle.toggleSubtitleTranslation()

// Provider management
import { useProvidersStore } from '@/store/modules/providers.js'
const providers = useProvidersStore()
const activeProvider = providers.getActiveProvider()
```

### Store Integration with Storage Manager
All stores automatically sync with browser storage:

```javascript
// Settings store automatically uses StorageManager
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    API_KEYS: {},
    PROVIDER: 'google-translate',
    SOURCE_LANG: 'auto',
    TARGET_LANG: 'en'
  }),
  
  actions: {
    async updateProvider(provider) {
      this.PROVIDER = provider
      // Automatically synced to browser.storage
      await this.saveSettings()
    }
  }
})
```

### Reactive Data Flow
```
Vue Component → Pinia Store → Storage Manager → browser.storage
     ↓              ↓              ↓
  Reactive UI → Computed → Event System → Cross-Tab Sync
```

---

## 🔗 Cross-System Integration Guide

### Vue Component Integration Pattern
The extension follows a consistent pattern for integrating Vue components with backend systems:

```vue
<template>
  <div class="translation-box">
    <TranslationInputField 
      v-model="inputText"
      @paste="handlePaste"
    />
    <ActionToolbar
      :text="inputText"
      :language="sourceLanguage"
      @text-copied="handleCopied"
      @tts-speaking="handleTTSStart"
    />
    <TranslationDisplay
      :content="translationResult"
      :is-loading="isTranslating"
      :error="translationError"
    />
  </div>
</template>

<script setup>
import { useTranslationModes } from '@/composables/useTranslationModes.js'
import { usePopupTranslation } from '@/composables/usePopupTranslation.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { useSettingsStore } from '@/store/core/settings.js'

// Reactive state management
const settings = useSettingsStore()
const { triggerTranslation, isTranslating, translationResult } = usePopupTranslation()
const { handleError } = useErrorHandler()

// Translation logic
const handleTranslate = async () => {
  try {
    await triggerTranslation({
      text: inputText.value,
      sourceLang: settings.SOURCE_LANG,
      targetLang: settings.TARGET_LANG,
      provider: settings.PROVIDER
    })
  } catch (error) {
    await handleError(error, { context: 'translation-box' })
  }
}
</script>
```

### System Communication Flow
```
Vue Component
    ↓ (composable)
Composable Logic (usePopupTranslation)
    ↓ (useMessaging)
Messaging System (MessageFormat.create)
    ↓ (browser.runtime.sendMessage)
Background Service Worker
    ↓ (LifecycleManager.route)
Message Handler (handleTranslate.js)
    ↓ (TranslationEngine)
Translation Provider
    ↓ (response)
Error Handler ← Storage Manager ← Result Processing
    ↓ (broadcast back to Vue)
Pinia Store Update → Reactive UI Update
```

### Error Integration Pattern
All systems integrate with the centralized error management:

```javascript
// In any component or composable
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import ExtensionContextManager from '@/core/extensionContext.js'

const { handleError } = useErrorHandler()

// Safe operation pattern
const performOperation = async () => {
  try {
    // Check extension context first
    if (!ExtensionContextManager.isValidSync()) {
      throw new Error('Extension context invalid')
    }
    
    // Perform operation
    const result = await someOperation()
    return result
    
  } catch (error) {
    // Centralized error handling
    await handleError(error, {
      context: 'component-name',
      showToast: true
    })
    throw error
  }
}
```

### Storage Integration Pattern
All components use the StorageManager through stores:

```javascript
// Store level (automatic sync)
export const useSettingsStore = defineStore('settings', {
  actions: {
    async updateSetting(key, value) {
      this[key] = value
      await this.saveSettings() // StorageManager integration
    }
  }
})

// Component level (reactive updates)
const settings = useSettingsStore()
watch(() => settings.PROVIDER, (newProvider) => {
  // Automatically reactive to storage changes
  console.log('Provider changed:', newProvider)
})
```

### Logging Integration Pattern
All systems use the unified logging system:

```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

// Component-specific logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

// In Vue component
onMounted(() => {
  logger.init('TranslationBox mounted')
})

// In composable
const performAction = async () => {
  logger.debug('Starting action')
  try {
    const result = await action()
    logger.info('Action completed successfully', { duration: performance.now() })
    return result
  } catch (error) {
    logger.error('Action failed', error)
    throw error
  }
}
```

### Cross-Context Communication
Components communicate across different extension contexts:

```javascript
// Popup to Background
const { sendMessage } = useMessaging('popup')
const result = await sendMessage(
  createMessage(MessageActions.TRANSLATE, data)
)

// Content Script to Popup (via background)
const { sendMessage } = useMessaging('content')
const result = await sendMessage(
  createMessage(MessageActions.OPEN_SIDEPANEL, data)
)

// Cross-frame (iframes)
const windowsManager = new WindowsManager()
await windowsManager.show(selectedText, position)
```

## 🛠️ Vue.js Development Patterns

### Composable Design Pattern
All business logic is extracted into composables for reusability:

```javascript
// useTranslationLogic.js - Reusable translation logic
export function useTranslationLogic(context = 'generic') {
  const { sendMessage } = useMessaging(context)
  const { handleError } = useErrorHandler()
  const logger = getScopedLogger(LOG_COMPONENTS.UI, `Translation-${context}`)
  
  const translate = async (text, options) => {
    logger.debug('Translation requested', { text: text.slice(0, 50) })
    
    try {
      const result = await sendMessage(
        createMessage(MessageActions.TRANSLATE, { text, ...options })
      )
      
      logger.info('Translation completed')
      return result
    } catch (error) {
      await handleError(error, { context })
      throw error
    }
  }
  
  return {
    translate,
    // Other reusable methods
  }
}
```

### Component Architecture Guidelines

**Base Components** (`src/components/base/`):
- Pure UI components with no business logic
- Accept all styling through props
- Emit all interactions as events
- No direct API calls or external dependencies

**Shared Components** (`src/components/shared/`):
- Reusable components with integrated business logic
- Use composables for external interactions
- Specific to translation functionality but context-agnostic

**Feature Components** (`src/components/feature/`):
- Complex components with specific business logic
- May use multiple composables and stores
- Context-aware (popup, sidepanel, options specific)

**Layout Components** (`src/components/layout/`):
- Structural components for application layout
- Minimal business logic
- Focus on responsive design and navigation

### Store Design Principles

1. **Single Responsibility**: Each store manages one feature domain
2. **Automatic Persistence**: All stores sync with browser storage
3. **Reactive Updates**: Use reactive patterns for UI updates
4. **Cross-Store Communication**: Use store composition for complex operations

```javascript
// Example store with proper integration
export const useTranslationStore = defineStore('translation', {
  state: () => ({
    currentTranslation: null,
    isTranslating: false,
    history: []
  }),
  
  getters: {
    hasTranslation: (state) => !!state.currentTranslation,
    recentTranslations: (state) => state.history.slice(0, 10)
  },
  
  actions: {
    async performTranslation(text, options) {
      this.isTranslating = true
      
      try {
        // Use composable for business logic
        const { translate } = useTranslationLogic('store')
        const result = await translate(text, options)
        
        this.currentTranslation = result
        this.addToHistory(text, result)
        
        // Auto-save to storage
        await this.saveState()
        
      } finally {
        this.isTranslating = false
      }
    }
  }
})
```

---

## 📋 Essential Files

### Vue Application Entry Points
- `src/views/popup/PopupApp.vue` - Main popup application
- `src/views/sidepanel/SidepanelApp.vue` - Sidepanel application
- `src/views/options/OptionsApp.vue` - Options page application

### Core System Files
- `src/messaging/core/MessagingCore.js` - Message utilities and format
- `src/messaging/composables/useMessaging.js` - Vue messaging integration
- `src/background/index.js` - Background service worker entry
- `src/background/translation-engine.js` - Translation coordination
- `src/managers/core/LifecycleManager.js` - Central message router

### Provider System
- `src/providers/core/ProviderFactory.js` - Provider factory and management
- `src/providers/core/BaseProvider.js` - Base provider interface
- `src/providers/implementations/` - All translation provider implementations

### State Management
- `src/store/core/settings.js` - Global settings store
- `src/store/modules/translation.js` - Translation state management
- `src/utils/core/StorageManager.js` - Centralized storage system

### Core Systems
- `src/utils/core/logger.js` - Unified logging system
- `src/utils/core/extensionContext.js` - Extension context management
- `src/error-management/ErrorHandler.js` - Centralized error handling

### Key Composables
- `src/composables/usePopupTranslation.js` - Popup translation logic
- `src/composables/useSidepanelTranslation.js` - Sidepanel translation logic
- `src/composables/useErrorHandler.js` - Error handling composable
- `src/composables/actions/useTextActions.js` - Text action functionality

### Shared Components
- `src/components/shared/TranslationDisplay.vue` - Translation result display
- `src/components/shared/TranslationInputField.vue` - Translation input
- `src/components/shared/actions/ActionToolbar.vue` - Action toolbar
- `src/components/shared/LanguageSelector.vue` - Language selection
- `src/components/shared/ProviderSelector.vue` - Provider selection

### Background Handlers
- `src/background/handlers/translation/handleTranslate.js` - Main translation handler
- `src/background/handlers/vue-integration/` - Vue-specific handlers
- `src/background/handlers/tts/` - Text-to-speech handlers
- `src/background/handlers/subtitle/` - Subtitle translation handlers
- `src/background/handlers/element-selection/` - Element selection handlers

### Content Scripts
- `src/content-scripts/index.js` - Main content script entry
- `src/managers/content/select-element/SelectElementManager.js` - Element selection manager

---

## 🎯 Smart Handler Registration System

### Overview
Dynamic feature lifecycle management system that only registers handlers when needed based on settings and URL exclusions. Provides real-time activation/deactivation without page refresh.

See **[Smart Handler Registration System Documentation](SMART_HANDLER_REGISTRATION_SYSTEM.md)** for complete details.

### Key Components
- **ExclusionChecker** - Determines feature availability based on settings and URL rules
- **FeatureManager** - Central orchestrator for handler lifecycle management  
- **Feature Handlers** - Standardized handlers with activate/deactivate methods
- **Real-Time Updates** - Settings changes immediately affect handler registration

### Supported Features
- `selectElement` - Element selection and translation
- `textSelection` - Text selection handling
- `textFieldIcon` - Text field icon management  
- `shortcut` - Keyboard shortcut handling (Ctrl+/)
- `contentMessageHandler` - Content script messaging
- `windowsManager` - UI windows management

### Benefits
- **Memory Efficient** - Only active features consume resources
- **Real-Time Updates** - No page refresh required for settings changes
- **Error Isolation** - Feature failures don't affect other features
- **ResourceTracker Integration** - Automatic cleanup and memory management

---

## 🖼️ Windows Manager System

### Overview
The Windows Manager has been refactored into a **decoupled, event-driven architecture**. The legacy approach of direct DOM manipulation has been completely removed. The system is now split into a pure business logic layer and a reactive UI layer, communicating via an event bus. This provides better performance, maintainability, and a clean separation of concerns.

See [Windows Manager Documentation](WINDOWS_MANAGER.md) for complete details.

### Architecture

**1. Logic Layer (`WindowsManager.js`):**
- Acts as a **headless business logic controller**.
- It receives requests to show a translation icon or window.
- It contains the logic to decide what to show and where, but does **not** render anything.
- It emits events (e.g., `show-window`, `show-icon`) to the event bus with the necessary data (text, initial position, etc.).

**2. UI Layer (`ContentApp.vue` and children):**
- A host Vue application (`ContentApp.vue`) runs in the content script.
- It listens for events from the `WindowsManager`.
- Based on events, it dynamically mounts or unmounts the corresponding Vue components: `TranslationWindow.vue` or `TranslationIcon.vue`.
- All rendering, styling, positioning, animations, and user interactions (like drag-and-drop) are handled entirely within these Vue components.

**System Flow:**
```
TextSelectionManager → WindowsManager (Logic)
    ↓
EventBus.emit('show-window', data)
    ↓
ContentApp.vue (UI Host)
    ↓ (Listens for event)
Mounts <TranslationWindow :data="data" />
    ↓
TranslationWindow.vue handles all UI and interactions
```

### Key Features
- **Decoupled Architecture**: Logic and UI are completely separate, communicating only through events.
- **Reactive Vue UI**: The entire UI is managed by stateful Vue components, leading to more predictable and performant rendering.
- **Event-Driven Communication**: Ensures low coupling between system parts.
- **Cross-Frame Support**: The logic layer coordinates interactions with iframes, while the UI is rendered by the top-level host.
- **Component-Owned Interactions**: Complex features like drag-and-drop, theme switching, and animations are managed locally by the `TranslationWindow.vue` component, simplifying state management.

---

## 🖥️ UI Host System

### Overview
The UI Host System is a critical architectural component that acts as a **centralized Vue application (`ContentApp.vue`)** for managing all in-page UI elements. It operates entirely within a **Shadow DOM**, ensuring complete CSS and JavaScript isolation from the host webpage.

See [UI Host System Documentation](docs/UI_HOST_SYSTEM.md) for complete details.

### Key Responsibilities
- **UI Rendering**: Manages the lifecycle of all UI components injected into a webpage, such as translation windows, icons, selection toolbars, and notifications.
- **Event-Driven**: Uses a dedicated event bus (`PageEventBus`) to receive commands from headless logic controllers (like `WindowsManager` and `NotificationManager`).
- **State Management**: Holds the state for the in-page UI, such as which components are currently visible and their properties.

### Benefits
- **Total Isolation**: Shadow DOM prevents any CSS from the host page from affecting the extension's UI, and vice-versa.
- **Maintainability**: Having a single entry point for all in-page UI simplifies development, debugging, and testing.
- **Consistency**: Ensures all UI elements across the extension share a consistent look, feel, and behavior.

---

## 📝 Text Actions System

### Overview
The Text Actions System provides a unified interface for copy, paste, and TTS operations throughout the extension. See [Text Actions Documentation](TEXT_ACTIONS_SYSTEM.md) for complete details.

**Architecture:**
```
src/components/shared/actions/
├── ActionToolbar.vue     # Main toolbar component
├── ActionGroup.vue       # Action grouping
├── CopyButton.vue        # Copy functionality
├── PasteButton.vue       # Paste functionality
└── TTSButton.vue         # Text-to-speech

src/composables/actions/
├── useTextActions.js     # Main composable
├── useCopyAction.js      # Copy operations
├── usePasteAction.js     # Paste operations
└── useTTSAction.js       # TTS operations
```

**Key Features:**
- **Vue Integration**: Reactive components and composables
- **Cross-Context Support**: Works in popup, sidepanel, and content scripts
- **Error Handling**: Comprehensive error management
- **Performance Optimization**: Lazy loading and efficient operations

---

## 🔊 TTS (Text-to-Speech) System

### Overview
A **fully unified, stateful TTS system** with complete Play/Pause/Resume/Stop controls and exclusive playback across all extension contexts. The system has been **completely unified (2025)** around a single composable that eliminates all duplicate implementations. See [TTS System Documentation](TTS_SYSTEM.md) for complete details.

**✅ Unified Architecture (2025):**
- **Single Source of Truth**: `useTTSSmart.js` - The only TTS composable used across all contexts
- **Zero Duplicate Code**: Eliminated 600+ lines of redundant `TTSManager.js` implementation
- **Language Fallback System**: Automatic mapping for unsupported languages (Persian→Arabic, Kurdish→Arabic, etc.)
- **Cross-Context Coordination**: Perfect synchronization between Popup, Sidepanel, and WindowsManager
- **UnifiedMessaging Integration**: Intelligent timeout management (20s for TTS operations)

**Core Components:**
- **`useTTSSmart.js`**: The unified composable managing 5 states (`idle`, `loading`, `playing`, `paused`, `error`)
- **`TTSButton.vue`**: Smart UI component with rich visual feedback and progress indicators
- **`TTSGlobalManager`**: Singleton enforcing exclusive playback and lifecycle management
- **Language Fallback System**: Automatic language mapping for enhanced compatibility

**Unified System Flow:**
```
All UI Components (Popup/Sidepanel/WindowsManager)
    ↓ (Single unified interface)
useTTSSmart.js - SINGLE SOURCE OF TRUTH
    ↓ (UnifiedMessaging with intelligent timeouts)
Background Handlers → Language fallbacks → Error recovery
    ↓ (Browser-specific execution)
Cross-Browser Audio Playback (Chrome: Offscreen, Firefox: Direct)
```

**Key Features:**
- **Complete Unification**: All TTS functionality consolidated in `useTTSSmart.js`
- **Universal Language Support**: Automatic fallback system (fa→ar, ku→ar, ps→ar, etc.)
- **Exclusive Playback**: Only one audio stream at a time across all contexts
- **Smart Lifecycle**: Context-aware audio management (Popup stops on close, Sidepanel persists)
- **Advanced Error Recovery**: Built-in retry mechanisms with fallback language support
- **Rich UI Feedback**: 5-state visual system with circular progress indicators
- **Cross-Browser Compatibility**: Seamless Chrome (Offscreen) and Firefox (Direct) support

**Benefits of Complete Unification (2025):**
- **🎯 Single Composable**: Zero duplicate implementations across codebase
- **🚀 Performance**: 600+ lines of redundant code eliminated
- **🌍 Language Support**: All languages work through intelligent fallback mapping
- **🔧 Maintainability**: Single system to debug and enhance
- **📱 Consistency**: Identical TTS experience across all extension contexts

---

## 🖼️ IFrame Support System

### Overview
Streamlined iframe support system that provides essential iframe functionality while maintaining compatibility with existing Vue.js, ResourceTracker, Error Management, and Smart Messaging systems. The system has been simplified to include only actively used components. See [IFrame Support Documentation](../features/iframe-support/README.md) for complete details.

**Key Features:**
- **Essential Frame Management**: IFrameManager for frame registration and tracking
- **ResourceTracker Integration**: Automatic memory management and cleanup for iframe resources
- **Vue Composables**: Simple reactive iframe detection and positioning utilities
- **Frame Registry**: Robust frame registration with corruption protection
- **SelectElement Support**: Fixed to work properly in iframes with immediate UI deactivation

**Core Components:**
- **`IFrameManager.js`**: Core iframe management extending ResourceTracker
- **`FrameRegistry.js`**: Frame registration and mapping system (via WindowsManager)
- **`useIFrameSupport.js`**: Simplified Vue composables for iframe functionality

**System Flow:**
```
Content Script Detection → IFrameManager → Frame Registration
    ↓
ResourceTracker Cleanup → SmartMessaging Integration
    ↓
Vue UI Host → Event-Based Communication → SelectElement Support
```

**Integration Benefits:**
- **Zero Memory Leaks**: Full ResourceTracker integration
- **Immediate UI Feedback**: SelectElement deactivates instantly in iframes
- **Clean Logging**: Debug-level multi-frame context messages
- **Error Handling**: Centralized error management with ExtensionContextManager
- **Lightweight**: Only essential components, ~80% less code than original implementation

---

## 📺 Subtitle Translation System

### Overview
Advanced subtitle translation system for online videos (YouTube, streaming platforms) with real-time processing and overlay display.

**Key Features:**
- **Real-Time Translation**: Live subtitle translation as video plays
- **Multiple Video Platforms**: YouTube, streaming services, and embedded videos
- **Overlay Display**: Non-intrusive subtitle overlay on videos
- **State Management**: Enable/disable per video or globally
- **Timing Synchronization**: Maintains original subtitle timing

**Core Components:**
- `src/store/modules/subtitle.js` - Subtitle state management
- `src/background/handlers/subtitle/` - Subtitle processing handlers
- `src/components/feature/SubtitleTranslationPanel.vue` - Control panel

**System Flow:**
```
Video Subtitle Detection → Content Script Processing
    ↓
Background Handler → Translation Provider → Overlay Rendering
    ↓
Vue Store Update → UI State Sync
```

**Background Handlers:**
- `handleSubtitleTranslate.js` - Process subtitle translation requests
- `handleSubtitleStatus.js` - Get current subtitle translation status
- `handleSubtitleToggle.js` - Enable/disable subtitle translation

---

## 💾 Storage Manager System

### Overview
Centralized storage management with intelligent caching and event system. See [Storage Manager Documentation](STORAGE_MANAGER.md) for complete details.

**Core Components:**
- `StorageManager` - Main singleton class with cache and events
- `useStorage` - Vue composable for reactive storage
- `useStorageItem` - Single-item reactive storage
- Enhanced `useBrowserAPI` - Storage integration

**Key Features:**
- **Intelligent Caching**: Reduces browser.storage API calls
- **Event System**: Reactive updates across components
- **Vue Integration**: Reactive composables with lifecycle management
- **Performance Optimization**: Memory management and efficient operations

**Usage Pattern:**
```javascript
// Direct usage
const data = await storageManager.get(['key1', 'key2'])
await storageManager.set({ key1: 'value1' })

// Vue composable
const { data, save } = useStorage(['API_KEY', 'PROVIDER'])
```

---

## ⚠️ Error Management System

### Overview
Unified error handling system with extension context awareness. See [Error Management Documentation](ERROR_MANAGEMENT_SYSTEM.md) for complete details.

**Core Components:**
- `ExtensionContextManager` - Extension context validation and safe operations
- `ErrorHandler` - Centralized error processing (singleton)
- `ErrorTypes` & `ErrorMessages` - Error classification and localization
- Vue error boundaries - App-level error handling

**Key Features:**
- **Extension Context Safety**: Graceful handling of context invalidation
- **Silent Error Handling**: Extension context errors handled silently
- **UI Integration**: Toast notifications and error state management
- **Safe Operations**: Wrappers for context-sensitive operations

**Usage Pattern:**
```javascript
// Check context before operations
if (ExtensionContextManager.isValidSync()) {
  // Safe to proceed
}

// Handle errors centrally
await ErrorHandler.getInstance().handle(error, {
  context: 'component-name',
  showToast: true
})

// Safe messaging
const result = await ExtensionContextManager.safeSendMessage(message, context)
```

---

## 📊 Logging System

### Overview
Modern structured logging with environment awareness and performance optimization. See [Logging System Documentation](LOGGING_SYSTEM.md) for complete details.

**API:**
- **Single Interface**: `getScopedLogger(component, subComponent)` only
- **Component-Based**: Organized by categories with individual levels
- **Performance Features**: Lazy evaluation and level gating
- **Environment Aware**: Development vs production behavior

**Usage Pattern:**
```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

// Component-specific logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

// In Vue component
onMounted(() => {
  logger.init('TranslationBox mounted')
})

// In composable
const performAction = async () => {
  logger.debug('Starting action')
  try {
    const result = await action()
    logger.info('Action completed successfully', { duration: performance.now() })
    return result
  } catch (error) {
    logger.error('Action failed', error)
    throw error
  }
}
```

**Key Features:**
- **Zero Legacy Code**: Fully migrated modern API
- **Memory Efficient**: Cached logger instances
- **Cross-Browser Compatible**: Works in all extension contexts
- **Production Optimized**: Level checking prevents unnecessary work

---

## 🚀 Performance Benefits

### Unified Messaging Results
- ✅ **Eliminated race conditions** between competing listeners
- ✅ **Action-specific timeouts** prevent unnecessary delays
- ✅ **Centralized error handling** with ExtensionContextManager
- ✅ **Context isolation** prevents message conflicts
- ✅ **50% reduction** in messaging complexity
- ✅ **Single responsibility** handler architecture
- ✅ **Improved reliability** through unified system
- ✅ **Simplified** debugging and maintenance

### Best Practices
- **Unified messaging** for race-condition-free communication
- **Action-specific timeouts** ensure optimal performance
- **Context-specific handlers** prevent message conflicts
- **Lazy loading** of providers and components
- **Efficient state management** with Pinia

---

## 🔍 Development Guide

### Adding New Provider
1. Create provider class extending `BaseProvider`
2. Register in `ProviderFactory`
3. Add configuration to settings store
4. Test with `TranslationEngine`

### Adding New Message Handler
1. Create handler in appropriate `handlers/` directory
2. Register in `LifecycleManager`
3. Add corresponding action to `MessageActions.js`
4. Test with `useMessaging` composable

### Debugging
- Use browser DevTools extension debugging
- Check `[Messaging]` logs in console
- Verify message format with `MessageFormat.validate()`

---

## 🎯 Development Workflow

### For New Features
1. **Plan**: Identify which systems are involved (Vue components, stores, background handlers, etc.)
2. **Design**: Create composables for business logic, components for UI
3. **Implement**: Follow the integration patterns outlined above
4. **Test**: Verify cross-browser compatibility and error handling
5. **Document**: Update relevant documentation files

### For Bug Fixes
1. **Identify**: Use logging system to trace the issue across systems
2. **Isolate**: Determine if it's Vue-specific, background-specific, or cross-system
3. **Fix**: Apply fix using appropriate error handling patterns
4. **Verify**: Test in all supported browsers and contexts

### For Architecture Changes
1. **Review**: Understand impact across all integrated systems
2. **Plan**: Update multiple systems coherently
3. **Migrate**: Use composables and stores to isolate changes
4. **Validate**: Ensure all documentation remains accurate

---

**Architecture Status: ✅ Fully Modernized with Vue.js**

This architecture provides a **comprehensive, modular, and scalable** foundation for the translation extension with:

- **🎯 Complete Vue.js Integration**: Reactive components, composables, and Pinia stores
- **🔧 Modular Design**: 18+ specialized systems working together seamlessly  
- **🖼️ Streamlined IFrame Support**: Essential iframe functionality with ResourceTracker integration and simplified architecture
- **⚡ Performance Optimized**: Intelligent caching, lazy loading, and efficient data flow
- **🛡️ Production Ready**: Comprehensive error handling, logging, and context safety
- **🌐 Cross-Browser Compatible**: Chrome and Firefox compatibility with automatic detection
- **📚 Well Documented**: Complete documentation for every system and integration pattern
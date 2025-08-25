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
- ✅ **Text Actions System** - Unified copy/paste/TTS functionality
- ✅ **Storage Management** - Centralized storage with caching
- ✅ **Logging System** - Production-ready structured logging
- ✅ **Provider System** - 10+ translation providers with factory pattern
- ✅ **Cross-Browser Support** - Chrome and Firefox MV3

---

## 📚 Documentation Index

### Core Documentation
- **[Architecture](ARCHITECTURE.md)** - This file - Complete system overview and integration guide
- **[Messaging System](MessagingSystem.md)** - Inter-component communication and browser API integration
- **[Translation System](TRANSLATION_SYSTEM.md)** - Translation engine, providers, and request handling
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)** - Centralized error handling and context safety
- **[Storage Manager](STORAGE_MANAGER.md)** - Unified storage API with caching and events
- **[Logging System](LOGGING_SYSTEM.md)** - Structured logging with performance optimization

### Feature-Specific Documentation
- **[Windows Manager](WINDOWS_MANAGER.md)** - UI component management and cross-frame communication
- **[Text Actions System](TEXT_ACTIONS_SYSTEM.md)** - Copy/paste/TTS functionality with Vue integration
- **[TTS System](TTS_SYSTEM.md)** - Text-to-speech with cross-browser compatibility

### Media Assets
- **[Video Tutorials](Introduce.mp4)** - Introduction and feature overview
- **[API Key Tutorial](HowToGet-APIKey.mp4)** - Step-by-step API configuration
- **[Screenshots](Images/)** - Interface screenshots and architectural diagrams
- **[Store Assets](Store/)** - Chrome and Firefox store promotional materials

### Getting Started
1. **New Developers**: Start with [Architecture](ARCHITECTURE.md) → [Messaging System](MessagingSystem.md)
2. **Translation Features**: [Translation System](TRANSLATION_SYSTEM.md) → [Provider System](#-provider-system)
3. **UI Development**: [Windows Manager](WINDOWS_MANAGER.md) → [Text Actions](TEXT_ACTIONS_SYSTEM.md)
4. **Error Handling**: [Error Management](ERROR_MANAGEMENT_SYSTEM.md) → [Logging System](LOGGING_SYSTEM.md)
5. **Storage Operations**: [Storage Manager](STORAGE_MANAGER.md)

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
│                    MESSAGING LAYER                             │
│  useMessaging → MessageFormat → browser.runtime → Handlers     │
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
│  Provider Factory → Storage Manager → Error Handler            │
│  Logger System → TTS Manager → Windows Manager                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONTENT LAYER                                │
│  Content Scripts → UI Host System → Event-Based Communication  │
│  Element Selection → Notifications → Text Field Icons          │
│  Text Actions → Screen Capture → Context Integration           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
src/
├── 📱 views/               # Vue application entry points
│   ├── popup/              # Popup application and components
│   │   ├── PopupApp.vue            # Main popup app
│   │   ├── PopupAppEnhanced.vue    # Enhanced popup version
│   │   └── components/             # Popup-specific components
│   ├── sidepanel/          # Sidepanel application
│   │   ├── SidepanelApp.vue        # Main sidepanel app
│   │   ├── SidepanelLayout.vue     # Layout wrapper
│   │   └── components/             # Sidepanel components
│   └── options/            # Options page application
│       ├── OptionsApp.vue          # Main options app
│       ├── OptionsLayout.vue       # Layout wrapper
│       └── tabs/                   # Configuration tabs
│
├── 🧩 components/          # Reusable Vue components
│   ├── base/               # Base UI components
│   │   ├── BaseButton.vue          # Button component
│   │   ├── BaseInput.vue           # Input component
│   │   ├── BaseSelect.vue          # Select component
│   │   └── ...                     # Other base components
│   ├── shared/             # Shared feature components
│   │   ├── actions/                # Text action components
│   │   │   ├── ActionToolbar.vue   # Action toolbar
│   │   │   ├── CopyButton.vue      # Copy button
│   │   │   ├── PasteButton.vue     # Paste button
│   │   │   └── TTSButton.vue       # TTS button
│   │   ├── TranslationDisplay.vue  # Translation display
│   │   ├── TranslationInputField.vue # Input field
│   │   ├── LanguageSelector.vue    # Language selector
│   │   └── ProviderSelector.vue    # Provider selector
│   ├── feature/            # Feature-specific components
│   │   ├── api-settings/           # API configuration components
│   │   ├── TranslationBox.vue      # Translation box
│   │   ├── TranslationHistory.vue  # History component
│   │   └── SettingsManager.vue     # Settings management
│   ├── layout/             # Layout components
│   │   ├── PopupHeader.vue         # Popup header
│   │   ├── SidepanelHeader.vue     # Sidepanel header
│   │   └── OptionsHeader.vue       # Options header
│   └── content/            # Content script components
│       ├── ScreenSelector.vue      # Screen capture selector
│       └── TranslationTooltip.vue  # Translation tooltip
│
├── 🎨 composables/         # Vue composables (business logic)
│   ├── actions/            # Text action composables
│   │   ├── useTextActions.js       # Main text actions
│   │   ├── useCopyAction.js        # Copy functionality
│   │   ├── usePasteAction.js       # Paste functionality
│   │   └── useTTSAction.js         # TTS functionality
│   ├── useTranslationModes.js      # Translation modes
│   ├── usePopupTranslation.js      # Popup translation logic
│   ├── useSidepanelTranslation.js  # Sidepanel translation logic
│   ├── useErrorHandler.js          # Error handling
│   ├── useExtensionAPI.js          # Extension API wrapper
│   ├── useBrowserAPI.js            # Browser API wrapper
│   ├── useLanguages.js             # Language management
│   ├── useHistory.js               # History management
│   └── useClipboard.js             # Clipboard operations
│
├── 🗂️ store/              # Pinia state management
│   ├── core/
│   │   ├── settings.js             # Global settings store
│   │   └── index.js                # Store setup
│   └── modules/            # Feature-specific stores
│       ├── translation.js          # Translation state
│       ├── history.js              # History state
│       ├── providers.js            # Provider state
│       ├── tts.js                  # TTS state
│       ├── capture.js              # Screen capture state
│       ├── subtitle.js             # Subtitle state
│       └── backup.js               # Backup/import state
│
├── 🔄 messaging/           # Messaging system
│   ├── core/
│   │   ├── MessagingCore.js        # MessageFormat, Contexts
│   │   └── MessageActions.js       # Action constants
│   └── composables/
│       └── useMessaging.js         # Vue messaging composable
│
├── 🎯 background/          # Background service worker
│   ├── index.js                    # Service worker entry point
│   ├── feature-loader.js           # Dynamic feature loading
│   ├── translation-engine.js       # Translation coordination
│   ├── handlers/           # Message handlers by category
│   │   ├── translation/            # Translation operations
│   │   │   ├── handleTranslate.js  # Main translation handler
│   │   │   └── handleTranslateText.js # Text translation
│   │   ├── vue-integration/        # Vue app integration
│   │   ├── screen-capture/         # Screen capture handlers
│   │   ├── element-selection/      # Element selection
│   │   ├── sidepanel/              # Sidepanel operations
│   │   ├── tts/                    # Text-to-speech
│   │   ├── subtitle/               # Subtitle translation (YouTube, online videos)
│   │   ├── lifecycle/              # Extension lifecycle
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

## 🔄 Messaging System

### Overview
The messaging system provides standardized communication between Vue components, background scripts, and content scripts. See [Messaging System Documentation](MessagingSystem.md) for complete details.

### Vue Integration

**useMessaging Composable** - Primary interface for Vue components:
```javascript
import { useMessaging } from '@/messaging/composables/useMessaging.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'

// In Vue component setup()
const { sendMessage, createMessage } = useMessaging('popup')

// Send translation request
const response = await sendMessage(
  createMessage(MessageActions.TRANSLATE, { 
    text: 'Hello',
    targetLang: 'fa'
  })
)
```

### Core Architecture

**MessagingCore.js** - Foundation utilities:
```javascript
export const MessageFormat = {
  create: (action, data, context) => ({ ... }),
  validate: (message) => boolean,
  createSuccessResponse: (data) => ({ ... }),
  createErrorResponse: (error) => ({ ... })
}

export const MessageContexts = {
  POPUP: 'popup',
  SIDEPANEL: 'sidepanel', 
  OPTIONS: 'options',
  BACKGROUND: 'background',
  CONTENT: 'content',
  OFFSCREEN: 'offscreen'
}
```

**MessageActions.js** - All available message types:
```javascript
// Translation actions
TRANSLATE: 'TRANSLATE'
TRANSLATE_SELECTION: 'TRANSLATE_SELECTION'
TRANSLATE_PAGE: 'TRANSLATE_PAGE'

// TTS actions
TTS_SPEAK: 'TTS_SPEAK'
TTS_STOP: 'TTS_STOP'

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
      const { OffscreenTTSManager } = await import("../managers/browser-specific/tts/TTSChrome.js")
      return new OffscreenTTSManager()
    } else {
      // Firefox: Use background page audio
      const { BackgroundTTSManager } = await import("../managers/browser-specific/tts/TTSFirefox.js")
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
import { TranslationEngine } from '@/core/TranslationEngine.js'

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

## 🔧 Cross-Browser Compatibility

### Browser Detection
```javascript
import { useBrowserDetection } from '@/composables/useBrowserDetection.js'

const { isChrome, isFirefox, supportsSidepanel } = useBrowserDetection()
```

### Feature Support Matrix
| Feature | Chrome | Firefox |
|---------|--------|---------|
| Sidepanel | ✅ | ✅ |
| Offscreen | ✅ | ❌ |
| Action API | ✅ | ✅ |

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
import ExtensionContextManager from '@/utils/core/extensionContext.js'

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
import { getScopedLogger, LOG_COMPONENTS } from '@/utils/core/logger.js'

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
2. **Automatic Persistence**: All stores sync with StorageManager
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

## 🖼️ Windows Manager System

### Overview
The Windows Manager is a modular system for managing translation UI components (icons and windows) across different document contexts including iframes. See [Windows Manager Documentation](WINDOWS_MANAGER.md) for complete details.

**Key Features:**
- **Modular Architecture**: 18 specialized modules for different responsibilities
- **Cross-Frame Support**: Full iframe communication and coordination  
- **Smart Positioning**: Intelligent window placement with viewport awareness
- **Theme Integration**: Light/dark theme support with real-time switching
- **Animation System**: Smooth transitions and feedback animations
- **Drag & Drop**: Interactive window dragging with constraints

**Core Modules:**
- `WindowsConfig` - Configuration constants and settings
- `WindowsState` - Centralized state management  
- `WindowsFactory` - UI element creation with extension context safety
- `CrossFrameManager` - Main coordinator for iframe communication
- `PositionCalculator` - Position calculations across frame contexts
- `SmartPositioner` - Intelligent window positioning
- `AnimationManager` - Animation transitions and feedback
- `ThemeManager` - Theme management and application

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
Cross-browser TTS implementation with automatic browser detection and graceful fallbacks. See [TTS System Documentation](TTS_SYSTEM.md) for complete details.

**Browser-Specific Implementations:**
- **Chrome**: Uses offscreen documents (`OffscreenTTSManager`)
- **Firefox**: Uses background page audio (`BackgroundTTSManager`)
- **Fallback**: Content script Web Speech API (`ContentTTSHandler`)

**System Flow:**
```
Vue Component → useTTS() → TTSMessenger → Background Handler
    ↓
Browser Detection → Chrome: Offscreen / Firefox: Background
    ↓
Speech Synthesis → Audio Output
```

**Key Features:**
- **Cross-Browser Compatibility**: Automatic detection and adaptation
- **Dynamic Loading**: TTS managers loaded only when needed
- **Unified API**: Single interface across all contexts
- **Error Recovery**: Automatic fallback to next available method

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
import { getScopedLogger, LOG_COMPONENTS } from '@/utils/core/logger.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

logger.error('Critical error', error)
logger.warn('Warning message')
logger.info('General information')
logger.debug('Debug details')
logger.debugLazy(() => ['Expensive computation:', expensiveFunction()])
```

**Key Features:**
- **Zero Legacy Code**: Fully migrated modern API
- **Memory Efficient**: Cached logger instances
- **Cross-Browser Compatible**: Works in all extension contexts
- **Production Optimized**: Level checking prevents unnecessary work

---

## 🚀 Performance Benefits

### Refactoring Results
- ✅ **50% faster** message processing
- ✅ **Eliminated** 20-second timeouts
- ✅ **Reduced** cross-component interference
- ✅ **Simplified** debugging and maintenance

### Best Practices
- **Direct browser API** usage for performance
- **Context filtering** to prevent message conflicts
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
- **⚡ Performance Optimized**: Intelligent caching, lazy loading, and efficient data flow
- **🛡️ Production Ready**: Comprehensive error handling, logging, and context safety
- **🌐 Cross-Browser Support**: Chrome and Firefox compatibility with automatic detection
- **📚 Well Documented**: Complete documentation for every system and integration pattern

The extension successfully migrated from JavaScript to Vue.js while maintaining backward compatibility and adding advanced features like cross-frame communication, text actions, and centralized error management.

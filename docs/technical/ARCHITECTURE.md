# Translate-It Extension Architecture

## Overview

**Modern Vue.js browser extension** for AI-powered translation with comprehensive cross-platform support. Built with a modular architecture and advanced state management, it seamlessly operates across:

- **Browsers**: Full compatibility with **Chrome** and **Firefox** using **Manifest V3**.
- **Platforms**: Robust support for **Desktop**, **Mobile (Android)**, and **ChromeOS**.
- **Environments**: Optimized for both **Standard Desktop** and **Touch-First** interfaces.
- **Architecture**: AI-powered core with 18+ specialized modules and robust error handling.

---

## Documentation Index

### Core Documentation
- **[Architecture](ARCHITECTURE.md)** - This file - Complete system overview and integration guide
- **[Messaging System](MessagingSystem.md)** - Race-condition-free inter-component communication with intelligent timeout management and Unified Translation Service integration
- **[Translation System](TRANSLATION_SYSTEM.md)** - Unified Translation Service architecture with centralized coordination, duplicate prevention, and intelligent result routing
- **[Provider Implementation Guide](PROVIDERS.md)** - Complete guide for implementing translation providers with BaseProvider, RateLimitManager, and Circuit Breaker
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)** - Centralized error handling and context safety
- **[Testing Strategy](TESTING_STRATEGY.md)** - Guidelines and roadmap for unit and integration testing
- **[Storage Manager](STORAGE_MANAGER.md)** - Unified storage API with caching and events
- **[Logging System](LOGGING_SYSTEM.md)** - Structured logging with performance optimization
- **[Memory Garbage Collector](MEMORY_GARBAGE_COLLECTOR.md)** - Advanced memory management system with Critical Protection for essential resources
- **[Proxy System](PROXY_SYSTEM.md)** - Extension-only proxy system with Strategy Pattern for accessing geo-restricted translation services
- **[Toast Integration System](TOAST_INTEGRATION_SYSTEM.md)** - Comprehensive Vue Sonner toast integration with actionable notifications and event-driven architecture
- **[CSS Architecture](CSS_ARCHITECTURE.md)** - Modern principled CSS with Grid layout, containment, safe variable functions, and future-proof SCSS patterns
- **[CSS Variables Guide](CSS_VARIABLES_GUIDE.md)** - Comprehensive guide for using and extending CSS variables
- **[Component-Adjacent SCSS](COMPONENT_ADJACENT_SCSS.md)** - Rules for managing component-specific styles
- **[Element Detection Service](ELEMENT_DETECTION_SERVICE.md)** - Centralized element detection system with optimized DOM queries and caching
- **[Language Detection](LANGUAGE_DETECTION.md)** - Hierarchical language and direction detection system with provider feedback loop
- **[Localization](LOCALIZATION.md)** - Guide for internationalization and locale management
- **[Stats Manager](STATS_MANAGER.md)** - System for tracking usage statistics and analytics
- **[Translation Provider Logic](TRANSLATION_PROVIDER_LOGIC.md)** - Detailed waterfall logic for provider selection

### Feature-Specific Documentation
- **[Smart Handler Registration System](SMART_HANDLER_REGISTRATION_SYSTEM.md)** - Dynamic feature lifecycle management with exclusion logic
- **[Windows Manager Integration](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md)** - Guide for the event-driven integration with the UI Host
- **[Text Actions System](TEXT_ACTIONS_SYSTEM.md)** - Copy/paste/TTS functionality with Vue integration
- **[TTS System](TTS_SYSTEM.md)** - Advanced Text-to-Speech with stateful Play/Pause/Resume controls
- **[Text Selection System](TEXT_SELECTION_SYSTEM.md)** - Static import system, site handler registry, professional editor support with drag detection
- **[Selection Coordinator](SELECTION_COORDINATOR.md)** - Pub/Sub model for selection events between managers (Windows, FAB, TTS)
- **[UI Host System](UI_HOST_SYSTEM.md)** - Centralized Shadow DOM UI management
- **[Whole Page Translation System](WHOLE_PAGE_TRANSLATION.md)** - Recursive translation of web pages with dynamic batching
- **[Select Element System](SELECT_ELEMENT_SYSTEM.md)** - System for selecting and translating DOM elements
- **[Screen Capture System](SCREEN_CAPTURE_SYSTEM.md)** - Interactive area capture with Tesseract.js OCR engine
- **[Subtitle Translation System](SUBTITLE_TRANSLATION_SYSTEM.md)** - Standalone tool for translating `.srt` subtitle files with format preservation and progressive batching
- **[Mouse Hover System](MOUSE_HOVER_SYSTEM.md)** - High-performance "zero-click" translation with word/sentence/container detection
- **[Options Page Documentation](OPTIONS_PAGE.md)** - Guide for configuration hub and settings application logic
- **[Optimization Levels](OPTIMIZATION_LEVELS.md)** - Strategy for balancing speed vs. cost in translations
- **[IFrame Support System](../../src/features/iframe-support/README.md)** - Streamlined iframe functionality with essential components and Vue integration
- **[Mobile Support System](MOBILE_SUPPORT.md)** - Centralized Bottom Sheet architecture for mobile browsers with gesture support
- **[Desktop FAB System](DESKTOP_FAB_SYSTEM.md)** - Floating action menu for quick access to translation features on desktop

### Media Assets
- **[Video Tutorials](../guides/Introduce.mp4)** - Introduction and feature overview
- **[API Key Tutorial](../guides/HowToGet-APIKey.mp4)** - Step-by-step API configuration
- **[Screenshots](../Images/)** - Interface screenshots and architectural diagrams
- **[Store Assets](../Store/)** - Chrome and Firefox store promotional materials

### Getting Started
1. **New Developers**: Start with [Architecture](ARCHITECTURE.md) → [Messaging System](MessagingSystem.md)
2. **Feature Development**: [Smart Handler Registration](SMART_HANDLER_REGISTRATION_SYSTEM.md) → [Translation System](TRANSLATION_SYSTEM.md)
3. **Translation Features**: [Translation System](TRANSLATION_SYSTEM.md) → [Provider Implementation Guide](PROVIDERS.md)
4. **Provider Development**: [Provider Implementation Guide](PROVIDERS.md) → [Provider System](#provider-system)
5. **UI Development**: [Windows Manager Integration](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md) → [Text Actions](TEXT_ACTIONS_SYSTEM.md)
6. **Error Handling**: [Error Management](ERROR_MANAGEMENT_SYSTEM.md) → [Logging System](LOGGING_SYSTEM.md)
7. **Storage Operations**: [Storage Manager](STORAGE_MANAGER.md)

---

## Architecture Overview

<details>
<summary>View System Architecture Diagram</summary>

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                            │
│  Vue Apps (Popup/Sidepanel/Options) → Components → Composables │
│  Pinia Stores → State Management → Reactive Data               │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MESSAGING LAYER                         │
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
│  UnifiedTranslationService → TranslationRequestTracker → TranslationResultDispatcher → Provider Factory → BaseProvider (BaseTranslateProvider, BaseAIProvider) → RateLimitManager → StreamingManager │
│  Storage Manager → Error Handler → Logger System → Unified TTS System → Windows Manager → Memory Garbage Collector → Toast Integration System │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONTENT LAYER                                │
│  Content Scripts → Smart Feature Management → UI Host System   │
│  Feature-Based Registration → Dynamic Handler Lifecycle        │
│  Principled Text Selection → Element Selection → Text Field Icons → Context Integration → Toast Notifications │
└─────────────────────────────────────────────────────────────────┘
```

</details>

---

## Project Structure

<details>
<summary>View detailed project structure</summary>

```
src/
├── apps/                           # Vue Applications (Entry Points)
│   ├── popup/                      # PopupApp.vue + components
│   │   ├── PopupApp.vue            # Main popup application
│   │   └── components/             # Popup-specific components
│   ├── sidepanel/                  # SidepanelApp.vue + components  
│   │   ├── SidepanelApp.vue        # Main sidepanel application
│   │   ├── SidepanelLayout.vue     # Layout wrapper
│   │   └── components/             # Sidepanel components
│   ├── options/                    # OptionsApp.vue + tabs
│   │   ├── OptionsApp.vue          # Main options application
│   │   ├── OptionsLayout.vue       # Layout wrapper
│   │   ├── OptionsSidebar.vue      # Options sidebar
│   │   ├── About.vue               # About page
│   │   ├── components/             # Options components
│   │   └── tabs/                   # Configuration tabs
│   └── content/                    # ContentApp.vue (UI Host)
│       └── components/             # Content UI components
│
├── components/                     # Vue Components (Preserved Structure)
│   ├── base/                       # Base UI components
│   ├── shared/                     # Shared components
│   │   ├── LanguageSelector.vue    # Language selection
│   │   ├── ProviderSelector.vue    # Provider selection
│   │   ├── TranslationDisplay.vue  # Translation display
│   │   ├── TranslationInputField.vue # Input field
│   │   ├── UnifiedTranslationInput.vue # Unified input
│   │   └── TTSButton.vue           # TTS controls
│   ├── feature/                    # Feature-specific components
│   │   └── api-settings/           # API configuration
│   ├── layout/                     # Layout components
│   ├── popup/                      # Popup components
│   └── content/                    # Content script components
│
├── composables/                    # Vue Composables (Reorganized)
│   ├── core/                       # useExtensionAPI, useBrowserAPI
│   │   ├── useDirectMessage.js     # Direct messaging
│   │   └── useExtensionAPI.js      # Extension API wrapper
│   ├── ui/                         # useUI, usePopupResize  
│   │   ├── usePopupResize.js       # Popup resizing
│   │   └── useUI.js                # UI state management
│   └── shared/                     # Other shared composables
│       ├── useClipboard.js         # Clipboard operations
│       ├── useErrorHandler.js      # Error handling
│       ├── useI18n.js              # Internationalization
│       ├── useLanguages.js         # Language management
│       └── useUnifiedI18n.js       # Unified i18n
│
├── features/                       # Feature-Based Organization
│   ├── translation/
│   │   ├── core/                   # TranslationEngine, ProviderFactory, StreamingManager
│   │   │   └── translation-engine.js # Translation coordination
│   │   ├── handlers/               # handleTranslate.js, handleTranslationResult.js
│   │   ├── stores/                 # translation.js store
│   │   ├── composables/            # useTranslation, useTranslationModes
│   │   ├── providers/              # Provider system (see below)
│   │   │   ├── ProviderFactory.js  # Provider factory
│   │   │   ├── ProviderRegistry.js # Provider registration
│   │   │   ├── BaseProvider.js     # Base provider class
│   │   │   └── implementations/    # Google, OpenAI, DeepSeek, etc.
│   │   ├── services/               # Unified Translation Service integration
│   │   └── utils/                  # Translation utilities
│   ├── tts/                        # UNIFIED TTS SYSTEM
│   │   ├── handlers/               # TTS background handlers
│   │   ├── composables/            # useTTSSmart.js - SINGLE SOURCE OF TRUTH
│   │   └── core/                   # TTSGlobalManager - exclusive playback coordination
│   ├── screen-capture/
│   │   ├── handlers/               # Background capture handlers
│   │   ├── stores/                 # capture.js store
│   │   ├── composables/            # useScreenCapture
│   │   ├── managers/               # Capture managers
│   │   └── utils/                  # Image processing
│   ├── element-selection/
│   │   ├── managers/               # SelectElementManager
│   │   ├── handlers/               # SelectElementHandler
│   │   └── utils/                  # Selection utilities
│   ├── text-selection/
│   │   └── handlers/               # TextSelectionHandler
│   ├── text-field-interaction/
│   │   ├── managers/               # TextFieldIconManager
│   │   └── handlers/               # TextFieldIconHandler
│   ├── mouse-hover/
│   │   ├── HoverTranslationManager.js # Central orchestrator
│   │   ├── HoverTextDetector.js    # Intelligence engine
│   │   └── components/             # Hover-specific components
│   ├── shortcuts/
│   │   └── handlers/               # ShortcutHandler
│   ├── exclusion/
│   │   ├── core/                   # ExclusionChecker
│   │   └── composables/            # useExclusionChecker
│   ├── text-actions/
│   │   ├── composables/            # useCopyAction, usePasteAction
│   │   └── components/             # ActionToolbar, CopyButton
│   ├── windows/
│   │   ├── managers/               # WindowsManager (business logic)
│   │   ├── handlers/               # WindowsManagerHandler
│   │   ├── components/             # TranslationWindow
│   │   ├── composables/            # useWindowsManager
│   │   └── managers/               # Position, animation, theme managers
│   ├── iframe-support/
│   │   ├── managers/               # IFrameManager (core functionality)
│   │   ├── composables/            # useIFrameSupport, useIFrameDetection (simplified)
│   │   └── README.md               # Streamlined documentation
│   ├── notifications/              # Toast Integration System
│   │   ├── NotificationSystem.js   # Main notification manager
│   │   ├── handlers/               # Event handlers
│   │   ├── types/                  # Notification types
│   │   └── index.js                # Notification exports
│   ├── history/
│   │   ├── stores/                 # history.js store
│   │   ├── composables/            # useHistory
│   │   ├── components/             # History components
│   │   └── storage/                # History storage logic
│   └── settings/
│       ├── stores/                 # settings.js store
│       ├── composables/            # Settings composables
│       └── storage/                # Settings storage
│
├── shared/                         # Shared Systems (Moved from top-level)
│   ├── messaging/                  # Unified Messaging system
│   │   ├── core/                   # MessagingCore, UnifiedMessaging, MessageHandler
│   │   ├── composables/            # useMessaging
│   │   └── toast/                  # Toast Integration System
│   │       ├── ToastIntegration.js # Main toast controller
│   │       ├── ToastEventHandler.js # Event interception
│   │       ├── ToastElementDetector.js # Element detection
│   │       ├── constants.js        # Toast configuration
│   │       └── index.js            # Toast exports
│   ├── storage/                    # Storage management
│   │   ├── core/                   # StorageCore, SecureStorage
│   │   └── composables/            # useStorage, useStorageItem
│   ├── error-management/           # Error handling
│   │   ├── ErrorHandler.js         # Main error handler
│   │   ├── ErrorMatcher.js         # Error matching
│   │   └── ErrorMessages.js        # Error messages
│   ├── logging/                    # Logging system
│   │   ├── logger.js               # Main logger
│   │   └── logConstants.js         # Log constants
│   ├── services/                   # Shared Services
│   │   ├── ElementDetectionConfig.js # Centralized selector configuration
│   │   └── ElementDetectionService.js # Optimized element detection with caching
│   └── config/                     # Configuration
│       └── config.js               # Application config
│
├── core/                           # Core Infrastructure
│   ├── background/                 # Service worker & lifecycle
│   │   ├── index.js                # Background entry point
│   │   ├── feature-loader.js       # Feature loading
│   │   ├── handlers/               # Background message handlers
│   │   └── listeners/              # Event listeners
│   ├── content-scripts/            # Content script entry (Smart Loading)
│   │   ├── index-main.js           # Main content script
│   │   ├── index-iframe.js         # IFrame content script
│   │   ├── ContentScriptCore.js    # Core loading logic
│   │   └── chunks/                 # Lazy-loaded feature chunks
│   ├── services/                   # Core Services
│   │   └── translation/            # Unified Translation Service
│   │       ├── UnifiedTranslationService.js     # Central translation coordinator
│   │       ├── TranslationRequestTracker.js     # Request lifecycle management
│   │       └── TranslationResultDispatcher.js   # Intelligent result routing
│   ├── memory/                     # Memory Garbage Collector System with Critical Protection
│   │   ├── MemoryManager.js        # Core memory management with critical resource support
│   │   ├── ResourceTracker.js      # Resource tracking mixin with critical protection
│   │   ├── SmartCache.js           # TTL-based caching
│   │   ├── GlobalCleanup.js        # Lifecycle cleanup hooks
│   │   ├── MemoryMonitor.js        # Memory usage monitoring
│   │   └── index.js                # Module exports
│   ├── managers/                   # Core managers
│   │   ├── core/                   # LifecycleManager
│   │   ├── content/                # FeatureManager, TextSelectionManager
│   │   ├── browser-specific/       # Browser-specific managers
│   │   └── context-menu.js         # Context menu management
│   ├── helpers.js                  # Core helper functions
│   ├── validation.js               # Data validation
│   ├── extensionContext.js         # Extension context management
│   └── tabPermissions.js           # Tab permissions
│
├── utils/                          # Pure Utilities (Simplified)
│   ├── browser/                    # Browser compatibility
│   ├── dom/                        # DOM utilities
│   ├── text/                       # Text processing utilities
│   ├── ui/                         # UI utilities
│   ├── i18n/                       # Internationalization utils
│   ├── rendering/                  # Rendering utilities
│   └── UtilsFactory.js             # Lazy loading utility factory
│
└── assets/                         # Static assets
    ├── icons/                      # Application icons
    ├── fonts/                      # Extension fonts
    └── styles/                     # Global styles
        ├── global.scss             # Global styles
        ├── variables.scss          # CSS variables
        └── _api-settings-common.scss # API settings styles
```

</details>

---

## Content Script Architecture (Smart Loading)

<details>
<summary>View Content Script Architecture details</summary>

### Ultra-Optimized Loading System
The content script implements an intelligent, interaction-based loading system that dramatically reduces memory usage and improves page load performance.

**Loading Strategy**:
```
Content Script Entry (index-main.js)
    ↓ (Ultra-minimal footprint - ~5KB)
ContentScriptCore (Dynamic Import)
    ↓ (Smart categorization via MainFeatureLoader)
Feature Categories:
    ├── CRITICAL: [messaging, extensionContext] - Load immediately
    ├── ESSENTIAL: [contentMessageHandler] - Load after 400ms
    ├── LAZY_UI: [vue, textSelection, mouseHover] - Load after 2.5s or on demand
    ├── INTERACTIVE: [windowsManager, selectElement, pageTranslation, screenCapture] - Load on user interaction
    └── ON_DEMAND: [shortcut, textFieldIcon] - Load after 4s or on demand
```

**Smart Loading Features**:
- **Feature Categorization**: Features grouped by priority and loading strategy
- **Interaction Detection**: Monitors user actions via `InteractionCoordinator` to trigger preloading
- **Dynamic Imports**: Code splitting with lazy-loaded chunks via `lazy-features.js`
- **Memory Optimization**: Significant memory reduction through selective loading
- **Idle Deadline Loading**: Uses `requestIdleCallback` for lower priority categories (`LAZY_UI`, `ON_DEMAND`)

**Key Components**:
- **index-main.js**: Ultra-minimal entry point with initial architecture loading
- **ContentScriptCore.js**: Core instance managing base infrastructure
- **MainFeatureLoader.js**: The brain coordinating prioritized loading stages
- **InteractionCoordinator.js**: Gatekeeper monitoring user events for interactive triggers
- **lazy-features.js**: Actual dynamic import executor and feature registry

**Loading Flow**:
1. **Critical Phase**: Load core infrastructure (Messaging, Context) immediately
2. **Essential Phase**: Load core communication handlers after 400ms
3. **Lazy UI Phase**: Load Vue and selection detection after 2.5s (uses Idle Deadline)
4. **Interactive Phase**: Load heavy features (Windows, Selection, Screen Capture) on user interaction
5. **On-Demand Phase**: Load optional features (Shortcuts, Icons) after 4s (uses Idle Deadline)

</details>

---

## Performance Optimizations

<details>
<summary>View Performance Optimization details</summary>

### Achieved Optimizations
The project has undergone significant performance improvements through advanced optimization techniques:


**Memory Optimization**:
- **Memory Reduction**: 20-30% improvement through intelligent lazy loading
- **Smart Loading**: Features load only when needed
- **Garbage Collection**: Advanced memory management with Critical Protection
- **Resource Tracking**: Automatic cleanup and memory management

**Loading Performance**:
- **Feature Loading**: Categorized loading with delays
- **Interaction Detection**: Preload based on user actions
- **Dynamic Imports**: On-demand module loading

**Architecture Benefits**:
- **Lazy Loading**: Features, languages, and utilities load on demand
- **Event-Driven**: Decoupled architecture with efficient messaging
- **Caching**: Intelligent caching strategies at multiple levels
- **Cleanup**: Automatic resource cleanup and memory management

### Optimization Techniques
1. **Advanced Code Splitting**: Sophisticated bundle splitting with lazy loading
2. **Smart Loading System**: Interaction-based feature loading
3. **Memory Management**: Garbage collection with Critical Protection
4. **Caching Strategies**: Multi-level caching for optimal performance
5. **Resource Optimization**: Efficient resource usage and cleanup

</details>

---

## Shared Systems Architecture

<details>
<summary>View Shared Systems Architecture details</summary>

<br>

<details>
<summary>Toast Integration System</summary>

### Toast Integration System
The toast integration system provides an event-driven architecture for managing actionable notifications. It uses a controller-based approach to handle toast display, event interception, and smart element detection to prevent interference with other extension features.

The system is built on four primary components:
- **ToastIntegration**: Central controller for all notification operations.
- **ToastEventHandler**: Manages interaction interceptions and callback execution.
- **ToastElementDetector**: Handles smart exclusion and detection of toast elements.
- **Constants**: Centralized configuration for selectors and behavior.

For detailed technical specifications, implementation examples, and event flow diagrams, refer to the **[Toast Integration System Documentation](TOAST_INTEGRATION_SYSTEM.md)**.

</details>

<details>
<summary>Messaging System</summary>

### Messaging System
The extension uses a unified messaging architecture that ensures reliable, race-condition-free communication between background scripts, content scripts, and Vue-based UI components.

#### Core Principles
- **Intelligent Timeout Management**: Operations are assigned specific timeouts based on their complexity (e.g., settings operations have shorter timeouts than AI-powered translations).
- **Context Isolation**: Messages are filtered by context (Popup, Sidepanel, Options, Content) to prevent cross-component interference.
- **Action-Based Routing**: A centralized handler system routes requests based on standardized actions defined in the system core.
- **Streaming Coordination**: Large data operations, such as element-by-element translations, use a specialized coordination layer for progressive updates.

#### Key Infrastructure
- **UnifiedMessaging**: The primary engine for sending messages with built-in error handling and timeout logic.
- **MessageHandler**: A robust listener system for registering and executing action-specific logic.
- **useMessaging**: A Vue composable that provides a reactive interface for component-level communication.

For implementation guides, code examples, and the complete list of message actions, refer to the **[Messaging System Documentation](MessagingSystem.md)**.

</details>

</details>

---

## Translation Service

<details>
<summary>View Translation Service details</summary>

### Overview
The **Unified Translation Service** is the central nerve center for all translation operations. It decouples the translation request from the source context (Popup, Sidepanel, Content Script), providing a unified path for processing and routing results.

### Three-Service Architecture
The system is built on three specialized services that handle different stages of the translation lifecycle:

1. **UnifiedTranslationService (Coordinator)**: The primary entry point that manages the end-to-end translation flow.
2. **TranslationRequestTracker (Lifecycle)**: Prevents duplicate requests and tracks active operations using unique `messageId` signatures.
3. **TranslationResultDispatcher (Distribution)**: Intelligently routes results back to the correct tab or component based on the translation mode (Field, Select Element, or Standard).

### Key Integration Points
- **`handleTranslate.js`**: The single background handler that initializes and delegates to the service.
- **`handleTranslationResult.js`**: Processes incoming results from providers and hands them back to the dispatcher.

### Documentation & Deep Dive
For detailed information on implementation, message formats, and streaming logic, refer to the **[Translation System Guide](TRANSLATION_SYSTEM.md)**. For the selection strategy and waterfall logic, see the **[Translation Provider Logic](TRANSLATION_PROVIDER_LOGIC.md)**.

</details>

---

## Background Service

<details>
<summary>View Background Service details</summary>

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
      const { OffscreenTTSManager } = await import("@/core/managers/browser-specific/tts/TTSChrome.js")
      return new OffscreenTTSManager()
    } else {
      // Firefox: Use background page audio
      const { BackgroundTTSManager } = await import("@/core/managers/browser-specific/tts/TTSFirefox.js")
      return new BackgroundTTSManager()
    }
  }
}
```

</details>

---

## Provider System

<details>
<summary>View Provider System details</summary>

### Layered Execution Pipeline
The provider system operates through a structured pipeline that ensures consistent results regardless of the underlying translation engine:

1. **ProviderCoordinator**: The central hub for orchestration. It handles language normalization, bilingual logic, and result cleaning.
2. **TranslationEngine**: Manages the lifecycle of translation requests and coordinates with the provider factory.
3. **Provider Factory**: Dynamically instantiates the appropriate provider based on the resolution logic.
4. **Base Classes (BaseAI / BaseTranslate)**: Provide common logic for AI-based (JSON mode, prompt injection) and traditional (batching, character limits) providers.
5. **Modular Utilities**: Specialized engines for API execution, response parsing, and text processing.

### Stability and Reliability
The architecture includes several mission-critical features to ensure high availability:

- **Multi-API Key Failover**: Supports multiple keys per provider with automatic rotation and health-based promotion.
- **Circuit Breaker**: Automatically disables unstable providers or those with exhausted quotas for a cooling period to prevent UI lag.
- **RateLimitManager**: Governs request throttling and prioritization based on user interaction levels.
- **Unified Response Contract**: Enforces a strict data format for all providers to ensure system-wide stability and prevent runtime errors.

### Documentation and Implementation
For a comprehensive guide on implementing new providers, capability gating, and technical specifications, see the **[Provider Implementation Guide](PROVIDERS.md)**. To understand how providers are selected for different features, refer to the **[Translation Provider Logic](TRANSLATION_PROVIDER_LOGIC.md)**.

</details>

---

## Vue.js State Management

<details>
<summary>View Vue.js State Management details</summary>

### Pinia Store Architecture
The extension uses Pinia for reactive state management across all Vue applications:

**Core Stores:**
```javascript
// Global settings store
import { useSettingsStore } from '@/features/settings/stores/settings.js'

const settings = useSettingsStore()
await settings.updateProvider('openai')
await settings.saveApiKey('OPENAI_API_KEY', 'sk-...')
```

**Feature-Specific Stores:**
```javascript
// Translation state
import { useTranslationStore } from '@/features/translation/stores/translation.js'
const translation = useTranslationStore()
translation.setResult(translatedText)

// History management
import { useHistoryStore } from '@/features/history/stores/history.js'
const history = useHistoryStore()
await history.addEntry(originalText, translatedText)

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

</details>

---

## Cross-System Integration Guide

<details>
<summary>View Cross-System Integration details</summary>

### Integration Patterns
The extension utilizes a consistent set of patterns to ensure seamless communication between the UI and backend systems:

- **Vue Component Integration**: Components leverage dedicated composables (e.g., `useUnifiedTranslation`) to trigger backend actions while remaining decoupled from messaging logic.
- **System Communication Flow**: Follows a strict path from Vue Component → Composable → Messaging System → Background Handler → Service Provider, with reactive updates flowing back via Pinia stores.
- **Unified Error Handling**: All modules integrate with the `ErrorHandler` to provide consistent user feedback and prevent "Extension context invalidated" crashes.
- **Reactive Storage**: State management via Pinia automatically synchronizes with `StorageManager`, ensuring data persistence and cross-context consistency.
- **Structured Logging**: Scoped loggers provide granular visibility into system behavior across all extension contexts.
- **Cross-Context Communication**: Standardized messaging protocols facilitate secure interaction between Popups, Sidepanels, and Content Scripts.

### Documentation
For implementation details and code examples, refer to the following system guides:
- **[Messaging System Documentation](MessagingSystem.md)**
- **[Error Management Documentation](ERROR_MANAGEMENT_SYSTEM.md)**
- **[Storage Manager Documentation](STORAGE_MANAGER.md)**
- **[Logging System Documentation](LOGGING_SYSTEM.md)**

</details>

---

## Vue.js Development Patterns

<details>
<summary>View Vue.js Development details</summary>

### Core Principles
- **Composable-First Logic**: All business logic and side effects are extracted into reusable composables (e.g., `useMessaging`, `useErrorHandler`) to maintain clean, declarative components.
- **State Persistence**: Features utilize Pinia stores with automatic synchronization to browser storage via the `StorageManager`.
- **Component Isolation**: Clear separation between Base UI (stateless), Shared Feature (context-agnostic), and Page-Specific (popup/sidepanel) components.
- **Event-Driven UI**: In-page elements (Windows, FAB) are managed via a central `PageEventBus` within a Shadow DOM host to ensure complete CSS and JS isolation.

### Component Guidelines
- **Base Components**: Pure, stateless UI elements that communicate solely via props and events.
- **Shared Components**: Reusable feature-specific components that encapsulate common logic (e.g., `TranslationDisplay`).
- **Layout Components**: Manage structural concerns and responsive positioning across different extension contexts.

### Documentation
For detailed information on UI hosting and in-page integration, refer to the following guides:
- **[UI Host System Documentation](UI_HOST_SYSTEM.md)**
- **[Windows Manager Integration Guide](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md)**
- **[Component Adjacent SCSS Pattern](COMPONENT_ADJACENT_SCSS.md)**

</details>

---

## Essential Files

<details>
<summary>View Essential Files details</summary>

<br>

<details>
<summary>Vue Application Entry Points</summary>

### Vue Application Entry Points
- `src/apps/popup/PopupApp.vue` - Main popup application
- `src/apps/sidepanel/SidepanelApp.vue` - Sidepanel application
- `src/apps/options/OptionsApp.vue` - Options page application

</details>

<details>
<summary>Core System Files</summary>

### Core System Files
- `src/shared/messaging/core/UnifiedMessaging.js` - Core messaging with timeout management
- `src/shared/messaging/core/UnifiedTranslationCoordinator.js` - Translation coordination
- `src/shared/messaging/core/MessageActions.js` - Message type definitions
- `src/shared/messaging/core/MessageFormat.js` - Message format utilities
- `src/shared/messaging/composables/useMessaging.js` - Vue messaging integration
- `src/core/background/index.js` - Background service worker entry
- `src/core/background/feature-loader.js` - Feature loading system
- `src/core/managers/core/LifecycleManager.js` - Central message router

</details>

<details>
<summary>Unified Translation Service</summary>

### Unified Translation Service
- `src/core/services/translation/UnifiedTranslationService.js` - Central translation coordinator
- `src/core/services/translation/TranslationRequestTracker.js` - Request lifecycle management
- `src/core/services/translation/TranslationResultDispatcher.js` - Intelligent result routing
- `src/features/translation/handlers/handleTranslate.js` - Translation request handler
- `src/features/translation/handlers/handleTranslationResult.js` - Translation result processor

</details>

<details>
<summary>Provider System</summary>

### Provider System
- `src/features/translation/providers/ProviderFactory.js` - Provider factory and management
- `src/features/translation/providers/BaseProvider.js` - Base provider interface
- `src/features/translation/providers/` - All translation provider implementations

</details>

<details>
<summary>State Management</summary>

### State Management
- `src/store/core/settings.js` - Global settings store
- `src/store/modules/translation.js` - Translation state management
- `src/shared/storage/core/StorageCore.js` - Centralized storage system

</details>

<details>
<summary>Core Systems</summary>

### Core Systems
- `src/shared/logging/logger.js` - Unified logging system
- `src/core/extensionContext.js` - Extension context management
- `src/shared/error-management/ErrorHandler.js` - Centralized error handling

</details>

<details>
<summary>Key Composables</summary>

### Key Composables
- `src/features/translation/composables/useUnifiedTranslation.js` - Unified translation logic for popup and sidepanel
- `src/composables/shared/useErrorHandler.js` - Error handling composable
- `src/features/text-actions/composables/useTextActions.js` - Text action functionality

</details>

<details>
<summary>Shared Components</summary>

### Shared Components
- `src/components/shared/TranslationDisplay.vue` - Translation result display
- `src/components/shared/TranslationInputField.vue` - Translation input
- `src/components/shared/actions/ActionToolbar.vue` - Action toolbar
- `src/components/shared/LanguageSelector.vue` - Language selection
- `src/components/shared/ProviderSelector.vue` - Provider selection

</details>

<details>
<summary>Background Handlers</summary>

### Background Handlers
- `src/features/translation/handlers/handleTranslate.js` - Main translation handler (integrated with UnifiedTranslationService)
- `src/core/background/handlers/translation/handleTranslationResult.js` - Translation result processing
- `src/core/background/handlers/vue-integration/` - Vue-specific handlers
- `src/features/tts/handlers/` - Text-to-speech handlers
- `src/features/element-selection/handlers/` - Element selection handlers

</details>

<details>
<summary>Content Scripts</summary>

### Content Scripts
- `src/core/content-scripts/index-main.js` - Main content script entry point (Top Frame)
- `src/core/content-scripts/index-iframe.js` - Lightweight content script for iframes
- `src/features/element-selection/SelectElementManager.js` - Element selection manager

</details>

</details>

---

## Smart Handler Registration System

<details>
<summary>View Smart Handler Registration details</summary>

### Overview
The smart handler registration system provides dynamic feature lifecycle management by only registering handlers when they are required by user settings and site-specific exclusion rules. This prevents unnecessary resource consumption and ensures features can be toggled in real-time without a page refresh.

### Architecture and Integration
- **InteractionCoordinator**: Acts as the gatekeeper for all content script events, managing lightweight global listeners and triggering feature loading only when a valid interaction occurs.
- **FeatureManager**: The central orchestrator for handler lifecycles, ensuring that deactivated features clean up their DOM elements and listeners while invalidating the lazy-loading cache.
- **Lazy Feature Loading**: Heavy feature modules are only imported dynamically upon interaction (e.g., selection or shortcut), keeping the initial content script overhead minimal.
- **Forced Utility Loading**: A specialized pattern that allows critical operations, such as translation reversal via the Escape key, to load even if the parent feature is disabled.
- **ExclusionChecker**: A real-time validation layer that cross-references active URLs against user-defined exclusion lists to gate feature activation.

### Documentation
For detailed information on the interaction gatekeeper, feature-to-setting mapping, and memory-safe deactivation patterns, refer to the **[Smart Handler Registration System Documentation](SMART_HANDLER_REGISTRATION_SYSTEM.md)**.

</details>

---

## Windows Manager System

<details>
<summary>View Windows Manager details</summary>

### Overview
The windows manager system coordinates the display and interaction of translation icons and windows. It follows a decoupled, event-driven architecture that separates business logic from UI rendering, ensuring performance and maintainability.

### Architecture and Integration
- **Facade Architecture**: The main `WindowsManager` acts as a headless controller that delegates specialized tasks to sub-managers for display logic, dismissal rules, and event coordination.
- **Vue UI Host**: All UI elements (windows, icons, tooltips) are rendered within a centralized Vue.js application hosted inside a secure Shadow DOM.
- **Event-Driven Communication**: Communication between the logic layer and the UI layer is strictly managed via the `PageEventBus`, eliminating direct DOM manipulation.
- **Pin and Dock System**: Supports persistent window states, including edge-snapping (docking) and dismissal protection (pinning).
- **Smart In-place Updates**: Existing windows are updated atomically when new selections occur, reducing UI flicker and preventing redundant DOM creation.

### Documentation
For a complete guide on modularization patterns, event payload structures, and the docking breakaway logic, refer to the **[Windows Manager Integration Guide](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md)**.

</details>

---

## UI Host System

<details>
<summary>View UI Host details</summary>

### Overview
The UI host system is a centralized architectural component that manages all in-page user interface elements through a single Vue.js application. It operates within a secure Shadow DOM to ensure complete isolation from the host webpage's styles and scripts.

### Architecture and Integration
- **Centralized UI Host**: `ContentApp.vue` serves as the root container for all in-page elements, including translation windows, icons, and notifications.
- **Shadow DOM Isolation**: Provides a sandbox environment that prevents host page CSS from leaking into the extension UI and ensures the extension's styles do not affect the website.
- **Event-Driven UI**: The host remains passive, reacting to commands from headless logic managers (like WindowsManager) via the `PageEventBus`.
- **Selection Coordinator Integration**: Synchronizes selection state across different UI modules (FAB, Windows, TTS) through a Pub/Sub model.
- **Unified Notification System**: Integrates with the `NotificationManager` to provide consistent, actionable toast notifications across the extension.

### Documentation
For detailed information on communication patterns, notification types, and the CSS isolation strategy, refer to the **[UI Host System Documentation](UI_HOST_SYSTEM.md)**.

</details>

---

## Text Actions System

<details>
<summary>View Text Actions details</summary>

### Overview
The text actions system provides a unified interface for copy, paste, and TTS (Text-to-Speech) operations throughout the extension. It utilizes reusable Vue components and stateful composables to ensure consistent behavior across different UI modules.

### Architecture and Integration
- **Unified Interaction Layer**: Centralizes all text-related actions into a single architectural pattern, reducing redundancy in individual features.
- **Shared Action Components**: Provides standardized UI elements such as `ActionToolbar`, `CopyButton`, and the smart `TTSButton` for consistent user feedback.
- **Stateful Composables**: The `useTextActions` composable coordinates complex workflows, such as pasting text followed by an immediate translation request.
- **TTS Integration**: Directly leverages the `useTTSSmart` system to provide advanced playback controls and status indicators within action toolbars.
- **Notification Support**: Automatically triggers success or error toasts for clipboard operations to provide immediate feedback.

### Documentation
For a complete guide on component properties, composable options, and CSS customization, refer to the **[Text Actions System Documentation](TEXT_ACTIONS_SYSTEM.md)**.

</details>

---

## TTS System

<details>
<summary>View TTS System details</summary>

### Overview
The TTS (Text-to-Speech) system is a unified, stateful audio architecture designed for high-quality neural voice playback. It eliminates redundant implementations by centering all audio logic around a single source of truth that coordinates playback across all extension contexts.

### Architecture and Integration
- **Unified Composable**: `useTTSSmart.js` serves as the single entry point for all UI components, managing five distinct playback states (idle, loading, playing, paused, error).
- **Global Coordination**: `TTSGlobalManager` enforces exclusive playback, ensuring only one audio stream is active at a time across all tabs and internal windows.
- **Multi-Engine Dispatcher**: A central router that selects between Microsoft Edge (neural) and Google TTS based on language support, user preference, and service health.
- **Owner-Aware Cleanup**: A specialized logic that identifies the initiator of an audio stream, allowing the system to stop audio on window closure only if that window was the owner.
- **Circuit Breaker**: Protects user reputation and system stability by temporarily disabling failing engines after repeated errors.

### Documentation
For detailed information on the multi-tiered language detection, voice mapping logic, and browser-specific implementations (Offscreen vs. Direct), refer to the **[TTS System Documentation](TTS_SYSTEM.md)**.

</details>

---

## Whole Page Translation System

<details>
<summary>View Whole Page Translation details</summary>

### Overview
The whole page translation system handles the recursive translation of all text content within a web page. It uses a modular architecture built around the `domtranslator` library to provide a high-performance, fault-tolerant experience.

### Architecture and Integration
- **PageTranslationManager**: The central orchestrator that coordinates the lifecycle of page translation, delegating specialized tasks to modular sub-managers.
- **PageTranslationScheduler**: A dynamic batching engine that implements optimization-aware scheduling, adjusting chunk sizes and concurrency based on the active provider's performance level.
- **PageTranslationBridge**: Serves as the communication layer between the extension and the translation library, handling node detection and visibility data.
- **Modular Filtering**: Specialized engines for different scrolling patterns (Fluid vs. On-Stop) to optimize API request frequency.
- **Smart Purge Strategy**: A memory-safe policy that ejects distant nodes from the translation queue during long scrolls to prevent RAM exhaustion.

### Documentation
For a complete breakdown of the 10-part system architecture, technical flows, and advanced scheduling logic, refer to the **[Whole Page Translation System Documentation](WHOLE_PAGE_TRANSLATION.md)**.

</details>

---

## Text Selection System

<details>
<summary>View Text Selection details</summary>

### Overview
The text selection system handles the detection and processing of text selection across standard web pages and complex professional editors. It follows a simplified architecture designed for performance and reliability across different browser environments.

### Architecture and Integration
- **Selectionchange-Only Strategy**: Utilizes the native `selectionchange` event as the single source of truth for all selection scenarios, eliminating complex drag-detection logic.
- **SelectionManager**: Centralizes the processing of selection data, coordinate calculation, and synchronization with UI components.
- **Selection Coordinator**: A decoupled Pub/Sub architecture that synchronizes selection states across the TTS, FAB, and translation windows.
- **Decoupled Text Field Logic**: Separates standard page selection from interactive text fields (INPUT, TEXTAREA) and professional editors (Google Docs, Notion) through the `text-field-interaction` module.
- **IFrame Propagation**: Ensures selection events are correctly captured and bubbled from nested frames to the top-level UI.

### Documentation
For detailed information on site-specific handlers, the event flow diagram, and performance optimizations, refer to the **[Text Selection System Documentation](TEXT_SELECTION_SYSTEM.md)**.

</details>

---

## Select Element System

<details>
<summary>View Select Element details</summary>

### Overview
The select element system provides an interactive mode for translating specific DOM elements with high precision. It uses a decoupled architecture to separate selection logic from the heavy-lifting of translation orchestration and DOM re-insertion.

### Architecture and Integration
- **SelectElementManager**: The central controller for the mode's lifecycle, managing activation, deactivation, and event coordination across frames.
- **DomTranslatorAdapter**: The content-side orchestrator that assigns temporary UIDs to text nodes and prepares the context-enriched JSON payload for the provider.
- **Optimized JSON Handler**: A background service that manages "Smart Logical Block Batching" to group text nodes by block-level parents, preserving semantic context and reducing token overhead.
- **Resilient Mapping**: A 1:1 node UID system ensures robust result re-insertion, even when streaming results arrive asynchronously.
- **Hover Original Preview**: Integration with the shared `HoverPreviewManager` allows users to view original text via surgical tooltips.

### Documentation
For a comprehensive guide on implementation details, abbreviated protocols, and streaming logic, refer to the **[Select Element System Documentation](SELECT_ELEMENT_SYSTEM.md)**.

</details>

---

## Subtitle Translation System

<details>
<summary>View Subtitle Translation details</summary>

### Overview
The subtitle translation system is a standalone, robust tool designed to translate `.srt` subtitle files into any target language. It operates independently from page-level translation features to efficiently handle large file volumes while strictly preserving formatting, timestamps, and style tags.

### Architecture and Integration
- **Standalone UI Application**: Hosted in `SubtitleApp.vue`, providing a premium, glassmorphic interface with drag-and-drop file support, dynamic ETA, and a live preview viewer.
- **SubtitleTranslationCoordinator**: The central background orchestrator that manages the entire job lifecycle, from parsing to serialization, ensuring process stability with 5-minute batch timeouts.
- **Progressive Batching**: Uses `SubtitleBatchPlanner` to intelligently chunk subtitle cues based on the active provider's character and item limits, optimizing API payloads.
- **Format Protection (TextProtector)**: A specialized adapter (`SubtitleTextProtector`) that shields HTML tags (e.g., `<i>`, `<b>`) and structural braces from the translation engine, preventing file corruption.
- **Unified Provider Integration**: Seamlessly delegates the actual translation requests to the `UnifiedModeCoordinator`, leveraging the extension's existing provider hierarchy and rate limiting while maintaining a decoupled orchestration flow.
- **Validation and Integrity**: The `SubtitleValidationService` ensures translation results align perfectly with the original cues before re-injecting formatting tokens.

### Documentation
For a comprehensive breakdown of the background orchestration, parsing adapters, protection mechanisms, and UI integration, refer to the **[Subtitle Translation System Documentation](SUBTITLE_TRANSLATION_SYSTEM.md)**.

</details>

---

## Screen Capture & OCR System

<details>
<summary>View Screen Capture details</summary>

### Overview
The screen capture system enables visual text extraction from images, videos, and complex webpage layouts. It utilizes a privacy-focused architecture where all OCR (Optical Character Recognition) processing is executed locally within the browser.

### Architecture and Integration
- **ScreenSelector**: An interactive content-layer overlay that manages area selection and implements a two-frame transparency logic to ensure the selection UI is hidden during tab capture.
- **Background Orchestrator**: Coordinates the capture-to-recognition lifecycle, managing the transition from raw image data to extracted text.
- **OCREngine**: A specialized wrapper for Tesseract.js that utilizes local assets and smart core selection (WASM/SIMD) for high-performance recognition without network dependency.
- **Offscreen Processing**: In Chrome, heavy OCR computations are offloaded to an offscreen document to maintain background responsiveness and comply with Manifest V3 limitations.
- **Offline Model Caching**: Uses IndexedDB for model persistence, allowing the system to perform recognition entirely offline after initial language downloads.

### Documentation
For detailed information on the capture lifecycle, Tesseract.js configuration, and the two-frame transparency pattern, refer to the **[Screen Capture System Documentation](SCREEN_CAPTURE_SYSTEM.md)**.

</details>

---

## Mouse on Hover System

<details>
<summary>View Mouse on Hover details</summary>

### Overview
The mouse on hover system provides a high-performance, "zero-click" translation experience by detecting text under the cursor and showing a tooltip. It is designed to be extremely responsive while maintaining 60fps performance through intelligent caching.

### Architecture and Integration
- **HoverTranslationManager**: The central orchestrator that manages event listening, trigger conditions (hover delay, modifier keys), and coordination with the UI.
- **HoverTextDetector**: A specialized engine that uses browser range APIs for high-precision detection of words, sentences, or containers.
- **Rectangle Cache**: An optimization layer that stores the bounding box of the detected text, skipping expensive DOM lookups as long as the mouse remains within the same area.
- **Shadow DOM Tooltip**: Renders the translation within an isolated UI Host component (`MouseHoverTooltip.vue`), using smart positioning to avoid viewport clipping.
- **Modifier Key Integration**: Supports instant translation when pressing Ctrl/Alt/Shift while hovering over text.

### Documentation
For detailed information on detection scopes, performance benchmarks, and positioning logic, refer to the **[Mouse on Hover System Documentation](MOUSE_HOVER_SYSTEM.md)**.

</details>

---

## Language Detection & Direction System

<details>
<summary>View Language Detection details</summary>

### Overview
The language detection system is a centralized architecture for identifying language codes and text direction (RTL/LTR). It follows a "Detection Inheritance" philosophy, prioritizing verified results from translation providers to ensure accuracy across the extension.

### Architecture and Integration
- **LanguageDetectionService**: The central orchestrator (Brain) that manages detection requests and maintains a session-level cache of verified results.
- **Hierarchical Priority Flow**: Implements a multi-layered strategy that checks for inherited metadata before falling back to deterministic script markers, statistical browser APIs, and heuristic defaults.
- **Provider Feedback Loop**: Verified detections from AI or traditional translation engines are ingested and shared with other modules like TTS and the UI layer.
- **Unified Direction Management**: Combines language-code matching with strong-character Unicode analysis (Majority Voting) to determine the correct text direction for mixed-content strings.
- **Trust Filter**: A context-aware validation layer that prevents false positives on short strings by cross-referencing with the user's active UI and target languages.

### Documentation
For a complete guide on Unicode markers, script analysis thresholds, and UI integration patterns, refer to the **[Language Detection System Documentation](LANGUAGE_DETECTION.md)**.

</details>

---

## Mobile Support System

<details>
<summary>View Mobile Support details</summary>

### Overview
The mobile support system provides a touch-optimized translation experience through a centralized bottom sheet architecture. It replaces desktop-specific UI elements with ergonomic, thumb-friendly interfaces when touch capabilities or mobile environments are detected.

### Architecture and Integration
- **In-Page Bottom Sheet**: A multi-state container (Peek, Full) hosted within the Shadow DOM UI Host to ensure isolation from website styles.
- **Mobile Store**: A centralized Pinia store that coordinates visibility, navigation views, and selection data across the mobile interface.
- **Gesture Engine**: A decoupled logic layer for high-performance touch interactions, including snapping and swipe-to-dismiss functionality.
- **Viewport Awareness**: Integration with the Visual Viewport API to handle layout adjustments during virtual keyboard interactions.

### Documentation
For detailed information on gesture implementation, multi-view navigation, and touch-first design principles, refer to the **[Mobile Support Guide](MOBILE_SUPPORT.md)**.

</details>

---

## Desktop FAB System

<details>
<summary>View Desktop FAB details</summary>

### Overview
The Desktop FAB (Floating Action Button) is an autonomous UI module that provides high-access entry points for translation features. It operates within the Shadow DOM UI Host to ensure visual consistency and isolation across all web environments.

### Architecture and Integration
- **Autonomous Module**: Functions independently of the main extension popup, ensuring core features remain accessible.
- **Selection Coordinator Integration**: Uses the `useFabSelection` logic to react to global selection events and trigger translation badges.
- **Smart TTS Controller**: Directly integrates with the unified `useTTSSmart` system for owner-aware audio playback and status management.
- **Persistent State**: Utilizes the StorageManager to remember its vertical position and preferred side (left/right) across browsing sessions.
- **Resource Management**: Employs the ResourceTracker pattern to handle event listener cleanup and memory safety.

### Documentation
For detailed information on the radial badge system, gesture logic, and state-aware menu behavior, refer to the **[Desktop FAB System Guide](DESKTOP_FAB_SYSTEM.md)**.

</details>

---

## IFrame Support System

<details>
<summary>View IFrame Support details</summary>

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
ResourceTracker Cleanup → Unified Messaging Integration
    ↓
Vue UI Host → Event-Based Communication → SelectElement Support
```

**Integration Benefits:**
- **Zero Memory Leaks**: Full ResourceTracker integration
- **Immediate UI Feedback**: SelectElement deactivates instantly in iframes
- **Clean Logging**: Debug-level multi-frame context messages
- **Error Handling**: Centralized error management with ExtensionContextManager
- **Lightweight**: Only essential components, ~80% less code than original implementation

</details>

---

## Storage Manager System

<details>
<summary>View Storage Manager details</summary>

### Overview
The storage manager system provides a unified interface for browser storage with an integrated caching layer. It ensures efficient data access and reactive state synchronization across different extension contexts.

### Architecture and Integration
- **Intelligent Caching**: Reduces the frequency of expensive `browser.storage` API calls by maintaining an in-memory cache with automatic synchronization.
- **Reactive Composables**: Offers `useStorage` and `useStorageItem` hooks for Vue components, allowing them to react instantly to storage changes.
- **Event System**: Emits internal events upon data updates, enabling cross-component synchronization without manual polling.
- **Memory Safety**: Integrates with the `ResourceTracker` to ensure storage listeners are correctly cleaned up when components unmount.

### Documentation
For detailed information on storage schemas, caching policies, and reactive usage patterns, refer to the **[Storage Manager Documentation](STORAGE_MANAGER.md)**.

</details>

---

## Error Management System

<details>
<summary>View Error Management details</summary>

### Overview
The error management system provides a centralized, context-aware framework for handling exceptions throughout the extension. It focuses on maintaining system stability and providing user-friendly feedback during failures.

### Architecture and Integration
- **Context Safety**: `ExtensionContextManager` monitors the validity of the extension's runtime context, preventing "Extension context invalidated" errors from crashing content scripts.
- **Centralized Handler**: The `ErrorHandler` singleton processes all caught exceptions, categorizing them by severity and type (Network, Auth, UI, System).
- **Graceful Recovery**: Implements retry logic and circuit-breaker patterns for critical services like translation and TTS.
- **Localized Feedback**: Translates technical error codes into user-friendly notifications via the integrated toast system.

### Documentation
For detailed information on error classification, context validation patterns, and reporting protocols, refer to the **[Error Management Documentation](ERROR_MANAGEMENT_SYSTEM.md)**.

</details>

---

## Logging System

<details>
<summary>View Logging details</summary>

### Overview
The logging system provides a structured, component-based interface for monitoring extension behavior. It is designed for high performance and environment awareness, ensuring minimal overhead in production.

### Architecture and Integration
- **Scoped Loggers**: Uses a component-based organization (UI, Messaging, Background, etc.) to allow for granular level control and filtering.
- **Level Gating**: Implements strict level-checking (Debug, Info, Warn, Error) to prevent unnecessary log processing in production environments.
- **Lazy Evaluation**: Optimizes performance by only executing complex log string building if the active log level permits.
- **Single Interface**: Centralizes all logging activity through the `getScopedLogger` utility to maintain consistency across the codebase.

### Documentation
For detailed information on log constants, level configuration, and debugging best practices, refer to the **[Logging System Documentation](LOGGING_SYSTEM.md)**.

</details>

---

## Stats Manager System

<details>
<summary>View Stats Manager details</summary>

### Overview
The stats manager system is a centralized, high-precision framework for tracking API usage and network payload weights. It provides absolute transparency for cost monitoring and quota management, especially for AI-based translation providers.

### Architecture and Integration
- **Dual-Metric Tracking**: Separates Original Text Length from actual Network Payload Weight to provide a clear view of API overhead.
- **Golden Chain Compliance**: Integrates with Providers and Orchestrators to ensure every network request is explicitly recorded at the point of execution.
- **Session-Based Isolation**: Uses unique session IDs to isolate statistics for different operations, such as Select Element vs. Whole Page Translation.
- **Unified Reporting**: Centralizes the aggregation and formatting of usage summaries, providing consistent logs and debugging tables.

### Documentation
For detailed information on explicit reporting flows, delta extraction, and dual-metric logic, refer to the **[Stats Manager Documentation](STATS_MANAGER.md)**.

</details>

---

## Performance Optimizations

<details>
<summary>View Performance details</summary>

### System Efficiency
- **Unified Messaging**: Eliminated race conditions and reduced complexity by 50% using action-specific timeouts.
- **Resource Management**: Lazy loading of providers and components to minimize initial memory footprint.
- **State Management**: Efficient, reactive synchronization with Pinia and optimized storage caching.
- **Context Stability**: Centralized error management and context validation to prevent runtime failures.

### Documentation
For detailed information on multi-tiered optimizations, caching strategies, and resource lifecycle management, refer to the **[Optimization Levels Documentation](OPTIMIZATION_LEVELS.md)**.

</details>

---

## Development Guide

<details>
<summary>View Development Guide details</summary>

### Adding New Provider
1. Create provider class extending `BaseProvider`
2. Register in `ProviderFactory`
3. Add configuration to settings store
4. Test with `TranslationEngine` following the **[Testing Strategy](TESTING_STRATEGY.md)**

### Adding New Message Handler
1. Create handler in appropriate `handlers/` directory
2. Register in `LifecycleManager`
3. Add corresponding action to `MessageActions.js`
4. Test with `useMessaging` composable following the **[Testing Strategy](TESTING_STRATEGY.md)**

### Debugging
- Use browser DevTools extension debugging
- Use Vitest UI for visual debugging: `pnpm test:ui` (see **[Testing Strategy](TESTING_STRATEGY.md)**)
- Check `[Messaging]` logs in console
- Verify message format with `MessageFormat.validate()`

</details>

---

## Development Workflow

<details>
<summary>View Development Workflow details</summary>

### For New Features
1. **Plan**: Identify which systems are involved (Vue components, stores, background handlers, etc.)
2. **Design**: Create composables for business logic, components for UI
3. **Implement**: Follow the integration patterns outlined above
4. **Test**: Verify cross-browser compatibility and follow the **[Testing Strategy](TESTING_STRATEGY.md)**
5. **Document**: Update relevant documentation files

### For Bug Fixes
1. **Identify**: Use logging system to trace the issue across systems
2. **Isolate**: Determine if it's Vue-specific, background-specific, or cross-system
3. **Fix**: Apply fix using appropriate error handling patterns
4. **Verify**: Test in all supported browsers following the **[Testing Strategy](TESTING_STRATEGY.md)**

### For Architecture Changes
1. **Review**: Understand impact across all integrated systems
2. **Plan**: Update multiple systems coherently
3. **Migrate**: Use composables and stores to isolate changes
4. **Validate**: Ensure all documentation remains accurate and aligns with **[Testing Strategy](TESTING_STRATEGY.md)**

</details>

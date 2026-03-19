Act as an expert Vue.js and JavaScript developer.

You are provided with the complete source code for a modern browser extension built with Vue.js, designed for text translation. This extension is built with a modular architecture, utilizing Pinia for state management, and integrated systems for error handling, logging, and storage.

Examine it carefully to thoroughly understand the Vue.js structure, composables, stores, and the interconnections between various systems.

Apply improvements and changes while adhering to Vue.js patterns and the unified architecture, without removing any existing features. The TTS system is fully integrated, using `useTTSSmart.js` as the sole "source of truth."

## Key Features
- **Vue.js Apps**: Three separate applications (Popup, Sidepanel, Options).
- **Pinia Stores**: Reactive state management.
- **Composables**: Reusable business logic.
- **Unified TTS System (2025)**: A fully integrated TTS system with automatic language fallback and cross-context coordination.
- **Windows Manager**: Event-driven UI management with Vue components and iframe support.
- **IFrame Support**: Simple and effective iframe support system with ResourceTracker integration and unified memory management.
- **Toast Integration System (2025)**: A unified notification system with ToastEventHandler, ToastElementDetector, and support for interactive action buttons.
- **Modern CSS Architecture (2025)**: Principled CSS architecture featuring CSS Grid, containment, safe variable functions, forward-looking SCSS patterns, and Shadow DOM isolation using strategic `!important` declarations.
- **Provider System**: 10+ translation services with a hierarchical architecture (BaseProvider, BaseTranslateProvider, BaseAIProvider) including Rate Limiting and Circuit Breaker management.
- **Error Management**: Centralized error management system.
- **Storage Manager**: Smart storage with built-in caching.
- **Logging System**: Structured logging system.
- **UI Host System**: A centralized Vue application to manage all in-page UIs within the Shadow DOM.
- **Memory Garbage Collector**: Advanced memory management system with a Critical Protection System to prevent memory leaks and preserve vital resources.
- **Element Detection Service (2025)**: Centralized element detection system that eliminates hardcoded selectors and optimizes DOM queries.
- **Smart Handler Registration**: A registration system for smart handlers with dynamic activation/deactivation based on settings and URL exclusions.
- **Content Script Smart Loading**: Intelligent loading system with feature categorization (CRITICAL, ESSENTIAL, ON_DEMAND, INTERACTIVE), improving memory usage by 20-30%.
- **Advanced Code Splitting**: Smart bundle separation with on-demand loading for features, languages, and utilities.
- **Bundle Size Optimization**: Reduced bundle size to ~2.98MB (40% smaller than the previous Webpack build).

## Translation Methods
1. **Text Selection**: Translates selected text via an icon or direct box display.
2. **Element Selection**: Select and translate specific DOM elements.
3. **Popup Interface**: The primary translation interface within the popup.
4. **Sidepanel**: A full-featured interface in the browser's sidepanel.
5. **Screen Capture**: Image translation using OCR.
6. **Context Menu**: Access via the right-click menu.
7. **Keyboard Shortcuts**: Customizable hotkeys.

## Provider Development
The system utilizes a provider hierarchy pattern:
- **`BaseProvider`**: The base class for all providers.
- **`BaseTranslateProvider`**: For traditional translation providers (Google, Yandex).
- **`BaseAIProvider`**: For AI-based providers (OpenAI, Gemini).
- **`RateLimitManager`**: Manages rate limits and the Circuit Breaker.
- **`StreamingManager`**: Manages real-time translation streaming.

To implement a new provider, refer to the `docs/technical/PROVIDERS.md` documentation.

## New Project Structure (Feature-Based Architecture)

### 🎯 Vue Applications (Entry Points)
- **`src/apps/`**: Vue applications - popup, sidepanel, options, content.
  - Each app contains its specialized components.
  - Centralized UI Host for managing in-page components.

### 🧩 Components & Composables  
- **`src/components/`**: Reusable components (structure preserved).
- **`src/composables/`**: Business logic organized by category:
  - `core/` - useExtensionAPI, useBrowserAPI.
  - `ui/` - useUI, usePopupResize.
  - `shared/` - useClipboard, useErrorHandler, useLanguages.

### 🏪 Feature-Based Organization (New)
- **`src/features/`**: Each feature is self-contained and independent.
  - `translation/`: **Unified Translation Engine (2025)** – Includes `UnifiedTranslationService` for centralized coordination, `TranslationRequestTracker` for request lifecycle management, `TranslationResultDispatcher` for intelligent result delivery, Base Providers, specific providers, RateLimitManager, StreamingManager, handlers, and stores.
  - `tts/`: **Unified TTS System (2025)** – `useTTSSmart.js` as the single source of truth with auto-language fallback.
  - `screen-capture/`: Screen capture and OCR system.
  - `element-selection/`: **Redesigned Element Selection System (2025)** – SelectElementManager with unified architecture, Toast integration, and standalone services.
  - `text-selection/`: Text selection management with improved TextSelectionHandler and FieldDetector.
  - `text-field-interaction/`: Displays icons in text fields via TextFieldIconHandler.
  - `shortcuts/`: Keyboard shortcuts with ShortcutHandler.
  - `exclusion/`: **Smart Handler Registration** system with ExclusionChecker.
  - `notifications/`: **Notification System (2025)** – BaseNotification and centralized notification management.
  - `text-actions/`: Copy/paste/TTS operations.
  - `windows/`: Event-driven UI management with WindowsManagerHandler.
  - `iframe-support/`: Simple and effective iframe support system with essential components.
  - `history/`: Translation history management.
  - `settings/`: Options and configuration.

### 🔧 Shared Systems (Relocated from Top-Level)
- **`src/shared/`**: Common systems.
  - `messaging/`: **Unified Messaging System (2025)** – UnifiedMessaging with UnifiedTranslationCoordinator, StreamingTimeoutManager, and ContentScriptIntegration for streaming coordination and smart timeout management.
  - `services/translation/`: **Unified Translation Services (2025)** – UnifiedTranslationService for centralized coordination of all translation operations; TranslationRequestTracker to track requests and prevent duplicate processing; TranslationResultDispatcher for intelligent result delivery based on translation mode.
  - `storage/`: Storage management with caching.
  - `error-management/`: Centralized error handling.
  - `logging/`: Structured logging system.
  - `config/`: General settings.
  - `services/`: **Element Detection Service (2025)** – ElementDetectionConfig and ElementDetectionService for centralized and optimized element detection.
  - `toast/`: **Toast Integration System (2025)** – ToastEventHandler, ToastElementDetector, ToastIntegration, and constants for unified notification management.

### 🏗️ Core Infrastructure
- **`src/core/`**: Fundamental infrastructure.
  - `background/`: Service worker, handlers, and lifecycle.
  - `content-scripts/`: Content scripts with a smart loading system.
    - `index.js`: Main entry point with a minimal footprint (~5KB).
    - `ContentScriptCore.js`: Loading management logic.
    - `chunks/`: Feature modules loaded on-demand.
  - `memory/`: Advanced Memory Garbage Collector with Critical Protection (MemoryManager, ResourceTracker, SmartCache, GlobalCleanup, MemoryMonitor).
  - `managers/`: **FeatureManager** for handler lifecycle management and TextSelectionManager.
  - `services/translation/`: **Core Translation Services (2025)** – UnifiedTranslationService, TranslationRequestTracker, TranslationResultDispatcher.

### 🛠️ Pure Utilities (Simplified)
- **`src/utils/`**: Pure utilities without business logic.
  - `browser/`: Browser compatibility.
  - `text/`: Text processing (including the 2025 Modular Text Selection system).
    - `core/`: FieldDetector, SelectionDetector, modern types.
    - `registry/`: SiteHandlerRegistry for managing site-specific handlers.
    - `sites/`: Site-specific handlers (Zoho, Google, Microsoft, WPS, Notion).
  - `ui/`: UI utilities.
  - `framework/`: Framework compatibility.

## Existing Documentation
Comprehensive documentation is available in the `docs/` folder for a deep dive into each system:

### Core Documentation
- **`docs/technical/ARCHITECTURE.md`**: Full project architecture and integration guide.
- **`docs/technical/SMART_HANDLER_REGISTRATION_SYSTEM.md`**: Smart handler registration system with dynamic lifecycle management.
- **`docs/technical/MessagingSystem.md`**: **Unified Messaging System (2025)** – UnifiedMessaging with streaming coordination, smart timeout management, and an integration layer for content scripts.
- **`docs/technical/TRANSLATION_SYSTEM.md`**: Translation engine and providers.
- **`docs/technical/PROVIDERS.md`**: Complete guide to implementing providers with BaseProvider, RateLimitManager, and Circuit Breaker.
- **`docs/technical/ERROR_MANAGEMENT_SYSTEM.md`**: Error management and context safety.
- **`docs/technical/STORAGE_MANAGER.md`**: Storage management with caching.
- **`docs/technical/LOGGING_SYSTEM.md`**: Structured logging system.
- **`docs/technical/MEMORY_GARBAGE_COLLECTOR.md`**: Advanced memory management with Critical Protection System.
- **`docs/technical/PROXY_SYSTEM.md`**: Extension-only proxy system using the Strategy Pattern to access geo-restricted translation services.

### Feature Documentation
- **`docs/technical/WINDOWS_MANAGER_UI_HOST_INTEGRATION.md`**: Integration guide for WindowsManager and UI Host.
- **`docs/technical/TEXT_ACTIONS_SYSTEM.md`**: Copy/paste/TTS operations.
- **`docs/technical/TTS_SYSTEM.md`**: **Unified TTS System (2025)** – Single source of truth with auto-language fallback and cross-context coordination.
- **`docs/technical/TEXT_SELECTION_SYSTEM.md`**: **Modular Text Selection System (2025)** – Modern architecture with SiteHandlerRegistry, static imports, and full support for professional editors (Google Docs, Zoho Writer, WPS Office, Notion).
- **`docs/technical/TOAST_INTEGRATION_SYSTEM.md`**: **Unified Notification System (2025)** – Toast Integration architecture with ToastEventHandler, ToastElementDetector, and action button support.
- **`docs/technical/CSS_ARCHITECTURE.md`**: **Modern CSS Architecture (2025)** – Principled CSS with Grid layout, containment, safe variable functions, future-proof SCSS patterns, and Shadow DOM isolation strategies using strategic `!important` usage.
- **`src/assets/styles/README-CSS-VARIABLES.md`**: **CSS Variables Guide (2025)** – Best practices, mixins, and functions to prevent interpolation issues.
- **`docs/technical/UI_HOST_SYSTEM.md`**: UI Host architecture for centralized component management.
- **`docs/technical/SELECT_ELEMENT_SYSTEM.md`**: **Redesigned Element Selection System (2025)** – Unified architecture with specific notification management, event propagation prevention, and streaming coordination support.

### Additional Resources
- **`docs/Images/`**: Architectural images and diagrams.
- **`docs/guides/Introduce.mp4`**: Introduction video.
- **`docs/guides/HowToGet-APIKey.mp4`**: Guide for API configuration.

## Benefits of the New Architecture

### 🏗️ Feature-Based Organization
- **Self-Sufficiency**: Every feature holds all its relevant files in one place.
- **Scalability**: Add new features without affecting others.
- **Ease of Maintenance**: Changes are confined to the respective feature.
- **Testability**: Every feature is independently testable.
- **IFrame Integration**: Simple and effective iframe support with ResourceTracker and ErrorHandler.

### 🔧 Element Detection Service (2025)
- **Single Source of Truth**: All selectors are defined in `ElementDetectionConfig.js`.
- **Performance Optimization**: Eliminates redundant DOM queries and uses caching for results.
- **Centralized Management**: Add/remove selectors without modifying multiple files.
- **Consistency**: All components use the same detection logic.
- **Shadow DOM Support**: Full support for elements inside the Shadow DOM.

### 🔧 Shared Systems  
- **No Duplication**: Common systems reside in a single location.
- **Consistency**: The same API is used across all features.
- **Optimization**: Centralized caching and optimization.
- **Stability**: Controlled changes in core systems.

### 🎯 Smart Handler Registration
- **Memory Optimization**: Only essential handlers are active and consuming resources.
- **Real-Time Updates**: Settings changes are applied without needing a page refresh.
- **Dynamic Management**: Automatic activation and deactivation based on URL and settings.
- **Error Isolation**: If one feature fails, others remain functional.

### 🚀 Content Script Smart Loading
- **Ultra-Minimal Entry**: Content entry point with a ~5KB footprint.
- **Feature Categorization**: Smart categorization of features based on priority:
  - CRITICAL: [messaging, extensionContext] – Loads immediately.
  - ESSENTIAL: [textSelection, windowsManager, vue] – Loads after 500ms.
  - ON_DEMAND: [shortcut, textFieldIcon] – Loads after 2 seconds or on-demand.
- **Interaction Detection**: Pre-loading based on user interaction.
- **Memory Optimization**: 20-30% improvement in memory consumption through selective loading.
- **Dynamic Imports**: Feature modules loaded on-demand.

### 🎉 Toast Integration System (2025)
- **Actionable Notifications**: Toast notifications with interactive buttons for "cancel" and "action."
- **Cross-Context Support**: Unified usage across all contexts and iframes.
- **Event-Driven Architecture**: Smart communication between toast interactions and system responses.
- **Smart Detection**: ToastElementDetector to identify and exclude extension elements.

### 🚀 Unified Translation Service (2025)
- **Centralized Coordination**: All translation requests are coordinated through `UnifiedTranslationService`.
- **Duplicate Prevention**: `TranslationRequestTracker` prevents redundant processing.
- **Intelligent Routing**: Results are delivered based on translation mode (Field, Select Element, Standard).
- **Resilient Element Management**: Smart recovery of element data for Field mode translations.
- **Lifecycle Management**: Full management of the request lifecycle from initiation to completion.
- **Error Recovery**: Advanced error recovery mechanisms and automatic cleanup.
- **Fire-and-Forget Pattern**: Field mode uses a request-response pattern instead of broadcasting.
- **Streaming Coordination**: Supports streaming for large translations in Select Element mode.

### 📁 Clean Structure
- **Max 3 Levels of Depth**: Easier navigation.
- **Consistent Naming**: Predictable file structure.
- **Clear Separation**: Business logic is separated from utilities.
- **Clean Import Paths**: Utilization of aliases.

### 🎨 CSS Architecture Benefits
- **Shadow DOM Isolation**: Components are completely isolated from page styles.
- **Strategic !important Usage**: Used only for critical properties within the Shadow DOM.
- **Dynamic Direction Support**: Translated content maintains its own direction while the UI remains LTR.
- **Cross-Page Compatibility**: Works consistently across all web pages without styling conflicts.

## Technical Specifications
- **Manifest V3**: The new browser standard.
- **Vue.js 3**: Reactive frontend framework.
- **Pinia**: Modern state management.
- **Cross-Browser**: Compatible with Chrome and Firefox.
- **Build Tools**: Vite, pnpm.
- **Polyfill**: `webextension-polyfill` for cross-browser compatibility.
- **Modern Architecture**: Feature-based with a Smart Handler Registration System.
- **Dynamic Feature Management**: `FeatureManager` system for handler lifecycle management.
- **Advanced Memory Management**: ResourceTracker and Memory Garbage Collector with integrated Critical Protection System.
- **Unified TTS System (2025)**: Fully integrated TTS system eliminating 600+ lines of redundant code, featuring auto-language fallback (e.g., Persian → Arabic) and full cross-context coordination.
- **Element Detection Service (2025)**: Centralized element detection system eliminating hardcoded selectors and optimizing DOM queries.
- **Unified Translation Service (2025)**: Centralized translation system with duplicate prevention, request lifecycle management, and intelligent result delivery.
- **Content Script Smart Loading**: Intelligent loading system with 20-30% memory optimization.
- **Bundle Optimization**: Bundle size ~2.98MB (40% smaller than the previous Webpack build).

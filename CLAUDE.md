# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cross-browser web extension called "Translate It" that provides intelligent translation capabilities. It's a smart translation assistant that works on Chrome, Firefox, and other browsers, supporting multiple translation providers including Google Translate, OpenAI, Gemini, and others.

## Essential Development Commands

### Pre-Development Setup
The project uses modern ESLint configuration with `.mjs` extension for config files. All ignore patterns are configured within ESLint config files (no .eslintignore). Webpack configurations use CommonJS while source code uses ES modules.

### Build Commands
```bash
# Build for all browsers
pnpm run build

# Build for specific browsers
pnpm run build:chrome
pnpm run build:firefox

# Development builds with file watching
pnpm run watch:chrome
pnpm run watch:firefox
```

### Linting and Quality Assurance
```bash
# Standard linting for source code
pnpm run lint
pnpm run lint:source

# Validate extension builds
pnpm run validate:firefox
pnpm run validate:chrome
pnpm run validate
```

**Important Note:** Always run `pnpm run lint:source` before committing code changes to ensure code quality and consistency.

### Testing and Validation
```bash
# Pre-submission validation (includes linting, building, and validation)
pnpm run pre-submit

# Pre-publish validation (includes all checks)
pnpm run publish
```

### Packaging and Distribution
```bash
# Create source code archive
pnpm run source

# Create distribution packages
pnpm run publish
```

## Architecture Overview

### Core Components

**Entry Points:**
- `src/content.js` - Main content script entry point with feature flags
- `src/backgrounds/background.js` - Background script with event listeners
- `src/popup/main.js` - Extension popup interface
- `src/options.js` - Extension options page
- `src/sidepanel/sidepanel.js` - Side panel functionality

**Core System:**
- `src/core/TranslationHandler.js` - Central translation orchestrator
- `src/core/EventHandler.js` - Event processing and translation triggers
- `src/core/EventRouter.js` - Event routing and delegation
- `src/core/FeatureManager.js` - Feature flag management
- `src/core/api.js` - API communication layer

**Translation Provider System:**
- `src/providers/registry/ProviderRegistry.js` - Centralized provider metadata and availability management
- `src/providers/factory/TranslationProviderFactory.js` - Provider instance creation and lifecycle management
- `src/providers/implementations/` - All translation provider implementations (Google, OpenAI, Gemini, etc.)
- `src/providers/index.js` - Unified entry point for all provider-related imports

**Platform-Specific Strategies:**
- `src/strategies/` - Platform-specific text extraction and injection strategies
- Each strategy handles unique behavior for different websites (WhatsApp, Twitter, etc.)

### Translation Provider Architecture

The extension uses a modular provider system that separates concerns and enables easy extension:

**Provider Registry (`src/providers/registry/`)**:
- **ProviderRegistry.js**: Centralized registry containing metadata for all translation providers
- Manages provider availability based on browser compatibility and feature requirements
- Provides browser detection and version checking for provider compatibility
- Handles provider categorization (free, AI, local, custom)
- Supports dynamic provider registration for extensions

**Provider Factory (`src/providers/factory/`)**:
- **TranslationProviderFactory.js**: Implements singleton pattern for provider instance management
- Creates and caches provider instances to optimize performance
- Provides unified interface for accessing any translation provider
- Handles provider lifecycle and session context management
- Supports provider validation and error handling

**Provider Implementations (`src/providers/implementations/`)**:
- All translation provider classes extending BaseTranslationProvider
- Each provider handles its specific API integration and authentication
- Consistent interface across all providers for seamless switching
- Individual providers: GoogleTranslateProvider, GeminiProvider, OpenAIProvider, etc.

**Unified Module System**:
- **src/providers/index.js**: Single entry point for all provider-related imports
- Simplified import statements: `import { ProviderRegistry, translationProviderFactory } from "../providers/index.js"`
- Clean separation between registry, factory, and implementation concerns
- Enhanced maintainability and testability

### Cross-Browser Compatibility

The extension uses a sophisticated webpack-based build system with browser-specific configurations:

- **Browser Detection**: `src/utils/browserCompat.js` with webpack aliases
- **API Abstraction**: Separate Chrome and Firefox API implementations
- **Manifest Files**: `src/manifest.chrome.json` and `src/manifest.firefox.json`
- **Build Configs**: `webpack.chrome.js` and `webpack.firefox.js`

### Translation Modes

The extension supports multiple translation modes:
- **Text Selection**: Translate selected text with popup
- **Element Selection**: Translate entire page elements
- **Text Field Integration**: Inline translation in input fields with intelligent selection handling
- **Shortcut Translation**: Ctrl+/ keyboard shortcut
- **Subtitle Translation**: Real-time translation of video subtitles on YouTube and Netflix

### Text Field Translation Behavior

The extension implements intelligent text field translation with prioritized selection handling:

**Primary Priority - Selected Text:**
- When text is selected within any input field, only the selected portion is translated and replaced
- This behavior applies regardless of the `COPY_REPLACE` setting
- Supports both `<input>`/`<textarea>` elements and contentEditable fields

**Secondary Priority - COPY_REPLACE Setting:**
- When no text is selected:
  - `COPY_REPLACE="replace"` → Entire field content is translated and replaced
  - `COPY_REPLACE="copy"` → Translation is copied to clipboard only (field content remains unchanged)

**Framework Compatibility System:**
- `src/utils/framework-compat/` - Modular text replacement system for modern web frameworks
  - `index.js` - Main coordinator and public API
  - `editorDetection.js` - Complex editor and dangerous structure detection
  - `textInsertion.js` - Universal text insertion strategies with multi-layer fallback
  - `naturalTyping.js` - Natural typing simulation for React/frameworks
  - `selectionUtils.js` - Text selection utilities
  - `simpleReplacement.js` - Fallback simple replacement methods
- Supports React, Vue, Angular, and other reactive frameworks
- Multi-layer fallback system for contentEditable elements
- Natural typing simulation for sites requiring character-by-character input
- Site-specific optimizations for Reddit, DeepSeek, ChatGPT, Claude

**Key Implementation Files:**
- `src/handlers/smartTranslationIntegration.js` - Main logic for selection detection and mode determination
- `src/contentMain.js` - Content script handlers with selection utilities
- `src/strategies/DefaultStrategy.js` - Platform-specific text extraction and replacement
- `src/utils/framework-compat/` - Modular framework-aware text replacement utilities

### Subtitle Translation System

The extension includes a comprehensive subtitle translation system for video platforms:

**Supported Platforms:**
- **YouTube**: Regular videos, Shorts, and embedded videos
- **Netflix**: Movies and TV shows

**Architecture Components:**
- `src/subtitle/BaseVideoStrategy.js` - Abstract base class for video platform strategies
- `src/subtitle/YoutubeSubtitleStrategy.js` - YouTube-specific subtitle handling
- `src/subtitle/NetflixSubtitleStrategy.js` - Netflix-specific subtitle handling
- `src/subtitle/SubtitleManager.js` - Central manager for subtitle translation
- `src/subtitle/index.js` - Main exports for subtitle system

**Key Features:**
- **Real-time Translation**: Subtitles are translated as they appear
- **Dual-language Display**: Shows both original and translated text
- **Platform-specific Optimization**: Handles YouTube SPA navigation and Netflix API
- **Smart Caching**: Prevents redundant translations of the same text
- **Performance Optimized**: Uses debouncing and efficient DOM monitoring
- **Error Handling**: Robust error management with fallback mechanisms

**User Experience:**
- **Automatic Detection**: Automatically activates on supported video sites
- **Pause on Hover**: Video pauses when hovering over subtitles for better readability
- **Customizable**: Can be enabled/disabled via extension settings
- **Visual Consistency**: Maintains platform-specific styling and appearance

**Technical Implementation:**
- Uses MutationObserver for efficient subtitle detection
- Handles SPA navigation for YouTube
- Integrates with Netflix player API when available
- Implements translation caching to minimize API calls
- Supports both contentEditable and standard subtitle formats

**Configuration:**
- Controlled by `ENABLE_SUBTITLE_TRANSLATION` flag in FeatureManager
- YouTube UI visibility controlled by `SHOW_SUBTITLE_ICON` flag in FeatureManager
- Automatically initializes when visiting supported video sites
- Respects user's translation provider and language settings
- Default enabled: `true` (can be disabled in extension settings)
- Uses dedicated `TranslationMode.Subtitle` for optimized subtitle translation
- Leverages specialized `PROMPT_BASE_SUBTITLE` template for video content context

**YouTube Icon Control:**
- `SHOW_SUBTITLE_ICON=true` → Translation icon appears in YouTube player controls
- `SHOW_SUBTITLE_ICON=false` → No icon is displayed, but subtitle translation still works via other methods
- Icon toggle is handled independently from subtitle translation functionality
- Changes take effect immediately without page refresh
- Icon provides visual feedback for current subtitle translation state (active/inactive)

**Development Guidelines:**
- **Handler Pattern**: Each video platform has its own handler class extending `BaseSubtitleHandler`
- **Selector Management**: Platform-specific CSS selectors are centralized in `getSelectors()` method
- **Error Resilience**: Extensive try-catch blocks with graceful fallbacks
- **Performance Optimization**: Uses MutationObserver with debouncing and caching
- **Memory Management**: Proper cleanup of event listeners and observers on destroy

**Testing Considerations:**
- Test on both regular and embedded video players
- Verify subtitle detection across different video qualities
- Check performance impact with long videos
- Ensure proper cleanup when navigating between videos
- Test with different subtitle languages and formats

**Subtitle-Specific Translation Features:**
- **Specialized Prompt Template**: `PROMPT_BASE_SUBTITLE` optimized for video content translation
- **Context-Aware Translation**: Understands subtitle timing constraints and readability requirements
- **Conversational Tone**: Maintains natural spoken dialogue feel in translations
- **Conciseness Priority**: Optimizes for quick readability (2-4 second display time)
- **Cultural Adaptation**: Handles idioms and cultural references appropriately for subtitle context
- **Technical Optimization**: Uses `TranslationMode.Subtitle` for dedicated subtitle processing pipeline

### Error Handling

Centralized error handling system:
- `src/services/ErrorService.js` - Main error processing
- `src/services/ErrorTypes.js` - Error type definitions
- `src/services/ErrorMessages.js` - Error message mapping
- Integration with notification system for user feedback

## Key Configuration Files

### ESLint Configurations
- `eslint.config.mjs` - Main ESLint configuration with cross-browser support
- `eslint.source.config.js` - Source code specific linting rules
- `eslint.build.config.js` - Build output validation
- `security.eslint.config.js` - Security-focused linting rules

### Webpack Configurations
- `webpack.chrome.js` - Chrome-specific build configuration with full polyfills and optimizations
- `webpack.firefox.js` - Firefox-specific build configuration with Babel-managed polyfills for zero validation warnings

## Development Workflow

### Pre-commit Checks
Always run these commands before committing:
```bash
pnpm run lint:source
pnpm run validate:firefox
```

**TTS Development Notes:**
- Use `tts-player-simple.js` for TTS functionality
- Ensure `offscreen-simple.js` is included in webpack config
- Test TTS on regular web pages, not extension pages
- Check both Chrome offscreen and script injection fallbacks

### Feature Development
1. Update feature flags in `src/core/FeatureManager.js`
2. Add platform-specific handling in appropriate strategy files
3. For text field features, consider implementing selection detection in both strategy files and smart translation handlers
4. Test across both browsers using watch commands
5. Validate with security and cross-browser tests

### Text Field Feature Development Guidelines
When working with text field translation features:
- Always implement selection detection using `selectionStart`/`selectionEnd` for input elements
- Use `window.getSelection()` for contentEditable elements
- Maintain cursor position after text replacement using `setSelectionRange()`
- Ensure proper event dispatching (`input` and `change` events) for framework compatibility
- Test both selected text scenarios and full field replacement scenarios

**Framework Compatibility Guidelines:**
- Use `smartTextReplacement()` from `framework-compat/index.js` for text replacement
- For React-based sites: Enable natural typing simulation to bypass virtual DOM detection
- For contentEditable elements: Implement multi-layer fallback (universal insertion → natural typing → simple replacement)
- Always validate replacement success before reporting completion
- Include comprehensive logging for debugging complex DOM manipulation scenarios

**Copy Mode Implementation:**
- In copy mode, never modify field content - only copy to clipboard
- Respect user's `COPY_REPLACE` setting preference
- Use `copyOnly` parameter in message passing to content scripts
- Provide clear user feedback when translation is copied vs replaced

### Translation Provider Integration

The modular provider system enables easy integration and extension:

**Working with Providers:**
```javascript
// Import providers from unified entry point
import { ProviderRegistry, translationProviderFactory } from "../providers/index.js";

// Get available providers for current browser
const availableProviders = ProviderRegistry.getAvailableProviders();

// Get specific provider instance
const provider = translationProviderFactory.getProvider("gemini");

// Use provider for translation
const result = await provider.translate(text, srcLang, tgtLang, mode);
```

**Adding New Providers:**
1. Create provider class in `src/providers/implementations/` extending `BaseTranslationProvider`
2. Add provider metadata to `ProviderRegistry.providers` array
3. Add provider case to `TranslationProviderFactory.getProvider()` method
4. Export new provider in `src/providers/implementations/index.js`
5. Test across browsers and update compatibility requirements

**Provider Management:**
- **UI Integration**: Provider selection managed in `src/sidepanel/apiProviderManager.js` and `src/popup/apiProviderManager.js`
- **HTML Generation**: Provider UI elements generated by `src/utils/providerHtmlGenerator.js`
- **Context Menu Integration**: Provider-aware context menus in `src/listeners/onContextMenu.js`
- **API Communication**: Core API calls handled through `src/core/api.js` using provider factory

**Best Practices:**
- Always use `ProviderRegistry.isProviderAvailable()` to check provider compatibility
- Use `translationProviderFactory.getProvider()` for consistent provider access
- Implement proper error handling and fallback mechanisms for each provider
- Follow the BaseTranslationProvider interface for consistency
- Add comprehensive browser compatibility requirements to provider metadata

## Important Notes

### TTS (Text-to-Speech) Architecture
The extension uses a robust multi-layer TTS system with browser-specific implementations:

**Chrome Implementation:**
1. **Offscreen API** (primary) - Uses offscreen document for Google TTS audio playback
2. **Script Injection** (fallback) - Injects Web Speech API directly into active tab
3. **Chrome TTS API** - Direct browser TTS when available

**Firefox Implementation:**
1. **Direct Google TTS** - Uses translate.google.com API with Audio object
2. **Web Speech API** - Browser built-in synthesis fallback

**Key Files:**
- `src/managers/tts-player-simple.js` - Main TTS controller
- `src/offscreen-simple.js` - Offscreen document audio handler
- `html/offscreen-chrome.html` - Offscreen document HTML

**Technical Details:**
- Service worker limitations require offscreen documents for Audio API usage in Chrome
- Script injection provides fallback when offscreen communication fails
- Browser detection determines appropriate TTS strategy
- Robust error handling with multiple fallback mechanisms
- **No Character Limits**: TTS system handles texts of any length without restrictions

### Security Considerations

**XSS Protection Framework:**
- **Complete XSS Protection**: All translation outputs are protected against Cross-Site Scripting attacks
- **XSS Library Integration**: Uses `filterXSS` library with strict configuration (replaces DOMPurify for better Firefox compatibility)
- **Multi-Layer Defense**: Protection implemented at multiple levels:
  - `SimpleMarkdown.render()` - Sanitizes all markdown content with XSS filtering
  - Content Strategies - All platform-specific strategies use secure XSS configuration
  - Selection Windows - Translation popups protected against malicious content
  - Popup/Sidepanel - All UI components use safe rendering

**XSS Protection Configuration:**
```javascript
{
  whiteList: { br: [] },           // Only <br> tags allowed
  stripIgnoreTag: true,            // Remove unknown tags
  stripIgnoreTagBody: ['script', 'style'], // Block dangerous content
  onIgnoreTagAttr: function (tag, name, value) {
    // Block javascript:, data:, vbscript: URLs
    if (name === 'href' || name === 'src') {
      if (value.match(/^(javascript|data|vbscript):/i)) {
        return '';
      }
    }
    return false;
  }
}
```

**Protected Components:**
- ✅ `src/utils/simpleMarkdown.js` - Markdown renderer with XSS filtering
- ✅ `src/utils/safeHtml.js` - Safe HTML utility with comprehensive XSS protection and DOM manipulation
- ✅ `src/strategies/*.js` - All content injection strategies with selective text replacement
- ✅ `src/managers/SelectionWindows.js` - Translation popup windows with safe DOM manipulation
- ✅ `src/popup/translationManager.js` - Popup translation display
- ✅ `src/sidepanel/sidepanel.js` - Side panel translation rendering
- ✅ `src/contentMain.js` - Content script with secure text selection and replacement utilities
- ✅ `src/handlers/smartTranslationIntegration.js` - Smart translation logic with selection detection
- ✅ `src/subtitle/*.js` - All subtitle handlers using safe DOM element creation instead of innerHTML
- ✅ `src/utils/framework-compat/` - Modular framework-aware text replacement with secure content clearing

**Additional Security Measures:**
- Strict CSP policies are enforced
- No direct eval() or innerHTML usage
- API keys are stored securely in extension storage
- URL sanitization prevents malicious redirects
- Event handler injection blocked

### Browser Compatibility
- Uses webextension-polyfill for API compatibility
- Manifest V3 compliant for Chrome
- Manifest V2 support for Firefox
- Cross-browser event handling and storage

### Performance Optimizations
- Debounced event handlers
- Translation caching system
- Efficient text extraction algorithms
- Minimal DOM manipulation

## File Structure Patterns

- `src/core/` - Core business logic and orchestration
- `src/providers/` - Translation provider system (modular architecture)
  - `registry/` - Provider metadata and availability management
    - `ProviderRegistry.js` - Centralized provider registry with browser compatibility
  - `factory/` - Provider instance creation and management
    - `TranslationProviderFactory.js` - Singleton factory for provider instances
  - `implementations/` - Translation provider implementations
    - `BaseTranslationProvider.js` - Abstract base class for all providers
    - `GoogleTranslateProvider.js`, `GeminiProvider.js`, etc. - Specific provider implementations
  - `index.js` - Unified entry point for all provider imports
- `src/strategies/` - Platform-specific implementations
- `src/utils/` - Utility functions and helpers
  - `framework-compat/` - Modular text replacement system for modern web frameworks
  - `promptBuilder.js` - AI prompt construction and template management
  - `textDetection.js` - Language and text pattern detection
  - `safeHtml.js` - Secure HTML manipulation with comprehensive XSS protection
- `src/managers/` - UI and resource management
- `src/services/` - Service layer (errors, APIs)
- `src/handlers/` - Event and message handlers
  - `smartTranslationIntegration.js` - Intelligent translation mode determination and execution
- `src/listeners/` - Background script listeners

## Testing Strategy

The extension includes comprehensive validation:
- Source code linting for development
- Cross-browser compatibility testing
- Firefox extension store validation (addons-linter)
- Build artifact verification

### Firefox Validation Notes
The Firefox build is optimized to pass validation without warnings:
- **Zero Warnings Achievement**: Successfully eliminated all Firefox addons-linter warnings
- **XSS Security Migration**: Replaced DOMPurify with XSS library to resolve innerHTML security warnings and improve Firefox compatibility
- **Enhanced XSS Protection**: All translation content rendering now uses comprehensive XSS filtering
- Polyfills (`core-js/stable`, `regenerator-runtime`) are managed by Babel automatically via `useBuiltIns: "usage"`
- Safe Terser optimizations are disabled (commented out) to prevent unsafe transformations
- Target Firefox 109+ to ensure modern JS support without extensive polyfills
- Uses `appendChild()` with `DOMParser` for secure HTML content injection instead of innerHTML
- **Security-First Architecture**: All user-facing content goes through XSS sanitization pipeline

### Recent Improvements (2025)

**Framework Compatibility Enhancements:**
- Implemented advanced text replacement system for React, Vue, Angular compatibility
- Added natural typing simulation for sites requiring character-by-character input
- Multi-layer fallback system ensures translation works across all modern web applications
- Site-specific optimizations for Reddit, DeepSeek, ChatGPT, Claude, and other popular platforms

**Copy Mode Refinements:**
- Enhanced copy mode to never modify field content when enabled
- Clear distinction between replace and copy modes based on user settings
- Improved user feedback and notification system for copy operations

**AI Prompt Template Optimization:**
- Removed markdown code blocks from prompt templates to prevent AI misinterpretation
- Streamlined prompt structure for better translation accuracy
- Enhanced error handling and fallback mechanisms for API failures

**Configuration Migration System (January 2025):**
- Implemented automatic config migration in `src/listeners/onInstalled.js`
- New configuration keys are automatically added to user storage during extension updates
- User settings are preserved while new defaults are merged seamlessly
- Detailed logging for debugging migration process

**Dictionary Enhancement (January 2025):**
- Improved Google Translate dictionary output formatting with markdown rendering
- Enhanced `src/core/api.js` with `_formatDictionaryAsMarkdown()` helper function
- Cleaner, more readable dictionary entries with proper formatting
- Better integration with existing markdown rendering system

**Prompt Template Refinements (January 2025):**
- Fixed inconsistent comment tags in `src/config.js` prompt templates
- Removed unnecessary code block wrappers from all AI prompts
- Simplified dictionary prompt for more concise, useful output
- Improved prompt clarity and reduced AI confusion

**UI/UX Improvements (January 2025):**
- **Popup Interface**: Enhanced typography with increased font sizes (14px→15px)
- **Popup Interface**: Improved font-family consistency with sidepanel (`"Vazirmatn", "Segoe UI", sans-serif`)
- **Popup Interface**: Reduced source textarea height from 4 rows to 2 rows for better space utilization
- **Popup Interface**: Enhanced markdown rendering with comprehensive styles (headers, code blocks, links, blockquotes)
- **Sidepanel Interface**: Reduced toolbar width from 45px to 38px for more content space
- **Sidepanel Interface**: Improved font sizes across all components (13px→14px, 14px→15px)
- **Sidepanel Interface**: Enhanced markdown rendering system with better typography and spacing
- **Cross-Platform Consistency**: Unified font choices and sizing between popup and sidepanel
- **Provider Dropdown**: Fixed hover effects and improved visual consistency

**Text Insertion and Framework Compatibility Enhancements (January 2025):**
- **Modular Architecture**: Refactored `frameworkCompatibility.js` into organized `framework-compat/` module structure
- **Enhanced Text Replacement System**: Implemented `universalTextInsertion()` with multi-strategy approach
- **Undo Capability Preservation**: All text insertion methods now prioritize `execCommand` to maintain browser undo/redo functionality
- **Multi-Layer Fallback System**: execCommand → paste event simulation → direct value assignment with comprehensive error handling
- **Framework-Specific Optimizations**: Enhanced compatibility for React, Vue, Angular with natural typing simulation
- **Smart Selection Handling**: Improved text selection detection and replacement for both input fields and contentEditable elements
- **Copy/Replace Logic Refinement**: Clarified separation between decision logic in `smartTranslationIntegration.js` and implementation in strategies
- **Complex Editor Detection**: Enhanced `isComplexEditor()` function for better identification of rich text editors

**Google Translate API Improvements (January 2025):**
- **Language Swapping Fix**: Corrected language detection and swapping logic for Field mode translations
- **Universal Language Detection**: Language detection now applies to all translation modes, not just non-Field modes
- **Improved Swap Logic**: Fixed issue where English text wasn't being translated to target language in text fields
- **Auto-Detection Enhancement**: Better integration of auto-detect functionality with language swapping

**TTS System Enhancements (January 2025):**
- **Character Limit Removal**: Removed 200-character restriction from Google TTS in `src/handlers/ttsHandler.js`
- **Unified TTS Control**: Added click-to-stop TTS functionality in sidepanel for better user control
- **Enhanced Audio Management**: Improved TTS stopping mechanism across all interfaces (popup, sidepanel, selection windows)

**Subtitle Translation UI Control (January 2025):**
- **New SHOW_SUBTITLE_ICON Setting**: Added `SHOW_SUBTITLE_ICON` configuration flag to control YouTube icon visibility
- **Independent Icon Control**: YouTube subtitle translation icon can be hidden while keeping subtitle translation functionality active
- **FeatureManager Integration**: Proper integration with FeatureManager for real-time settings updates
- **Clean UI Management**: Added `cleanupYouTubeUI()` method for selective YouTube UI cleanup without affecting translation functionality
- **Enhanced Initialization**: Improved `SubtitleHandler` initialization to respect both `ENABLE_SUBTITLE_TRANSLATION` and `SHOW_SUBTITLE_ICON` settings
- **Real-time Toggle**: Icon visibility changes take effect immediately without requiring page refresh
- **Storage Sync**: Enhanced `waitForFeatureManagerReady()` to properly sync both subtitle and icon settings from storage
- **EXTENSION_ENABLED Compliance**: Fixed subtitle features to properly respect global `EXTENSION_ENABLED` setting
- **Race Condition Fix**: Resolved YouTube icon display issues when toggling `SHOW_SUBTITLE_ICON` setting
- **Subtitle Notifications Localization**: Implemented proper i18n support for subtitle start/stop notifications using `getTranslationString()` method

**Security and Validation Improvements (January 2025):**
- **Complete innerHTML Security Fix**: Eliminated all unsafe innerHTML assignments to resolve Firefox addons-linter warnings
- **Safe HTML Utility**: Created `src/utils/safeHtml.js` utility with comprehensive XSS protection and proper DOM manipulation
- **Subtitle System Security**: Replaced all innerHTML assignments in subtitle handlers with safe DOM element creation
- **Framework Compatibility Security**: Updated `framework-compat/` modules to use `textContent` instead of innerHTML for content clearing
- **ESLint Compliance**: Resolved all unused import and variable warnings for clean code quality
- **Zero-Warning Achievement**: Achieved complete Firefox addons-linter validation with 0 errors, 0 warnings, and 0 notices
- **Security-First DOM Manipulation**: All dynamic content insertion now uses safe DOM methods with XSS filtering
- **Cross-Browser Build Verification**: Ensured both Chrome and Firefox builds compile successfully with security improvements

**API Key Security Enhancements (January 2025):**
- **Visual API Key Protection**: Implemented hover-based masking system for all API key input fields in settings page
- **CSS-Based Masking**: API key content hidden with dot patterns, revealed only on hover or focus for enhanced security
- **Comprehensive Coverage**: Automatic masking applied to all API providers (Gemini, OpenAI, OpenRouter, DeepSeek, Custom)
- **User Experience**: Maintains full input functionality while protecting against shoulder surfing and accidental exposure

**Import/Export User Experience Improvements (January 2025):**
- **Smart File Preservation**: Fixed file browser clearing issue during encrypted settings import password errors
- **Enhanced Error Detection**: Integrated ErrorMatcher system for comprehensive password error categorization
- **Seamless Password Retry**: Users can attempt multiple passwords without re-selecting the settings file
- **Auto-Focus Recovery**: Password input field automatically focused after errors for immediate retry
- **Intelligent Error Handling**: File browser preserved for password errors, cleared only for format/success cases

**Provider System Modularization (January 2025):**
- **Architectural Refactoring**: Moved provider-related files from `src/core/` to dedicated `src/providers/` module
- **Modular Organization**: Separated provider concerns into registry, factory, and implementation subdirectories
- **Enhanced Maintainability**: Created unified entry point (`src/providers/index.js`) for simplified imports
- **Improved Scalability**: Provider system now supports easier addition of new translation providers
- **Clean Dependencies**: Updated all import paths across codebase to use new modular structure
- **Benefits**: Better code organization, clearer separation of concerns, enhanced developer experience

**Advanced Text Insertion System for Complex Editors (January 2025):**
- **Universal Text Insertion**: Implemented comprehensive `universalTextInsertion()` system in `src/utils/framework-compat/textInsertion.js`
- **Multi-Strategy Approach**: 5-layer fallback system: execCommand → beforeinput → paste events → MutationObserver → direct manipulation
- **Modern Editor Support**: Enhanced compatibility with AI chat platforms (Kimi.com, Claude.ai, ChatGPT) and modern editors (Lexical, Slate, ProseMirror)
- **Intelligent Complex Editor Detection**: Refined `isComplexEditor()` to distinguish truly complex editors from simple AI chat inputs
- **Verification System**: Added `verifyTextInsertion()` to confirm successful text replacement across all strategies
- **beforeinput Event Support**: Implemented modern `beforeinput` event simulation for contemporary web applications
- **MutationObserver Integration**: Advanced DOM monitoring for complex reactive frameworks
- **Smart Fallback Logic**: Intelligent decision-making in `smartTranslationIntegration.js` respects user preferences while enabling advanced insertion
- **AI Platform Optimization**: Specific enhancements for Kimi.com, Claude.ai, Poe.com, Character.ai, and other AI chat platforms
- **Framework Compatibility**: Enhanced support for React, Vue, Angular applications with proper event simulation and undo preservation

**Framework Compatibility Modularization (January 2025):**
- **Modular Architecture**: Refactored monolithic `frameworkCompatibility.js` (1558 lines) into organized module structure
- **Separation of Concerns**: Each module handles specific responsibilities:
  - `editorDetection.js` - Complex editor identification and dangerous structure detection
  - `textInsertion.js` - Universal text insertion strategies with multi-layer fallback
  - `naturalTyping.js` - Character-by-character typing simulation for React/frameworks
  - `selectionUtils.js` - Text selection detection and handling utilities
  - `simpleReplacement.js` - Fallback replacement methods with undo preservation
  - `index.js` - Main coordinator orchestrating all strategies
- **Enhanced Maintainability**: Smaller, focused files easier to understand, test, and maintain
- **Backward Compatibility**: All existing imports work seamlessly with automatic re-exports
- **Documentation**: Comprehensive README.md explaining module architecture and usage patterns
- **Build Validation**: Both Chrome and Firefox builds successful with zero functionality loss
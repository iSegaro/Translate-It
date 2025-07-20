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

**Platform-Specific Strategies:**
- `src/strategies/` - Platform-specific text extraction and injection strategies
- Each strategy handles unique behavior for different websites (WhatsApp, Twitter, etc.)

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
- `src/utils/frameworkCompatibility.js` - Advanced text replacement system for modern web frameworks
- Supports React, Vue, Angular, and other reactive frameworks
- Multi-layer fallback system for contentEditable elements
- Natural typing simulation for sites requiring character-by-character input
- Site-specific optimizations for Reddit, DeepSeek, ChatGPT, Claude

**Key Implementation Files:**
- `src/handlers/smartTranslationIntegration.js` - Main logic for selection detection and mode determination
- `src/contentMain.js` - Content script handlers with selection utilities
- `src/strategies/DefaultStrategy.js` - Platform-specific text extraction and replacement
- `src/utils/frameworkCompatibility.js` - Framework-aware text replacement utilities

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
- Use `smartTextReplacement()` from `frameworkCompatibility.js` for text replacement
- For React-based sites: Enable natural typing simulation to bypass virtual DOM detection
- For contentEditable elements: Implement multi-layer fallback (simple → natural typing → handleSimpleReplacement → DefaultStrategy)
- Always validate replacement success before reporting completion
- Include comprehensive logging for debugging complex DOM manipulation scenarios

**Copy Mode Implementation:**
- In copy mode, never modify field content - only copy to clipboard
- Respect user's `COPY_REPLACE` setting preference
- Use `copyOnly` parameter in message passing to content scripts
- Provide clear user feedback when translation is copied vs replaced

### Translation Provider Integration
- API providers are managed in `src/sidepanel/apiProviderManager.js`
- Add new providers by extending the provider configuration
- Ensure proper error handling and fallback mechanisms

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
- `html/offscreen.html` - Offscreen document HTML

**Technical Details:**
- Service worker limitations require offscreen documents for Audio API usage in Chrome
- Script injection provides fallback when offscreen communication fails
- Browser detection determines appropriate TTS strategy
- Robust error handling with multiple fallback mechanisms

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
- ✅ `src/strategies/*.js` - All content injection strategies with selective text replacement
- ✅ `src/managers/SelectionWindows.js` - Translation popup windows
- ✅ `src/popup/translationManager.js` - Popup translation display
- ✅ `src/sidepanel/sidepanel.js` - Side panel translation rendering
- ✅ `src/contentMain.js` - Content script with secure text selection and replacement utilities
- ✅ `src/handlers/smartTranslationIntegration.js` - Smart translation logic with selection detection

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
- `src/strategies/` - Platform-specific implementations
- `src/utils/` - Utility functions and helpers
  - `frameworkCompatibility.js` - Advanced text replacement for modern web frameworks
  - `promptBuilder.js` - AI prompt construction and template management
  - `textDetection.js` - Language and text pattern detection
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
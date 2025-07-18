# Gemini.md

This file provides guidance to Gemini when working with code in this repository.

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

# Security-focused linting
pnpm run test:security

# Fix linting issues automatically
pnpm run lint:fix
pnpm run lint:fix:source

# Validate extension builds
pnpm run validate:chrome
pnpm run validate:firefox
pnpm run validate:all
```

**Important Note:** Always run `pnpm run lint:source` before committing code changes to ensure code quality and consistency.

### Testing and Validation
```bash
# Complete cross-browser testing
pnpm run test:cross-browser

# Pre-submission validation
pnpm run pre-submit

# Pre-publish validation (includes all checks)
pnpm run pre-publish
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
- **Text Field Integration**: Inline translation in input fields
- **Shortcut Translation**: Ctrl+/ keyboard shortcut

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
- `webpack.common.js` - Shared webpack configuration
- `webpack.chrome.js` - Chrome-specific build configuration
- `webpack.firefox.js` - Firefox-specific build configuration
- `webpack.browser-specific.js` - Browser-specific utilities

## Development Workflow

### Pre-commit Checks
Always run these commands before committing:
```bash
pnpm run lint:source
pnpm run test:security
pnpm run validate:all
```

**TTS Development Notes:**
- Use `tts-player-simple.js` for TTS functionality
- Ensure `offscreen-simple.js` is included in webpack config
- Test TTS on regular web pages, not extension pages
- Check both Chrome offscreen and script injection fallbacks

### Feature Development
1. Update feature flags in `src/core/FeatureManager.js`
2. Add platform-specific handling in appropriate strategy files
3. Test across both browsers using watch commands
4. Validate with security and cross-browser tests

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
- All HTML content is sanitized through DOMPurify
- Strict CSP policies are enforced
- No direct eval() or innerHTML usage
- API keys are stored securely in extension storage

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
- `src/managers/` - UI and resource management
- `src/services/` - Service layer (errors, APIs)
- `src/handlers/` - Event and message handlers
- `src/listeners/` - Background script listeners

## Testing Strategy

The extension includes comprehensive validation:
- Source code linting for development
- Security scanning for vulnerabilities
- Cross-browser compatibility testing
- Extension store validation (addons-linter)
- Build artifact verification
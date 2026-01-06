# Project Context

## Purpose
Translate-It is a modern browser extension that provides comprehensive translation capabilities across multiple contexts. It enables users to translate text through various methods: text selection, element selection, popup interface, sidepanel, screen capture with OCR, context menu, and keyboard shortcuts. The extension supports 10+ translation providers including Google Translate, DeepL, OpenAI, Google Gemini, OpenRouter, DeepSeek, and custom AI providers.

## Tech Stack
- **Frontend Framework**: Vue.js 3 (Composition API)
- **State Management**: Pinia
- **Build Tools**: Vite, pnpm
- **Browser API**: Manifest V3, webextension-polyfill
- **Cross-Browser**: Chrome, Firefox
- **Language**: JavaScript (ES6+), SCSS for styles
- **Architecture**: Feature-based architecture with Smart Handler Registration

## Project Conventions

### Code Style
- **Language**: JavaScript (ES6 modules)
- **Component Style**: Vue 3 Composition API with `<script setup>`
- **Naming Conventions**:
  - Files: kebab-case (`useTTSSmart.js`, `BaseProvider.js`)
  - Components: PascalCase (`LanguageDropdown.vue`, `GeminiApiSettings.vue`)
  - Composables: camelCase with `use` prefix (`useLanguages.js`, `useRTLSelect.js`)
  - Constants: UPPER_SNAKE_CASE (`LOG_COMPONENTS`, `CONFIG`)
  - CSS Variables: kebab-case with `--` prefix (`--color-text`, `--font-size-base`)

### Architecture Patterns
- **Feature-Based Organization**: Each feature is self-contained with its own components, composables, handlers, and stores
- **Hierarchical Provider System**:
  - `BaseProvider` → Base class for all providers
  - `BaseTranslateProvider` → Traditional translation providers (Google, Yandex, DeepL)
  - `BaseAIProvider` → AI-based providers (OpenAI, Gemini, DeepSeek)
- **Smart Handler Registration**: Dynamic handler activation based on settings and URL exclusion
- **Unified Translation Service**: Centralized coordination via `UnifiedTranslationService` with request tracking and result dispatching
- **Content Script Smart Loading**: Features categorized by priority (CRITICAL, ESSENTIAL, ON_DEMAND, INTERACTIVE)
- **Shadow DOM Isolation**: All UI components use Shadow DOM with strategic `!important` for critical styles

### Testing Strategy
- Manual testing for translation workflows
- Linting via npm scripts
- Build validation for both Chrome and Firefox

### Git Workflow
- Main branch: `main`
- Feature branches: Descriptive names (e.g., `main-multiple-api`)
- Commit messages: Follow conventional commits
- **IMPORTANT**: Do NOT run `git commit` - user handles commits manually

## Domain Context

### Translation Providers
The extension supports multiple translation providers with different capabilities:
- **Free Providers**: Google Translate, Bing Translate, Yandex Translate (no API key required)
- **AI Providers**: OpenAI, Google Gemini, DeepSeek, OpenRouter, Custom Provider (require API key)
- **Professional**: DeepL (requires API key, supports free/pro tiers)

### Translation Modes
- `field`: Translate text in input fields (auto-detect source)
- `select_element`: Select and translate DOM elements
- `selection`: Translate selected text
- `dictionary`: Word/phrase dictionary lookup
- `popup_translate`: Popup interface translation
- `sidepanel_translate`: Sidepanel interface translation
- `screen_capture`: Image OCR and translation

### Settings Storage
- Settings stored in `chrome.storage.local` / `browser.storage.local`
- Managed via `StorageManager` with caching
- API keys currently stored as single strings per provider

## Important Constraints
- **Manifest V3 Only**: Must comply with MV3 security policies
- **Cross-Browser Compatibility**: Must work on both Chrome and Firefox
- **Extension Context Isolation**: Content scripts run in isolated contexts
- **Rate Limiting**: Providers have rate limits managed by `RateLimitManager`
- **Circuit Breaker**: Automatic circuit breaking for failed API calls
- **Memory Management**: Advanced garbage collection with ResourceTracker
- **Proxy Support**: Extension-only proxy for geo-restricted services

## External Dependencies
- **Translation APIs**: Google Translate, DeepL API, OpenAI API, Google Gemini API
- **Build Dependencies**: Vite, @vitejs/plugin-vue, webextension-polyfill
- **UI Libraries**: Custom Vue components, no heavy external UI frameworks
- **Dev Tools**: ESLint, pnpm scripts for validation
- **Documentation**: OpenSpec for spec-driven development

## Key Files & Locations

### Translation System
- `src/features/translation/providers/` - Provider implementations
- `src/features/translation/providers/BaseProvider.js` - Base provider class with error handling
- `src/shared/services/translation/UnifiedTranslationService.js` - Central translation coordination
- `src/shared/config/config.js` - Configuration and settings storage

### Settings & Configuration
- `src/shared/config/config.js` - All settings constants and getters
- `src/features/settings/stores/settings.js` - Pinia store for settings
- `src/apps/options/tabs/LanguagesTab.vue` - Languages and provider settings UI
- `src/components/feature/api-settings/` - Provider-specific settings components

### Error Handling
- `src/shared/error-management/ErrorTypes.js` - Standardized error types
- `src/shared/error-management/ErrorHandler.js` - Centralized error handling

### API Key Storage Pattern
Currently, API keys are stored as single string values:
- `API_KEY` - Gemini API key
- `OPENAI_API_KEY` - OpenAI API key
- `OPENROUTER_API_KEY` - OpenRouter API key
- `DEEPSEEK_API_KEY` - DeepSeek API key
- `CUSTOM_API_KEY` - Custom provider API key
- `DEEPL_API_KEY` - DeepL API key

All are retrieved via individual getter functions and stored through the `settingsStore.updateSettingLocally()` method.

# Translation System Guide

The translation system handles translation requests from popup, sidepanel, and content scripts through a **Unified Translation Service** architecture (2025) that provides centralized coordination, duplicate prevention, and intelligent result routing.

## Quick Start

### Frontend Usage
```javascript
// In Vue Components
import { usePopupTranslation } from '@/composables/usePopupTranslation.js'
// or
import { useSidepanelTranslation } from '@/composables/useSidepanelTranslation.js'

const { triggerTranslation, isTranslating, translatedText } = usePopupTranslation()

// Translate text
await triggerTranslation({
  text: 'Hello world',
  sourceLang: 'auto',
  targetLang: 'fa'
})
```

### Message Flow
```
UI Component → useMessaging → browser.runtime.sendMessage
     ↓
Background: UnifiedTranslationService → handleTranslate.js
     ↓
TranslationEngine → Provider → Result Dispatcher → Target Context
```

### Unified Translation Service Architecture (2025)

The translation system has been completely redesigned with a **Unified Translation Service** that provides:

**Core Components**:
- **UnifiedTranslationService**: Central coordinator for all translation operations
- **TranslationRequestTracker**: Manages request lifecycle and prevents duplicates
- **TranslationResultDispatcher**: Intelligent result routing based on translation mode

**Translation Modes**:
- **Field Mode**: Direct response pattern for text field translations
- **Select Element Mode**: Streaming/broadcast for large content translations
- **Standard Mode**: Regular translation with context-based routing

## Core Architecture

### Translation Handler
**File**: `src/features/translation/handlers/handleTranslate.js`
- Entry point for ALL translation requests
- Integrates with UnifiedTranslationService for centralized processing
- Delegates to TranslationModeCoordinator for mode-specific handling

### Unified Translation Service
**File**: `src/core/services/translation/UnifiedTranslationService.js`
- **Central coordinator** for all translation operations
- **Request tracking** to prevent duplicate processing
- **Mode-specific routing** for optimal result delivery
- **Lifecycle management** with automatic cleanup

### Translation Request Tracker
**File**: `src/core/services/translation/TranslationRequestTracker.js`
- **Request lifecycle management** from creation to completion
- **Duplicate detection** using messageId-based tracking
- **Element data recovery** for resilient field mode translations
- **Automatic cleanup** of completed requests

### Translation Result Dispatcher
**File**: `src/core/services/translation/TranslationResultDispatcher.js`
- **Intelligent result routing** based on translation mode
- **Direct response** for field mode translations
- **Broadcast delivery** for select element streaming
- **Tab-specific routing** for context isolation

### Vue Composables
**Popup**: `src/composables/usePopupTranslation.js`
**Sidepanel**: `src/composables/useSidepanelTranslation.js`
- Reactive translation state management
- Context-specific message filtering
- Browser API integration

### Translation Engine
**File**: `src/background/translation-engine.js`
- Provider coordination and selection
- Caching and history management
- Cross-browser compatibility

## Translation Flows

### 1. Popup Translation
```
User Input → usePopupTranslation → handleTranslate.js → Provider → UI Update
```

### 2. Sidepanel Translation  
```
User Input → useSidepanelTranslation → handleTranslate.js → Provider → UI Update
```

### 3. Select Element Translation
```
DOM Selection → JSON Payload → UnifiedTranslationService → Streaming Coordinator → DOM Update
```

**Special Processing**: Select element mode uses streaming for large content:
- **Streaming Updates**: Real-time translation progress
- **JSON Processing**: Efficient handling of multiple text elements
- **Broadcast Results**: Updates sent to all relevant tabs
- **Progress Tracking**: Visual feedback during translation

### 4. Field Mode Translation (New)
```
Text Field → Direct Request → UnifiedTranslationService → Direct Response → Field Update
```

**Field Mode Characteristics**:
- **Direct Response**: No broadcast, results returned directly
- **Element Tracking**: Resilient element reference management
- **Queue-Free**: Eliminated complex queueing mechanism
- **Duplicate Prevention**: Request tracking prevents multiple processing

## Provider System

### Supported Providers
- **Google Translate** (Free, default)
- **DeepL** (AI-powered with formal/informal styles)
- **Google Gemini** (AI-powered)
- **OpenAI** (GPT models)
- **Bing Translate** (Free tier)
- **Yandex** (Free tier)
- **DeepSeek** (AI service)
- **OpenRouter** (AI aggregator)
- **WebAI** (AI service)
- **Browser API** (Chrome 138+)
- **Custom APIs** (OpenAI-compatible)

### Provider Interface
```javascript
class BaseProvider {
  async translate(text, sourceLang, targetLang, mode) {
    // Implementation
    return {
      translatedText: 'result',
      sourceLanguage: 'detected',
      targetLanguage: 'target',
      provider: 'name'
    }
  }
}
```

### Provider Selection
```javascript
// In TranslationEngine
const provider = this.factory.getProvider(data.provider || 'google-translate')
const result = await provider.translate(text, sourceLang, targetLang, mode)
```

## Context Separation

### Problem Solved
Previously, translation results appeared in both popup and sidepanel simultaneously.

### Solution
Context-based message filtering:
```javascript
// Each component filters by context
browser.runtime.onMessage.addListener((message) => {
  if (message.context !== MessagingContexts.POPUP) {
    return false // Ignore non-popup messages
  }
  // Handle popup-specific updates
})
```

## Message Format

### Standard Message
```javascript
{
  action: "TRANSLATE",
  context: "popup", // or "sidepanel", "content"
  data: {
    text: "Hello",
    provider: "google-translate",
    sourceLanguage: "auto",
    targetLanguage: "fa",
    mode: "Popup_Translate"
  }
}
```

### Result Message
```javascript
{
  action: "TRANSLATION_RESULT_UPDATE",
  context: "popup",
  data: {
    translatedText: "سلام",
    originalText: "Hello",
    provider: "google-translate",
    sourceLanguage: "en",
    targetLanguage: "fa"
  }
}
```

## Error Handling

### Translation Errors
```javascript
try {
  const result = await provider.translate(text, sourceLang, targetLang)
} catch (error) {
  return {
    success: false,
    error: {
      message: error.message,
      code: 'TRANSLATION_FAILED',
      provider: providerName
    }
  }
}
```

### Provider Fallback
```javascript
// Automatic fallback to Google Translate if primary provider fails
if (!result.success && data.provider !== 'google-translate') {
  const fallbackProvider = this.factory.getProvider('google-translate')
  result = await fallbackProvider.translate(text, sourceLang, targetLang)
}
```

## Development Guide

### Adding New Translation Context
1. Create composable in `src/composables/useNewContextTranslation.js`
2. Add context to `MessagingContexts` in `MessagingCore.js`
3. Register mode in `config.js` `TranslationMode`
4. Update message listeners for context filtering

### Adding New Provider
1. Implement `BaseProvider` interface
2. Add to `ProviderFactory.js`
3. Register in `ProviderRegistry.js`
4. Add API key handling in settings

### Debugging Translation Issues
1. Check browser console for errors
2. Monitor background service worker logs
3. Verify message format in `handleTranslate.js`
4. Test provider API connectivity
5. Check context filtering in composables

## Performance

### Optimization Strategies
- **Provider Caching**: Reuse provider instances
- **Result Caching**: Avoid duplicate API calls
- **Message Efficiency**: Minimal payload size
- **Context Routing**: Direct message routing

### Bundle Sizes
- **Popup**: ~6KB
- **Sidepanel**: ~8KB  
- **Content Script**: ~100KB (optimization ongoing)

## Key Files

### Core Files - Unified Translation Service (2025)
- `src/core/services/translation/UnifiedTranslationService.js` - Central translation coordinator
- `src/core/services/translation/TranslationRequestTracker.js` - Request lifecycle management
- `src/core/services/translation/TranslationResultDispatcher.js` - Intelligent result routing
- `src/features/translation/handlers/handleTranslate.js` - Translation request handler
- `src/features/translation/handlers/handleTranslationResult.js` - Translation result processor
- `src/core/services/translation/TranslationEngine.js` - Provider coordination

### Integration Files
- `src/handlers/smartTranslationIntegration.js` - Field mode integration with element recovery
- `src/handlers/content/ContentMessageHandler.js` - Content script message handling

### Supporting Files
- `src/shared/messaging/core/UnifiedMessaging.js` - Unified messaging system
- `src/shared/messaging/core/UnifiedTranslationCoordinator.js` - Streaming coordination
- `src/features/translation/stores/` - Translation state management
- `src/features/translation/providers/` - Provider implementations

## Summary

The translation system provides:
- **Unified Architecture**: All translations coordinated through UnifiedTranslationService
- **Duplicate Prevention**: Request tracking eliminates duplicate processing
- **Mode-Specific Routing**: Optimal result delivery based on translation mode
- **Resilient Element Management**: Smart recovery for field mode translations
- **Streaming Support**: Real-time updates for large content translations
- **Context Isolation**: Components only receive relevant messages
- **Provider Flexibility**: Easy switching between translation services
- **Cross-Browser Support**: Chrome and Firefox compatibility
- **Error Resilience**: Comprehensive error handling and recovery

**Key Insight**: The **UnifiedTranslationService** is the core of all translation operations, providing centralized coordination, intelligent routing, and comprehensive lifecycle management for all translation requests regardless of source or mode.

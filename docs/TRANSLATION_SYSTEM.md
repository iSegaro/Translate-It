# Translation System Guide

The translation system handles translation requests from popup, sidepanel, and content scripts through a unified architecture.

## Quick Start

### Frontend Usage
```javascript
// In Vue Components
import { usePopupTranslation } from '@/composables/usePopupTranslation.js'
// or
import { useSidepanelTranslation } from '@/composables/useSidepanelTranslation.js'

const { 
  triggerTranslation, 
  isTranslating, 
  translatedText,
  sourceText 
} = usePopupTranslation()

// Set source text
sourceText.value = 'Hello world'

// Translate with specific languages
await triggerTranslation('auto', 'fa')
// or use default settings languages
await triggerTranslation()
```

### Message Flow
```
UI Component → useMessaging → browser.runtime.sendMessage
     ↓
Background: LifecycleManager → handleTranslate.js
     ↓  
TranslationEngine → Provider → Result Broadcast
```

## Core Architecture

### Translation Handler
**File**: `src/background/handlers/translation/handleTranslate.js`
- Central processor for ALL translation requests
- Handles special JSON processing for select element mode
- Broadcasts results to appropriate contexts

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
DOM Selection → JSON Payload → handleTranslate.js → JSON Result → DOM Update
```

**Special Processing**: Select element mode uses JSON payloads for multiple text elements:
```javascript
// Input: [{"text": "Hello"}, {"text": "World"}]
// Processing: Extract → "Hello\nWorld" → Translate → Rewrap to JSON
// Output: [{"text": "سلام جهان"}]
```

## Provider System

### Supported Providers
- **Google Translate** (Free, default)
- **Google Gemini** (AI-powered)
- **OpenAI** (GPT models)
- **Bing Translate** (Free tier)
- **Yandex** (Free tier)
- **DeepSeek** (AI service)
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

### Core Files
- `src/background/handlers/translation/handleTranslate.js` - Central processor
- `src/background/translation-engine.js` - Provider coordination
- `src/composables/usePopupTranslation.js` - Popup logic
- `src/composables/useSidepanelTranslation.js` - Sidepanel logic

### Supporting Files
- `src/managers/core/LifecycleManager.js` - Message routing
- `src/messaging/core/MessagingCore.js` - Message utilities
- `src/providers/core/ProviderFactory.js` - Provider management
- `src/providers/implementations/` - Provider implementations

## Summary

The translation system provides:
- **Centralized Processing**: All translations flow through `handleTranslate.js`
- **Context Isolation**: Components only receive relevant messages  
- **Provider Flexibility**: Easy switching between translation services
- **Cross-Browser Support**: Chrome and Firefox compatibility
- **Error Resilience**: Comprehensive error handling and recovery

**Key Insight**: `handleTranslate.js` is the core of all translation operations. Every translation request passes through this handler regardless of source context.

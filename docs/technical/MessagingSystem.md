# Messaging System - Practical Guide

The extension's messaging system has been **unified and simplified** using `UnifiedMessaging.js` with intelligent timeout management, replacing the complex Smart Messaging architecture. The system now provides direct `runtime.sendMessage` with action-specific timeouts for optimal performance while maintaining simplicity and reliability.

## Quick Start

### 1. In Vue Components

```javascript
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

export default {
  setup() {
    const { sendMessage, createMessage } = useMessaging('popup')

    const translateText = async (text) => {
      const message = createMessage(MessageActions.TRANSLATE, {
        text,
        targetLang: 'fa'
      })

      // UnifiedMessaging with streaming coordination for large translations
      const response = await sendMessage(message)
      return response.success ? response.data : null
    }

    const quickAction = async () => {
      // Settings operations use fast 3-second timeout
      const message = createMessage(MessageActions.GET_SETTINGS, {})
      const response = await sendMessage(message)
      return response
    }

    return { translateText, quickAction }
  }
}
```

### 2. In Content Scripts

```javascript
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { MessageFormat, MessageActions } from '@/shared/messaging/core/MessagingCore.js'

// Send message with UnifiedMessaging
const message = MessageFormat.create(
  MessageActions.TRANSLATE_SELECTION,
  { text: selectedText },
  'content'
)

// UnifiedMessaging handles timeout and error management
const response = await sendMessage(message)

// Receive message with MessageHandler
import { createMessageHandler } from '@/shared/messaging/core/MessageHandler.js'
const messageHandler = createMessageHandler()

messageHandler.registerHandler(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE, (message) => {
  // Perform action
  return { success: true, data: { status: 'done' } }
})

messageHandler.listen()
```

### 3. In Background Scripts

```javascript
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { createMessageHandler } from '@/shared/messaging/core/MessageHandler.js'

// Using centralized MessageHandler (recommended)
const messageHandler = createMessageHandler()

messageHandler.registerHandler(MessageActions.TRANSLATE, async (message) => {
  const result = await handleTranslation(message.data)
  return { success: true, data: result }
})

messageHandler.registerHandler(MessageActions.GET_PROVIDERS, async (message) => {
  const providers = await getAvailableProviders()
  return { success: true, data: providers }
})

messageHandler.listen()
```

## Unified Messaging Features

### Intelligent Timeout Management & Streaming Coordination

UnifiedMessaging automatically applies appropriate timeouts based on action complexity and provides streaming coordination for translation operations:

**Fast Actions** (3-second timeout):
- `GET_SETTINGS`, `SET_SETTINGS` - 3000ms
- `GET_SELECT_ELEMENT_STATE` - 2000ms
- `SHOW_NOTIFICATION` - 2000ms
- `OPEN_SIDE_PANEL` - 3000ms
- UI and settings operations

**Medium Actions** (2-minute timeout):
- `TRANSLATE`, `TRANSLATE_SELECTION` - 180000ms (to allow for AI model latency and background retries)
- `TRANSLATE_TEXT` - 180000ms
- `TEST_PROVIDER` - 8000ms
- Translation operations

**Long Actions** (20+ second timeout):
- `GOOGLE_TTS_SPEAK` - 20000ms
- `SCREEN_CAPTURE` - 25000ms
- `PROCESS_IMAGE_OCR` - 30000ms
- Media processing operations

**Streaming Translation Support** (Select Element Mode):
- **Smart Timeout Management**: Up to 300,000ms (5 minutes) for large content
- **Progress Reporting**: Real-time streaming updates with UnifiedTranslationCoordinator
- **Fallback Handling**: Graceful degradation from streaming to regular translation
- **Context-Aware Routing**: Automatic detection of streaming vs. regular translation needs

### Unified Translation Service Integration

The messaging system is now fully integrated with the **Unified Translation Service** for centralized coordination of all translation operations:

**Field Mode Translation** (Direct Response):
- **Request-Response Pattern**: Field mode uses direct response pattern with intelligent timeout management
- **No Broadcast Needed**: Results are returned directly to the requesting content script
- **Duplicate Prevention**: UnifiedTranslationService prevents duplicate processing via request tracking
- **Element Recovery**: Smart element data recovery with TranslationRequestTracker

**Select Element Mode** (Streaming/Broadcast):
- **Streaming Coordination**: Large translations automatically use streaming via UnifiedTranslationCoordinator
- **Broadcast Results**: Results are broadcast to all tabs for streaming updates
- **Progress Tracking**: Real-time progress updates with proper request lifecycle management

**Architecture Benefits**:
- **Centralized Coordination**: All translation requests flow through UnifiedTranslationService
- **Request Tracking**: Comprehensive tracking prevents duplicate processing
- **Intelligent Dispatch**: Results are routed appropriately based on translation mode
- **Error Handling**: Centralized error management with proper cleanup

### Performance Benefits

- **Eliminated race conditions** between competing listeners
- **Action-specific timeouts** prevent unnecessary delays
- **Streaming coordination** for large translation operations
- **Centralized error handling** with ExtensionContextManager
- **Simplified architecture** - no complex port fallbacks
- **Smart timeout calculation** based on content complexity

### Usage Control

```javascript
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js'

// Default timeout based on action (recommended)
const response = await sendMessage(message)

// Custom timeout override
const response = await sendMessage(message, { timeout: 10000 })
```

## Message Actions

All available actions in `MessageActions.js`:

```javascript
// Translation
MessageActions.TRANSLATE
MessageActions.TRANSLATE_SELECTION
MessageActions.TRANSLATE_PAGE
MessageActions.GET_PROVIDERS

// Select Element
MessageActions.ACTIVATE_SELECT_ELEMENT_MODE
MessageActions.PROCESS_SELECTED_ELEMENT

// Streaming Translation (New)
MessageActions.TRANSLATION_STREAM_UPDATE    // Real-time translation progress
MessageActions.TRANSLATION_STREAM_END       // Translation completion
MessageActions.TRANSLATION_RESULT_UPDATE    // Final result delivery

// TTS
MessageActions.GOOGLE_TTS_SPEAK
MessageActions.TTS_STOP

// Sidepanel
MessageActions.OPEN_SIDE_PANEL
MessageActions.SELECTED_TEXT_FOR_SIDEPANEL

// Coordination
MessageActions.CANCEL_TRANSLATION           // Cancel ongoing translations
```

## 🔧 Message Structure

### Standard Message
```javascript
{
  action: 'TRANSLATE',           // Operation type
  data: { text: 'Hello' },       // Required data
  context: 'popup',              // Message source
  messageId: 'unique-id',        // Unique identifier
  timestamp: 1672531200000       // Creation time
}
```

### Success Response
```javascript
{
  success: true,
  data: { translatedText: 'Hello' },
  messageId: 'original-id',
  timestamp: 1672531200000
}
```

### Error Response
```javascript
{
  success: false,
  error: {
    message: 'Translation failed',
    type: 'PROVIDER_ERROR'
  },
  messageId: 'original-id',
  timestamp: 1672531200000
}
```

## Context Types

```javascript
MessagingContexts.POPUP      // popup.html
MessagingContexts.SIDEPANEL  // sidepanel.html  
MessagingContexts.OPTIONS    // options.html
MessagingContexts.BACKGROUND // background script
MessagingContexts.CONTENT    // content script
MessagingContexts.OFFSCREEN  // offscreen document
```

## Best Practices

### Good Practices

```javascript
// Use MessageFormat
const message = MessageFormat.create(action, data, context)

// Validate messages
if (!MessageFormat.validate(message)) {
  console.warn('Invalid message format')
  return
}

// Filter by context
if (message.context !== 'sidepanel') {
  return false // Not for us
}
```

### Bad Practices

```javascript
// ❌ Manual message without MessageFormat
const badMessage = { action: 'TRANSLATE', text: 'hello' }

// ❌ Catch all messages without filtering
browser.runtime.onMessage.addListener((message) => {
  // All messages are processed!
})

// ❌ Forgetting sendResponse
browser.runtime.onMessage.addListener((message) => {
  doSomething()
  // Forgot sendResponse or return true
})
```

## Debugging

### Enable Logging

```javascript
import { createLogger } from '@/shared/logging/logger.js'
const logger = createLogger('Messaging', 'debug')

// Log messages
logger.debug('Sending message:', message.action)
logger.error('Message failed:', error)
```

### View Messages in DevTools

1. Open Extension DevTools
2. Go to Console
3. Filter with `[Messaging]`

## File Structure

```
src/shared/messaging/
├── core/
│   ├── MessagingCore.js                  # MessageFormat, Contexts, utilities
│   ├── MessageActions.js                 # All available actions
│   ├── UnifiedMessaging.js               # Unified messaging system
│   ├── UnifiedTranslationCoordinator.js  # Translation streaming coordination
│   ├── StreamingTimeoutManager.js        # Smart timeout management for streaming
│   ├── StreamingResponseHandler.js       # Streaming response coordination
│   ├── ContentScriptIntegration.js       # Content script integration layer
│   └── MessageHandler.js                 # Centralized message handling
├── composables/
│   └── useMessaging.js                   # Vue composable (uses UnifiedMessaging)
└── __tests__/
    └── MessagingCore.test.js

src/core/services/translation/
├── UnifiedTranslationService.js          # Centralized translation coordination
├── TranslationRequestTracker.js          # Request lifecycle management
├── UnifiedResultDispatcher.js            # Intelligent result routing
└── UnifiedModeCoordinator.js             # Mode-specific logic coordination
```

## Common Issues

**Message not received?**
- Check if message listener is properly registered
- Use correct context
- Verify with `MessageFormat.validate()`

**Cross-component interference?**
- Use context filtering
- Generate unique messageIds

**Performance issues?**
- Don't send large data
- Check for message loops

---

**Summary:** UnifiedMessaging provides **race-condition-free messaging** with **intelligent timeout management** and **streaming coordination**. The new UnifiedTranslationCoordinator ensures **efficient handling of large translation operations** while maintaining **context isolation** and **automatic fallback capabilities**.

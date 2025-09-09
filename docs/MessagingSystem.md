# Unified Messaging System - Practical Guide

The extension's messaging system has been **unified and simplified** using `UnifiedMessaging.js` with intelligent timeout management, replacing the complex Smart Messaging architecture. The system now provides direct `runtime.sendMessage` with action-specific timeouts for optimal performance while maintaining simplicity and reliability.

## 🚀 Quick Start

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
      
      // UnifiedMessaging automatically applies appropriate timeout
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

## ⚡ Unified Messaging Features

### Intelligent Timeout Management

UnifiedMessaging automatically applies appropriate timeouts based on action complexity:

**Fast Actions** (3-second timeout):
- `GET_SETTINGS`, `SET_SETTINGS` - 3000ms
- `GET_SELECT_ELEMENT_STATE` - 2000ms  
- `SHOW_NOTIFICATION` - 2000ms
- `OPEN_SIDEPANEL` - 3000ms
- UI and settings operations

**Medium Actions** (12-15 second timeout):
- `TRANSLATE`, `TRANSLATE_SELECTION` - 12000-15000ms
- `TRANSLATE_TEXT` - 12000ms
- `TEST_PROVIDER` - 8000ms
- Translation operations

**Long Actions** (20+ second timeout):
- `GOOGLE_TTS_SPEAK` - 20000ms
- `SCREEN_CAPTURE` - 25000ms
- `PROCESS_IMAGE_OCR` - 30000ms
- Media processing operations

### Performance Benefits

- **Eliminated race conditions** between competing listeners
- **Action-specific timeouts** prevent unnecessary delays
- **Centralized error handling** with ExtensionContextManager
- **Simplified architecture** - no complex port fallbacks

### Usage Control

```javascript
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js'

// Default timeout based on action (recommended)
const response = await sendMessage(message)

// Custom timeout override
const response = await sendMessage(message, { timeout: 10000 })
```

## 📋 Message Actions

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

// TTS
MessageActions.TTS_SPEAK
MessageActions.TTS_STOP

// Sidepanel
MessageActions.OPEN_SIDEPANEL
MessageActions.UPDATE_SIDEPANEL_STATE
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

## 🎯 Context Types

```javascript
MessagingContexts.POPUP      // popup.html
MessagingContexts.SIDEPANEL  // sidepanel.html  
MessagingContexts.OPTIONS    // options.html
MessagingContexts.BACKGROUND // background script
MessagingContexts.CONTENT    // content script
MessagingContexts.OFFSCREEN  // offscreen document
```

## 💡 Best Practices

### ✅ Good Practices

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

### ❌ Bad Practices

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

## 🔍 Debugging

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

## 🏗️ File Structure

```
src/shared/messaging/
├── core/
│   ├── MessagingCore.js     # MessageFormat, Contexts, utilities
│   ├── MessageActions.js    # All available actions  
│   ├── UnifiedMessaging.js  # 🆕 Unified messaging system
│   └── MessageHandler.js    # Centralized message handling
├── composables/
│   └── useMessaging.js      # Vue composable (uses UnifiedMessaging)
└── __tests__/
    └── MessagingCore.test.js
```

## 🚨 Common Issues

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

## 🚀 Migration Guide

### From SmartMessaging/ReliableMessaging to UnifiedMessaging

**Old Code:**
```javascript
import { sendSmart } from '@/messaging/core/SmartMessaging.js'
const response = await sendSmart(message)
```

**New Code:**
```javascript
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
const response = await sendMessage(message) // Automatic timeout management!
```

### MessageHandler Migration

**Old Code:**
```javascript
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Manual handling
})
```

**New Code:**
```javascript
import { createMessageHandler } from '@/shared/messaging/core/MessageHandler.js'
const messageHandler = createMessageHandler()
messageHandler.registerHandler(action, handler)
messageHandler.listen()
```

### Key Changes

- **Eliminated race conditions**: Single unified messaging system
- **Context-specific handlers**: No more listener conflicts  
- **Centralized error handling**: ExtensionContextManager integration
- **Simplified API**: Direct sendMessage() with automatic timeouts

---

**Summary:** UnifiedMessaging provides **race-condition-free messaging** with **intelligent timeout management**. The new MessageHandler system ensures **single responsibility** and **context isolation**. 🚀

# Smart Messaging System - Practical Guide

The extension's messaging system uses **Smart Messaging** for optimal performance with intelligent routing: direct `runtime.sendMessage` for fast actions and port-based messaging for slow operations.

## 🚀 Quick Start

### 1. In Vue Components

```javascript
import { useMessaging } from '@/messaging/composables/useMessaging.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'

export default {
  setup() {
    const { sendMessage, sendSmart, createMessage } = useMessaging('popup')
    
    const translateText = async (text) => {
      const message = createMessage(MessageActions.TRANSLATE, {
        text,
        targetLang: 'fa'
      })
      
      // Smart messaging automatically routes to port for slow operations
      const response = await sendMessage(message)
      return response.success ? response.data : null
    }
    
    const quickAction = async () => {
      // For direct control, use sendSmart with options
      const message = createMessage(MessageActions.GET_SETTINGS, {})
      const response = await sendSmart(message, { usePortForAll: false })
      return response
    }
    
    return { translateText, quickAction }
  }
}
```

### 2. In Content Scripts

```javascript
import { sendSmart } from '@/messaging/core/SmartMessaging.js'
import { MessageFormat, MessageActions } from '@/messaging/core/MessagingCore.js'

// Send message with Smart Messaging
const message = MessageFormat.create(
  MessageActions.TRANSLATE_SELECTION,
  { text: selectedText },
  'content'
)

// Smart messaging automatically handles routing
const response = await sendSmart(message)

// Receive message
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
    // Perform action
    sendResponse(MessageFormat.createSuccessResponse({ status: 'done' }))
  }
})
```

### 3. In Background Scripts

```javascript
import { MessageActions } from '@/messaging/core/MessageActions.js'

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.action) {
    case MessageActions.TRANSLATE:
      const result = await handleTranslation(message.data)
      sendResponse(MessageFormat.createSuccessResponse(result))
      break
      
    case MessageActions.GET_PROVIDERS:
      const providers = await getAvailableProviders()
      sendResponse(MessageFormat.createSuccessResponse(providers))
      break
  }
})
```

## ⚡ Smart Messaging Features

### Intelligent Action Classification

Smart Messaging automatically classifies actions as **Fast** or **Slow** for optimal routing:

**Fast Actions** (Direct `runtime.sendMessage`):
- `GET_SETTINGS`, `SET_SETTINGS`
- `GET_SELECT_ELEMENT_STATE`
- `SHOW_NOTIFICATION`
- `OPEN_SIDEPANEL`
- Settings and UI state operations

**Slow Actions** (Port-based messaging):
- `TRANSLATE`, `TRANSLATE_SELECTION`
- `GOOGLE_TTS_SPEAK`, `TTS_OPERATIONS`
- `SCREEN_CAPTURE`, `OCR_PROCESS`
- Translation and media processing

### Performance Benefits

- **3+ second reduction** in retry delays
- **Direct routing** for fast operations
- **Port stability** for long operations
- **No overcomplicated fallbacks**

### Usage Control

```javascript
import { sendSmart } from '@/messaging/core/SmartMessaging.js'

// Automatic routing (recommended)
const response = await sendSmart(message)

// Force port usage for all actions
const response = await sendSmart(message, { usePortForAll: true })

// Custom timeout
const response = await sendSmart(message, { timeout: 10000 })
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
import { createLogger } from '@/utils/core/logger.js'
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
src/messaging/
├── core/
│   ├── MessagingCore.js     # MessageFormat, Contexts, utilities
│   ├── MessageActions.js    # All available actions  
│   ├── SmartMessaging.js    # 🆕 Smart routing system
│   └── ReliableMessaging.js # Legacy (backward compatibility)
├── composables/
│   └── useMessaging.js      # Vue composable (updated with Smart)
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

### From ReliableMessaging to SmartMessaging

**Old Code:**
```javascript
import { sendReliable } from '@/messaging/core/ReliableMessaging.js'
const response = await sendReliable(message)
```

**New Code:**
```javascript
import { sendSmart } from '@/messaging/core/SmartMessaging.js'
const response = await sendSmart(message) // Automatic routing!
```

**useMessaging Integration:**
```javascript
// Already updated - no changes needed
const { sendMessage } = useMessaging('popup')
const response = await sendMessage(message) // Uses Smart internally
```

### Backward Compatibility

- `ReliableMessaging.js` still available for fallback
- `useMessaging` composable updated but API unchanged
- All existing code continues to work

---

**Summary:** Smart Messaging provides **optimal performance** with **intelligent routing** - no more 3-retry delays! Use `sendSmart()` directly or `useMessaging()` composable for automatic smart routing. 🚀

# Messaging System - Practical Guide

The extension's messaging system is built on simple and standardized `browser.runtime.sendMessage()` API.

## 🚀 Quick Start

### 1. In Vue Components

```javascript
import { useMessaging } from '@/messaging/composables/useMessaging.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'

export default {
  setup() {
    const { sendMessage, createMessage } = useMessaging('popup')
    
    const translateText = async (text) => {
      const message = createMessage(MessageActions.TRANSLATE, {
        text,
        targetLang: 'fa'
      })
      
      const response = await sendMessage(message)
      return response.success ? response.data : null
    }
    
    return { translateText }
  }
}
```

### 2. In Content Scripts

```javascript
import browser from 'webextension-polyfill'
import { MessageFormat, MessageActions } from '@/messaging/core/MessagingCore.js'

// Send message
const response = await browser.runtime.sendMessage(
  MessageFormat.create(
    MessageActions.TRANSLATE_SELECTION,
    { text: selectedText },
    'content'
  )
)

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
│   ├── MessagingCore.js     # Main: MessageFormat, Contexts, utilities
│   └── MessageActions.js    # All available actions
├── composables/
│   └── useMessaging.js      # Vue composable
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

**Summary:** This system is simple, fast, and reliable. Just use `MessageFormat.create()` and `browser.runtime.sendMessage()`! 🎯

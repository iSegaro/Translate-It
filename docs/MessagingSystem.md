# Messaging System Documentation

This document outlines the **refactored messaging architecture** of the extension. The system has been **simplified and modernized**, moving away from complex `UnifiedMessenger` classes to **direct browser API usage** with **standardized message formats** and **utility functions**.

## 🔄 Major Refactoring Overview

**Before**: Complex class-based system with `UnifiedMessenger` → `EnhancedUnifiedMessenger` → timeout issues  
**After**: Direct `browser.runtime.sendMessage()` with standardized `MessageFormat` and utility functions

### Key Changes:
- ✅ **Removed**: `UnifiedMessenger`, `EnhancedUnifiedMessenger`, `MessagingStandards` classes
- ✅ **Added**: `MessagingCore.js` with utility functions and message format standardization
- ✅ **Fixed**: Eliminated 20-second timeout issues
- ✅ **Simplified**: Direct browser API usage throughout codebase

## 1. Core Architecture

### 1.1 MessagingCore.js - The New Foundation

The messaging system is now built around `MessagingCore.js` which provides:

```javascript
// Core exports from MessagingCore.js
export const MessageFormat = {
  create: (action, data, context) => ({ ... }),
  validate: (message) => boolean,
  createResponse: (success, data, error, originalMessageId) => ({ ... })
}

export const MessagingContexts = {
  BACKGROUND: 'background',
  CONTENT: 'content', 
  POPUP: 'popup',
  SIDEPANEL: 'sidepanel',
  OPTIONS: 'options'
}

export const generateMessageId = () => string
```

### 1.2 Direct Browser API Usage

Instead of wrapper classes, we now use browser APIs directly:

```javascript
import browser from 'webextension-polyfill'
import { MessageFormat, MessagingContexts } from '@/messaging/core/MessagingCore.js'

// Send a message directly
const response = await browser.runtime.sendMessage(
  MessageFormat.create(
    MessageActions.TRANSLATE,
    { text: 'Hello', targetLang: 'fa' },
    MessagingContexts.POPUP
  )
)
```

## 2. Message Format Standardization

### 2.1 Standard Message Structure

All messages follow this standardized format:

```javascript
{
  action: string,           // MessageActions constant
  data: object,            // Payload data
  context: string,         // MessagingContexts constant  
  messageId: string,       // Unique identifier
  timestamp: number        // Creation timestamp
}
```

### 2.2 Creating Messages

```javascript
import { MessageFormat, MessagingContexts } from '@/messaging/core/MessagingCore.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'

// Create a standardized message
const message = MessageFormat.create(
  MessageActions.TRANSLATE_SELECTION,
  { 
    text: 'Selected text',
    sourceLang: 'en',
    targetLang: 'fa'
  },
  MessagingContexts.CONTENT
)

// Send it
const response = await browser.runtime.sendMessage(message)
```

### 2.3 Response Format

```javascript
// Success response
{
  success: true,
  data: { translatedText: 'متن ترجمه شده' },
  messageId: 'original-message-id',
  timestamp: 1672531200000
}

// Error response  
{
  success: false,
  error: { message: 'Translation failed', code: 'PROVIDER_ERROR' },
  messageId: 'original-message-id', 
  timestamp: 1672531200000
}
```

## 3. Composables for Vue Components

### 3.1 useMessaging Composable

The primary way Vue components interact with the messaging system:

```javascript
import { useMessaging } from '@/messaging/composables/useMessaging.js'

export default {
  setup() {
    const { sendMessage } = useMessaging()
    
    const translateText = async (text) => {
      try {
        const response = await sendMessage({
          action: MessageActions.TRANSLATE,
          data: { text, targetLang: 'fa' }
        })
        
        if (response.success) {
          return response.data.translatedText
        } else {
          throw new Error(response.error.message)
        }
      } catch (error) {
        console.error('Translation failed:', error)
      }
    }
    
    return { translateText }
  }
}
```

### 3.2 Context-Specific Composables

Specialized composables for specific contexts:

```javascript
// usePopupTranslation.js - for popup context
import { useMessaging } from '@/messaging/composables/useMessaging.js'

export const usePopupTranslation = () => {
  const { sendMessage } = useMessaging()
  
  const translateSelection = async (text) => {
    return await sendMessage({
      action: MessageActions.TRANSLATE_SELECTION,
      data: { text }
    }, MessagingContexts.POPUP)
  }
  
  return { translateSelection }
}

// useSidepanelTranslation.js - for sidepanel context  
export const useSidepanelTranslation = () => {
  // Context filtering to prevent cross-component interference
  const messageListener = (message) => {
    if (message.context !== MessagingContexts.SIDEPANEL) {
      return // Ignore messages not meant for sidepanel
    }
    // Handle sidepanel-specific messages
  }
  
  return { messageListener }
}
```
## 4. Background Message Handling

### 4.1 LifecycleManager - Central Message Router

The background script uses `LifecycleManager` to handle all incoming messages:

```javascript
// src/managers/core/LifecycleManager.js
class LifecycleManager {
  constructor() {
    this.messageHandlers = {
      'ping': Handlers.handlePing,
      'TRANSLATE': Handlers.handleTranslate,
      'translateImage': Handlers.handleTranslateImage,
      'openSidePanel': Handlers.handleOpenSidePanel,
      // ... more handlers
    }
  }
  
  setupMessageListener() {
    browser.runtime.onMessage.addListener(this.handleMessage.bind(this))
  }
  
  async handleMessage(message, sender, sendResponse) {
    const handler = this.messageHandlers[message.action]
    if (handler) {
      return await handler(message, sender, sendResponse)
    }
    
    console.warn('No handler for action:', message.action)
    return MessageFormat.createResponse(false, null, { 
      message: 'Unknown action',
      code: 'UNKNOWN_ACTION' 
    })
  }
}
```

### 4.2 Individual Message Handlers

Each action has its own handler file:

```javascript
// src/background/handlers/translation/handleTranslate.js
export const handleTranslate = async (message, sender, sendResponse) => {
  try {
    const { text, sourceLang, targetLang } = message.data
    
    const translationResult = await TranslationService.translate({
      text,
      sourceLang,
      targetLang
    })
    
    sendResponse(MessageFormat.createResponse(
      true,
      { translatedText: translationResult.text },
      null,
      message.messageId
    ))
  } catch (error) {
    sendResponse(MessageFormat.createResponse(
      false,
      null,
      { message: error.message, code: 'TRANSLATION_ERROR' },
      message.messageId
    ))
  }
  
  return true // Keep message channel open
}
```

## 5. Content Script Integration

### 5.1 Direct Message Handling

Content scripts handle messages directly without wrapper classes:

```javascript
// src/content-scripts/index.js
import browser from 'webextension-polyfill'
import { MessageFormat, MessagingContexts } from '@/messaging/core/MessagingCore.js'

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!MessageFormat.validate(message)) {
    console.warn('Invalid message format:', message)
    return false
  }
  
  switch (message.action) {
    case MessageActions.ACTIVATE_SELECT_ELEMENT_MODE:
      activateSelectElementMode(message.data)
      sendResponse(MessageFormat.createResponse(true, { status: 'activated' }))
      break
      
    case MessageActions.TRANSLATION_RESULT_UPDATE:
      updateTranslationDisplay(message.data)
      sendResponse(MessageFormat.createResponse(true, { status: 'updated' }))
      break
      
    default:
      console.warn('Unknown action:', message.action)
      return false
  }
  
  return true
})
```

### 5.2 Context Filtering

Content scripts can filter messages by context to prevent interference:

```javascript
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages meant for content context
  if (message.context && message.context !== MessagingContexts.CONTENT) {
    return false
  }
  
  // Handle content-specific messages...
})
```

## 6. State Management Integration

### 6.1 Background State Managers

State managers use direct messaging for coordination:

```javascript
// src/background/state/selectElementStateManager.js
class SelectElementStateManager {
  async setStateForTab(tabId, isActive) {
    // Notify content script of state change
    await browser.tabs.sendMessage(tabId,
      MessageFormat.create(
        MessageActions.SELECT_ELEMENT_STATE_CHANGED,
        { isActive },
        MessagingContexts.BACKGROUND
      )
    )
  }
}
```

### 6.2 Cross-Component Communication

Components communicate through background as message hub:

```javascript
// Popup → Background → Sidepanel
// 1. Popup sends translation request
await browser.runtime.sendMessage(
  MessageFormat.create(
    MessageActions.TRANSLATE_SELECTION,
    { text: 'Hello' },
    MessagingContexts.POPUP
  )
)

// 2. Background processes and sends result to sidepanel
await browser.tabs.sendMessage(sidepanelTabId,
  MessageFormat.create(
    MessageActions.TRANSLATION_RESULT_UPDATE,
    { translatedText: 'سلام' },
    MessagingContexts.SIDEPANEL
  )
)
```

## 7. Error Handling & Debugging

### 7.1 Standardized Error Responses

```javascript
// Error response format
{
  success: false,
  error: {
    message: 'Human-readable error message',
    code: 'ERROR_CODE',
    details: { /* additional context */ }
  },
  messageId: 'original-message-id',
  timestamp: 1672531200000
}
```

### 7.2 Logging & Debugging

```javascript
import { createLogger } from '@/utils/core/logger.js'

const logger = createLogger('Core', 'messaging')

// In message handlers
logger.debug('[Messaging] Received action:', message.action)
logger.error('[Messaging] Failed to process:', error)
```

## 8. Migration Guide

### 8.1 Before (Old System)
```javascript
// Old: Complex class-based approach
const messenger = MessagingStandards.getMessenger(MessagingContexts.POPUP)
const response = await messenger.sendMessage({ action: 'TRANSLATE', data: {...} })
```

### 8.2 After (New System)
```javascript
// New: Direct browser API with utilities
import { useMessaging } from '@/messaging/composables/useMessaging.js'

const { sendMessage } = useMessaging()
const response = await sendMessage({
  action: MessageActions.TRANSLATE,
  data: { ... }
})
```

## 9. Benefits of Refactored System

### ✅ **Performance Improvements**
- Eliminated 20-second timeout issues
- Reduced memory footprint (no class instances)
- Faster message processing

### ✅ **Code Simplicity**
- Direct browser API usage
- Fewer abstractions and indirection
- Easier to debug and maintain

### ✅ **Better Type Safety**
- Standardized message formats
- Clear action constants
- Predictable response structures

### ✅ **Context Isolation**
- Components only receive relevant messages
- Reduced cross-component interference
- Better separation of concerns

## 10. Key Files

### Core Files
- `src/messaging/core/MessagingCore.js` - Message format utilities and constants
- `src/messaging/core/MessageActions.js` - Action constants
- `src/messaging/composables/useMessaging.js` - Vue composable for messaging

### Background Integration
- `src/managers/core/LifecycleManager.js` - Central message router
- `src/background/handlers/` - Individual action handlers
- `src/background/state/` - State managers with messaging integration

### Frontend Integration
- `src/composables/usePopupTranslation.js` - Popup-specific messaging
- `src/composables/useSidepanelTranslation.js` - Sidepanel-specific messaging
- `src/content-scripts/index.js` - Content script message handling

### Legacy Files (Removed)
- ~~`src/core/MessagingStandards.js`~~ - Replaced by MessagingCore.js
- ~~`src/core/UnifiedMessenger.js`~~ - Removed in favor of direct browser API
- ~~`src/core/EnhancedUnifiedMessenger.js`~~ - Complex class removed
import { MessagingStandards, MessagingContexts } from './core/MessagingStandards.js';

const popupMessenger = MessagingStandards.getMessenger(MessagingContexts.POPUP);

async function speakText(text, lang) {
    try {
        await popupMessenger.specialized.tts.speak(text, lang, { rate: 1.1 });
        console.log('TTS playback started.');
    } catch (error) {
        console.error('TTS failed:', error);
    }
}

// Example: Using specialized translation messenger
async function translateContent(text, sourceLang, targetLang) {
    try {
        const result = await popupMessenger.specialized.translation.translate(text, {
            sourceLanguage: sourceLang,
            targetLanguage: targetLang
        });
        console.log('Translation result:', result.translatedText);
    } catch (error) {
        console.error('Translation failed:', error);
    }
}

// Example: Activating element selection mode
async function activateSelection() {
    try {
        await popupMessenger.specialized.selection.activateMode('translate'); // 'translate', 'capture', 'analyze'
        console.log('Element selection mode activated.');
    } catch (error) {
        console.error('Failed to activate selection mode:', error);
    }
}
```

## 4. Listening for Messages

Messages are listened for using the standard `browser.runtime.onMessage.addListener` (or `browser.tabs.onMessage.addListener` for content scripts). The `MessagingStandards` system ensures messages adhere to a common format.

### Registering a Listener

```javascript
// Example: In background script (src/background/index.js or a handler)
import browser from 'webextension-polyfill';
import { MessagingStandards, MessageActions, MessageFormat } from './core/MessagingStandards.js';

// It's crucial to validate the message format
## 11. Testing & Validation

### 11.1 Message Format Validation

```javascript
import { MessageFormat } from '@/messaging/core/MessagingCore.js'

// Validate incoming messages
if (!MessageFormat.validate(message)) {
  console.warn('Invalid message format:', message)
  return false
}

// Create valid test messages
const testMessage = MessageFormat.create(
  MessageActions.PING,
  { test: true },
  MessagingContexts.CONTENT
)
```

### 11.2 Handler Testing

```javascript
// Test individual handlers
import { handleTranslate } from '@/background/handlers/translation/handleTranslate.js'

const mockMessage = MessageFormat.create(
  MessageActions.TRANSLATE,
  { text: 'Hello', targetLang: 'fa' },
  MessagingContexts.POPUP
)

const response = await handleTranslate(mockMessage, mockSender, mockSendResponse)
```

## 12. Best Practices

### 12.1 Message Design
- ✅ Use `MessageActions` constants for actions
- ✅ Include meaningful data in message payload
- ✅ Specify appropriate context for filtering
- ❌ Don't send large objects in messages
- ❌ Don't assume message delivery

### 12.2 Error Handling
```javascript
// Good: Proper error handling
try {
  const response = await sendMessage({...})
  if (!response.success) {
    throw new Error(response.error.message)
  }
  return response.data
} catch (error) {
  logger.error('Message failed:', error)
  throw error
}
```

### 12.3 Context Filtering
```javascript
// Good: Filter by context
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.context !== MessagingContexts.SIDEPANEL) {
    return false // Not for us
  }
  // Handle message...
})
```

## 13. Troubleshooting

### Common Issues

**Q: Messages not being received**
- ✅ Check message format with `MessageFormat.validate()`
- ✅ Verify action exists in `MessageActions`
- ✅ Ensure handler is registered in `LifecycleManager`

**Q: Cross-component interference**
- ✅ Use context filtering in message listeners
- ✅ Check `MessagingContexts` values
- ✅ Verify message targeting

**Q: Performance issues**
- ✅ Avoid large message payloads
- ✅ Use context filtering to reduce processing
- ✅ Check for message loops

### Debug Logging

```javascript
// Enable detailed logging
const logger = createLogger('Core', 'messaging', { level: 'debug' })

// Log all messages
browser.runtime.onMessage.addListener((message) => {
  logger.debug('Received message:', {
    action: message.action,
    context: message.context,
    messageId: message.messageId
  })
})
```

---

This refactored messaging system provides a **robust, performant, and maintainable** foundation for extension communication while eliminating the complexity and timeout issues of the previous class-based approach.

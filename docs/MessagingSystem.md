# Messaging System Documentation

This document outlines the architecture and usage of the extension's messaging system, built upon `UnifiedMessenger` and `EnhancedUnifiedMessenger` classes, and standardized by `MessagingStandards`. This system facilitates robust and cross-browser communication between different parts of the extension (background script, content scripts, popup, sidepanel, and options pages).

## 1. Core Concepts

The messaging system is designed around a few core concepts:

*   **Messengers:** Instances of `EnhancedUnifiedMessenger` (or its specialized versions) that provide methods for sending and listening to messages within a specific context.
*   **Contexts (`MessagingContexts`):** Define the origin or destination of a message (e.g., `background`, `content`, `popup`, `sidepanel`).
*   **Actions (`MessageActions`):** Standardized strings representing the type of operation a message requests (e.g., `TTS_SPEAK`, `SCREEN_CAPTURE`, `FETCH_TRANSLATION`).
*   **Message Format (`MessageFormat`):** A standardized structure for all messages, ensuring consistency and proper validation.

## 2. `MessagingStandards` - The Central Hub

The `MessagingStandards` class is the entry point for interacting with the messaging system. It acts as a factory for creating and managing `EnhancedUnifiedMessenger` instances for different contexts.

### Getting a Messenger Instance

To get a messenger instance for a specific context, use `MessagingStandards.getMessenger()`:

```javascript
import { MessagingStandards, MessagingContexts } from './core/MessagingStandards.js';

// Get a messenger for the background script context
const backgroundMessenger = MessagingStandards.getMessenger(MessagingContexts.BACKGROUND);

// Get a messenger for a content script context
const contentMessenger = MessagingStandards.getMessenger(MessagingContexts.CONTENT);

// Get a messenger for a popup context
const popupMessenger = MessagingStandards.getMessenger(MessagingContexts.POPUP);
```

## 3. `EnhancedUnifiedMessenger` - Sending Messages

Each messenger instance provides methods for sending messages. The primary method is `sendMessage()`, but specialized methods are available for common domains like TTS, Capture, Selection, and Translation.

### Basic Message Sending (`sendMessage`)

Use `sendMessage()` for general-purpose messages. It returns a Promise that resolves with the response from the recipient.

```javascript
// Example: Sending a simple ping message from content script to background
import { MessagingStandards, MessagingContexts, MessageActions } from './core/MessagingStandards.js';

const contentMessenger = MessagingStandards.getMessenger(MessagingContexts.CONTENT);

async function sendPing() {
    try {
        const response = await contentMessenger.sendMessage({
            action: MessageActions.PING,
            data: { message: 'Hello from content script!' }
        });
        console.log('Ping response:', response); // { success: true, data: { message: 'pong' } }
    } catch (error) {
        console.error('Error sending ping:', error);
    }
}

sendPing();
```

### Sending Messages to Specific Tabs (`sendMessageToTab`)

When communicating from the background script to a specific content script (in a tab), use `sendMessageToTab()`:

```javascript
// Example: Sending a message from background to a specific tab's content script
import { MessagingStandards, MessagingContexts, MessageActions } from './core/MessagingStandards.js';

const backgroundMessenger = MessagingStandards.getMessenger(MessagingContexts.BACKGROUND);

async function sendMessageToContentScript(tabId, messageData) {
    try {
        const response = await backgroundMessenger.sendMessageToTab(tabId, {
            action: MessageActions.SHOW_NOTIFICATION,
            data: messageData
        });
        console.log('Message to tab response:', response);
    } catch (error) {
        console.error('Error sending message to tab:', error);
    }
}

// Usage example (assuming you have a tabId)
// sendMessageToContentScript(123, { title: 'Alert', message: 'Hello from background!' });
```

### Specialized Messengers

`EnhancedUnifiedMessenger` provides specialized sub-messengers for common feature domains. These offer higher-level, type-safe methods for specific operations.

*   `messenger.specialized.tts`: For Text-to-Speech operations.
*   `messenger.specialized.capture`: For screen capture and OCR.
*   `messenger.specialized.selection`: For element selection mode.
*   `messenger.specialized.translation`: For translation requests and history.

```javascript
// Example: Using specialized TTS messenger
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
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!MessageFormat.validate(message)) {
        console.warn('Received invalid message format:', message);
        return false; // Indicate that the message was not handled
    }

    console.log(`[Background] Received action: ${message.action} from context: ${message.context}`);

    switch (message.action) {
        case MessageActions.PING:
            console.log('Ping data:', message.data);
            sendResponse(MessageFormat.createSuccessResponse({ message: 'pong' }, message.messageId));
            break;
        case MessageActions.TTS_SPEAK:
            // Handle TTS speak request
            // ...
            sendResponse(MessageFormat.createSuccessResponse({ status: 'speaking' }, message.messageId));
            break;
        // ... other actions
        default:
            console.warn('Unknown action received:', message.action);
            sendResponse(MessageFormat.createErrorResponse('Unknown action', message.messageId));
            break;
    }

    return true; // Keep the message channel open for async response
});
```

### Handling Messages in Content Scripts

Content scripts also listen for messages, typically from the background script.

```javascript
// Example: In a content script (e.g., src/content-scripts/index.js or vue-bridge.js)
import browser from 'webextension-polyfill';
import { MessagingStandards, MessageActions, MessageFormat } from './core/MessagingStandards.js';

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!MessageFormat.validate(message)) {
        console.warn('Received invalid message format:', message);
        return false;
    }

    console.log(`[Content Script] Received action: ${message.action} from context: ${message.context}`);

    switch (message.action) {
        case MessageActions.SHOW_NOTIFICATION:
            alert(message.data.message); // Or display a custom notification
            sendResponse(MessageFormat.createSuccessResponse({ status: 'displayed' }, message.messageId));
            break;
        case MessageActions.ACTIVATE_SELECT_ELEMENT_MODE:
            // Activate element selection UI
            // ...
            sendResponse(MessageFormat.createSuccessResponse({ status: 'activated' }, message.messageId));
            break;
        // ... other actions
        default:
            console.warn('Unknown action received:', message.action);
            sendResponse(MessageFormat.createErrorResponse('Unknown action', message.messageId));
            break;
    }

    return true;
});
```

## 5. Error Handling

The `EnhancedUnifiedMessenger` automatically wraps message sending in `try...catch` blocks and provides standardized error responses. When using `sendMessage()` or specialized methods, you can `await` the response and handle errors using standard `try...catch`.

```javascript
try {
    const response = await messenger.specialized.translation.translate('test');
    if (response.success) {
        console.log('Translation:', response.translatedText);
    } else {
        console.error('Translation error:', response.error.message);
    }
} catch (error) {
    console.error('Network or messenger error:', error);
}
```

## 6. Firefox MV3 Compatibility

The `EnhancedUnifiedMessenger` includes internal logic to handle Firefox MV3's specific messaging quirks (e.g., undefined responses for certain API calls). Developers generally do not need to worry about these details, as the messenger abstracts them away, providing a consistent Promise-based interface.

## 7. Key Files

*   `src/core/MessagingStandards.js`: Defines contexts, actions, message format, and acts as the messenger factory.
*   `src/core/UnifiedMessenger.js`: Base class for cross-platform message sending.
*   `src/core/EnhancedUnifiedMessenger.js`: Extends `UnifiedMessenger` with specialized messengers and Firefox MV3 compatibility.
*   `src/background/index.js`: Main background script, registers global message listeners.
*   `src/content-scripts/vue-bridge.js`: Handles message listening and Vue component injection in content scripts.
*   `src/composables/useBrowserAPI.js`: Provides a convenient way for Vue components to access the messenger.
*   `src/core/TranslationService.js`: Uses the messenger to abstract translation-related API calls.
*   `src/background/handlers/`: Contains individual handlers for specific message actions in the background script.

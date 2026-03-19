# Error Management System Guide

This extension utilizes a **centralized and Strategy-Based** error management system. The primary goal of this system is to decouple error detection logic from its presentation layer while adhering to the DRY (Don't Repeat Yourself) principle.

## Architecture

The system consists of four main components operating in a chain:

1.  **Matcher (`ErrorMatcher.js`)**: The **Single Source of Truth (SSOT)** for identifying error types. This module determines whether an error is "Critical," should remain "Silent," or requires "Settings" adjustment.
2.  **Strategies (`ErrorDisplayStrategies.js`)**: Dictates **how** each error should be displayed within specific contexts (Popup, Sidepanel, Content)—deciding between a Toast or UI notification, and setting the severity level (Warning vs. Error).
3.  **Messages (`ErrorMessages.js`)**: Responsible for mapping error codes to Persian/English messages and managing localization (i18n).
4.  **Handler (`ErrorHandler.js`)**: The main orchestrator that coordinates the above components and delivers the final output to the user or the console.

---

## Practical Usage

### 1. Error Management in Components (Standard)
Use the `handle` method to manage errors. This method automatically detects whether the error is related to the extension context (e.g., Reload) or is a functional operational error.

```javascript
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js'

try {
  await someOperation();
} catch (error) {
  // Intelligent error handling based on context
  await ErrorHandler.getInstance().handle(error, { 
    context: 'popup', 
    showToast: true 
  });
}

```

### 2. Retrieving Error Data for UI (Without Auto-Display)

If you want to display the error only within the UI (e.g., a red alert box) without triggering a Toast:

```javascript
const errorInfo = await ErrorHandler.getInstance().getErrorForUI(error, 'sidepanel');
// Output: { message: "...", type: "...", canRetry: true, needsSettings: false }
this.uiError = errorInfo.message;

```

---

## Error Classification (SSOT: ErrorMatcher)

All logical decisions are made within `ErrorMatcher.js`. To change the behavior of a specific error, you only need to edit this file:

* **Silent Errors**: Errors that should not be shown to the user (e.g., context invalidation during a reload).
* **Fatal Errors**: Critical errors that must halt the translation process (e.g., Invalid API Key).
* **Settings Required**: Errors that trigger a "Settings" button alongside the error message.
* **Retryable**: Errors that enable the "Retry" button (e.g., network connectivity issues).

---

## Files and Responsibilities

| File | Primary Responsibility |
| --- | --- |
| `ErrorTypes.js` | Constants defining all error types. |
| `ErrorMatcher.js` | Identification of error types via text/code and logical classification (Fatal, Silent, etc.). |
| `ErrorDisplayStrategies.js` | Determining display methods (Toast level, UI visibility) based on context. |
| `ErrorMessages.js` | Managing text messages and their translations. |
| `ErrorHandler.js` | Final execution of operations (Displaying Toasts, console logging, UI notification). |

---

## Key Notes for Developers

* **Avoid Over-Engineering**: To add a new error, first define it in `ErrorTypes`, then add its text pattern to `ErrorMatcher`. The rest of the system will handle it automatically.
* **Using ExtensionContextManager**: Before performing context-sensitive operations (like sending messages to the Background script), always use `ExtensionContextManager.isValidSync()`.
* **Raw vs. Generic Messages**: The system automatically uses standard translated messages for critical errors (e.g., Quota Exceeded), but for transient errors, it attempts to show the actual server message to facilitate easier debugging.

---

## Usage in Vue.js

A dedicated **Composable** has been designed for Vue components, providing all error management capabilities in a simplified interface.

### 1. Using `useErrorHandler` in Components

This method is recommended for handling local errors within component methods and actions.

```javascript
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'

export default {
  setup() {
    const { handleError, withErrorHandling, isHandlingError } = useErrorHandler();

    const translate = async () => {
      // Option 1: Direct use of handleError
      try {
        await api.call();
      } catch (err) {
        await handleError(err, 'popup-translate');
      }

      // Option 2: Using the Wrapper (much cleaner)
      const result = await withErrorHandling(
        () => api.call(),
        'popup-translate'
      );
    };

    return { translate, isHandlingError };
  }
}

```

### 2. Key Composable Features

* **`withErrorHandling`**: Accepts an async function and automatically handles any errors that occur (eliminating the need for manual try/catch blocks).
* **`handleTranslationError`**: Specifically for translation errors that need to be displayed in text fields rather than as Toasts.
* **`isHandlingError`**: A boolean `ref` indicating if an error is currently being processed (useful for disabling buttons).

### 3. Setting Up a Global Handler for Extension Apps

To ensure no Vue-level errors (e.g., in Lifecycle Hooks) go unnoticed, the `setupGlobalErrorHandler` function must be called in the `main.js` file of each extension entry point (Popup, Sidepanel, Options):

```javascript
import { createApp } from 'vue'
import App from './App.vue'
import { setupGlobalErrorHandler } from '@/composables/shared/useErrorHandler.js'

const app = createApp(App)

// Set up global error handler for the app (e.g., in Popup entry)
setupGlobalErrorHandler(app, 'popup-app')

app.mount('#app')

```

This ensures all uncaught Vue errors are automatically managed by the centralized system.

---

**Last Updated**: March 2026 - Centralizing logic in ErrorMatcher

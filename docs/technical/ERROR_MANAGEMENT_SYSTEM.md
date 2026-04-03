# Error Management System Guide

This extension utilizes a **centralized and Strategy-Based** error management system. The primary goal is to decouple error detection logic from its presentation layer while ensuring **Error Identity Preservation** and a clean console via the **Golden Chain** architecture.

## Architecture

To prevent "Log Storms" and redundant red logs, the system follows a strict propagation chain:

1.  **Providers/Core (Level: WARN)**: Throw structured Error objects. They should **never** call `ErrorHandler.handle()` directly. Technical issues (like API 429/402) are logged as `logger.warn`.
2.  **Middleware/Managers (Level: DEBUG)**: Intercept and propagate errors. They add metadata (context) but don't show UI notifications. They log lifecycle events as `logger.debug`.
3.  **UI/Composables (Level: ERROR)**: The final boundary. Only here is `ErrorHandler.handle()` called to show Toasts/UI Alerts. This is the **only** layer allowed to produce red `console.error` logs.

## Core Mandates

*   **Error Identity Preservation**: Never throw raw strings. Always throw `new Error()` or structured objects. Preserve `originalError`, `type`, and `statusCode`.
*   **Single Red Log Policy**: Only `ErrorHandler.handle()` should produce a red log. All intermediate layers must use `warn` or `debug`.
*   **Context Awareness**: Use `ExtensionContextManager` to silence noise from reloaded/invalidated tabs.

---

## Practical Usage

### 1. Error Management in Components (Standard)
Use the `handle` method in the UI layer. It automatically maps errors to user-friendly messages.

```javascript
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js'

try {
  await someOperation();
} catch (error) {
  // Intelligent error handling - Only in UI/Final layer
  await ErrorHandler.getInstance().handle(error, { 
    context: 'popup', 
    showToast: true 
  });
}
```

### 2. ExtensionContextManager
Before performing cross-context operations, validate the context. If an error occurs, use the manager to get human-readable reasons.

```javascript
if (ExtensionContextManager.isContextError(error)) {
  const userFriendlyMsg = ExtensionContextManager.getContextErrorMessage(error.type);
  // "Extension was reloaded. Please refresh the page."
}
```

## Maintenance & Extension (How-to)

### Adding a New Error Type
To add a new error pattern (e.g., from a new Provider like Anthropic):

1.  **Identify**: Add the new Error constant in `src/shared/error-management/ErrorTypes.js`.
2.  **Classify (The Matcher)**:
    - Open `src/shared/error-management/ErrorMatcher.js`.
    - Add the error's text pattern to `matchErrorToType()`.
    - Add the Type to `FATAL_ERRORS`, `CRITICAL_CONFIG_ERRORS`, or `SILENT_ERRORS` if needed.
3.  **Decide (The Strategy)**:
    - Open `src/shared/error-management/ErrorDisplayStrategies.js`.
    - Map the new Type to a context-specific strategy (Toast, UI, Severity level).
4.  **Localize**: (Optional) Add a translated message in `src/shared/error-management/ErrorMessages.js`.

---

## Files and Responsibilities

| File | Responsibility |
| --- | --- |
| `ErrorTypes.js` | Constants (e.g., `INSUFFICIENT_BALANCE`, `QUOTA_EXCEEDED`). |
| `ErrorMatcher.js` | **SSOT** for mapping raw errors to Types and classifying them (Fatal, Silent). |
| `ErrorDisplayStrategies.js` | Decides: Toast vs UI? Severity level? Retry allowed? |
| `ErrorMessages.js` | **Localization (i18n)**. Repository for multi-language error messages. |
| `ErrorHandler.js` | **Logic Controller**. Coordinates Matcher, Strategy, and Messages to deliver final UI output (Toasts, Alerts, Logs). |
| `ExtensionContextManager.js` | Logic for handling `extension context invalidated` and `message channel closed`. |

---

## Usage in Vue.js (Composables)

The `useErrorHandler` composable simplifies the Golden Chain implementation in Vue components.

```javascript
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'

setup() {
  const { handleError, withErrorHandling } = useErrorHandler();
  
  // withErrorHandling automatically calls ErrorHandler.handle if it fails
  const result = await withErrorHandling(() => api.call(), 'ui-context');
}
```

**Last Updated**: April 2026


# Error Management System Guide

This extension utilizes a **centralized and Strategy-Based** error management system. The primary goal is to decouple error detection logic from its presentation layer while ensuring **Error Identity Preservation** and a clean console via the **Golden Chain** architecture.

## Architecture

To prevent "Log Storms" and redundant red logs, the system follows a strict propagation chain:

1.  **Providers/Core (Level: WARN)**: Throw structured Error objects. They should **never** call `ErrorHandler.handle()` directly. Technical issues (like API 429/402) are logged as `logger.warn`.
2.  **Middleware/Managers (Level: DEBUG)**: Intercept and propagate errors. They add metadata (context) but don't show UI notifications. They log lifecycle events as `logger.debug`.
    *   **Exception**: Critical runtime/unexpected errors in Background handlers (e.g., `TypeError`, `is not a function`) MUST use `logger.error` to ensure visibility, even if they don't trigger UI notifications.
3.  **UI/Composables (Level: ERROR)**: The final boundary. Only here is `ErrorHandler.handle()` called to show Toasts/UI Alerts. This is the **only** layer allowed to produce red `console.error` logs for *expected* business/API errors.

## Core Mandates

*   **Error Identity Preservation**: Never throw raw strings. Always throw `new Error()` or structured objects. Preserve `originalError`, `type`, and `statusCode`.
*   **Single Red Log Policy**: Only `ErrorHandler.handle()` (or critical background exceptions) should produce a red log. All intermediate layers must use `warn` or `debug`.
*   **Context Awareness**: Use `ExtensionContextManager` to silence noise from reloaded/invalidated tabs and handle cross-platform differences.

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
The `ExtensionContextManager` provides automatic protection against "Extension Context Invalidated" errors and ensures the UI remains stable after an update.

#### A. Environment Auto-Detection
The system identifies the current context via `getActiveEnvironment()`:
- Supports `BACKGROUND`, `CONTENT`, `POPUP`, `SIDEPANEL`, `OPTIONS`, `OFFSCREEN`.
- Automatically handles protocol differences for **Chrome, Firefox, Safari, and Edge**.

#### B. Safe Asset Loading
**Mandatory**: Use `safeGetURL(path)` instead of `browser.runtime.getURL(path)`.
- **Problem**: Calling the native API after an update returns "invalid" or causes "Denying load" red errors.
- **Solution**: `safeGetURL` detects context death and returns a **Base64 Fallback Icon** to prevent broken images and 404 network errors.

#### C. Automated User Notifications
`handleContextError(error, context)` automatically notifies the user based on the environment:
- **In Content**: Shows a localized Toast Notification.
- **In Background**: Shows a native System Notification (using `browser.notifications`).
- **Deduplication**: Implements a 7.5s cooldown to prevent spamming the user if multiple components fail at once.

```javascript
if (ExtensionContextManager.isContextError(error)) {
  // This will log as DEBUG and show appropriate UI/System feedback
  ExtensionContextManager.handleContextError(error, 'module:action');
}
```

---

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
| `ErrorTypes.js` | Global error constants (e.g., `QUOTA_EXCEEDED`). |
| `ErrorMatcher.js` | **SSOT** for mapping raw errors to Types and classifying them (Fatal, Silent). |
| `ErrorDisplayStrategies.js` | Decides: Toast vs UI? Severity level? Retry allowed? |
| `ErrorMessages.js` | **Localization (i18n)**. Repository for multi-language error messages. |
| `ErrorHandler.js` | **Logic Controller**. Coordinates Matcher, Strategy, and Messages to deliver final UI output. |
| `ExtensionContextManager.js` | **Context Shield**. Handles reloads, environment detection, and asset safety. |

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

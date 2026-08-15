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

## Public Error Boundary

The system distinguishes **internal errors** (diagnostic/runtime errors used inside the system) from **public errors** (sanitized Errors that are safe to cross a user-facing boundary). Features normally pass errors directly to `ErrorHandler`, which applies the existing classification, message-resolution, and display-strategy behavior. Features requiring a strict sanitized public boundary explicitly use `PublicErrorPolicy` first.

```text
internal/runtime Error
→ ErrorMatcher classification
→ PublicErrorPolicy (when explicitly used by a feature)
→ safe localized display Error
→ ErrorHandler
→ UI
```

`PublicErrorPolicy` prevents raw technical/provider/runtime messages from crossing the user-facing boundary. The original error is preserved as:

```text
displayError.cause
```

so diagnostics remain available without exposing the raw message. When present, `translationOutcome` is preserved on the display error as well.

### Current Consumer Scope

`PublicErrorPolicy` is **not** globally enforced. It lives under `shared/error-management`, but adoption is currently feature-specific:

- **Current production consumer**: `SelectElementManager`.
- **Other translation features** (Popup, Field, Selection, Sidepanel, Whole Page, etc.) do **not** use `PublicErrorPolicy` and retain their existing `ErrorHandler` behavior.

### PublicErrorPolicy Responsibilities

`PublicErrorPolicy.js` determines, for a given internal error:

- whether the error is silent;
- its public-safe semantic type;
- whether internal errors are normalized to a generic `TRANSLATION_FAILED`;
- whether `OPERATION_TIMEOUT` maps to public `TRANSLATION_TIMEOUT`;
- the safe localized display error, resolved through `ErrorMessages`;
- preservation of the original diagnostics as `cause`;
- a default of generic localized failure for unknown/unmapped errors.

Current public policies:

```text
SILENT
LOCALIZED_TYPED
LOCALIZED_GENERIC
```

There is **no** `RAW_ALLOWED` policy. The exact internal ErrorType list is kept in code as the single source of truth.

### Internal Error Normalization

Internal structural failures — such as parser/response-format failures, validation/V3 contract failures, recovery failures, identity/mapping failures, and "no accepted translation results" — must not expose their technical messages through the Select Element UI. At the public boundary they are normalized to a generic localized translation failure. The document does not enumerate the exact internal type list; that remains in code.

### Typed Public Errors

Public sanitization does **not** mean collapsing every failure to `TRANSLATION_FAILED`. Meaningful public categories remain distinct where safe localized messages exist, for example:

- API/configuration errors;
- network/server errors;
- rate limits/quota;
- model overload;
- timeout;
- text-length errors.

Raw provider/runtime messages are denied by default.

### Select Element-Specific Policy

`SelectElementManager` retains only feature-specific outcome policy:

- **cancellation** → silent;
- **partial committed translation** → feature-specific localized partial message (`ERRORS_SELECT_ELEMENT_PARTIAL_TRANSLATION_FAILED`);
- **no translatable content / feature-blocked** → feature-owned silent behavior;
- **element-too-large** → legacy feature-specific actionable message;
- **ordinary terminal errors** → pass through `PublicErrorPolicy`.

### ErrorMatcher vs. PublicErrorPolicy

`ErrorMatcher` is the SSOT for mapping a raw error to an `ErrorType` and for classification helpers such as:

- cancellation;
- silent;
- fatal;
- transient;
- configuration/retry semantics where applicable.

Error classification is **not** equivalent to public-display safety. A technically classified error may still need sanitization before presentation.

### ErrorDisplayStrategies

`ErrorDisplayStrategies` determines presentation behavior such as:

- toast/UI strategy;
- severity/context behavior.

It does **not** determine whether an arbitrary raw `error.message` is safe to expose. Public sanitization policy belongs to `PublicErrorPolicy`.

---

## Golden Chain

The existing propagation chain remains valid for log ownership and error identity:

1.  **Providers/Core (Level: WARN)**: Throw structured Error objects. Never call `ErrorHandler.handle()` directly.
2.  **Middleware/Managers (Level: DEBUG)**: Intercept, propagate, and add context.
3.  **UI/Composables (Level: ERROR)**: Final boundary; only layer that calls `ErrorHandler.handle()`.

For Select Element, the chain includes an optional public sanitization boundary:

```text
Provider/Core
→ Middleware/Managers
→ DomTranslatorAdapter
→ SelectElementManager
→ PublicErrorPolicy
→ ErrorHandler
→ user notification
```

Technical error identity remains available through `cause`. Not all features use this exact chain.

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

### 2. Error Sanitization (Public Boundary)

Features that require explicit public sanitization pass the error through `PublicErrorPolicy` before `ErrorHandler`. This is currently used by `SelectElementManager`.

```javascript
import { createPublicDisplayError } from '@/shared/error-management/PublicErrorPolicy.js'

const displayError = await createPublicDisplayError(error);

if (displayError) {
  await ErrorHandler.getInstance().handle(displayError, {
    context: 'select-element',
    showToast: true,
  });
}
```

- A `null` return means the central **SILENT** policy applies.
- **Never** fall back to the original raw `Error` when `null` is returned.
- Feature-specific policy (such as partial-outcome handling) may run before this boundary.
- This is **not** mandatory for every feature yet; features that directly use `ErrorHandler` keep their existing behavior.

### 3. ExtensionContextManager
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

1.  **Define**: Add the new Error constant in `src/shared/error-management/ErrorTypes.js` if needed.
2.  **Classify (The Matcher)**:
    - Open `src/shared/error-management/ErrorMatcher.js`.
    - Add the error's text pattern to `matchErrorToType()`.
    - Add the Type to `FATAL_ERRORS`, `TRANSIENT_ERRORS`, `CRITICAL_CONFIG_ERRORS`, or the silent/cancellation sets as appropriate.
    - Ensure `isTransientError()`, `isConfigError()`, or `isSilentError()` correctly identifies the new type if it has custom status codes.
3.  **Decide Public Exposure Policy**: If the boundary uses `PublicErrorPolicy`, decide whether the type is:
    - internal/generic → normalized to `TRANSLATION_FAILED`;
    - localized typed → shown with its own public type;
    - silent → never surfaced.
    **Do not create feature-local ErrorType allowlists/denylists** when the rule belongs to shared public-error policy. Keep such policy in `PublicErrorPolicy.js`.
4.  **Localize**: Add/update the localized and fallback message mapping in `src/shared/error-management/ErrorMessages.js`.
5.  **Decide (The Strategy)**: Open `src/shared/error-management/ErrorDisplayStrategies.js` and map the new Type to a context-specific strategy (Toast, UI, Severity level).
6.  **Feature-Specific Behavior**: Add feature-specific behavior only when it is genuinely feature-specific (e.g., partial-outcome messages).
7.  **Test**: Add tests at the correct ownership layer (policy tests in `PublicErrorPolicy.test.js`, message tests in `ErrorMessages.test.js`, feature tests where the feature consumes them).

### Terminology

- **internal error**: diagnostic/runtime error used inside the system.
- **public error**: sanitized `Error` safe to cross a user-facing boundary.
- **public type**: semantic `ErrorType` selected for user presentation.
- **localized message**: message resolved by `ErrorMessages`.
- **display strategy**: how/where the error is rendered.

"Actionable error" is **not** a synonym for "raw-safe error".

---

## Files and Responsibilities

| File | Responsibility |
| --- | --- |
| `ErrorTypes.js` | Global error constants (e.g., `QUOTA_EXCEEDED`). |
| `ErrorMatcher.js` | **SSOT** for mapping raw errors to Types and classifying them (Fatal, Silent, Transient, Config, Cancellation). |
| `PublicErrorPolicy.js` | **Public Error Boundary**. Decides silent/localized-typed/generic display policy; normalizes internal errors to `TRANSLATION_FAILED`; maps `OPERATION_TIMEOUT` to `TRANSLATION_TIMEOUT`; produces safe localized display Errors with the original preserved as `cause`. |
| `ErrorMessages.js` | **Localization (i18n)**. Resolves `ErrorType` → localized/fallback public message. Does not own public exposure policy, raw-message safety, or display strategy. |
| `ErrorDisplayStrategies.js` | Decides: Toast vs UI? Severity level? Retry allowed? Does not decide raw-message safety. |
| `ErrorHandler.js` | **Logic Controller**. Coordinates Matcher, Strategy, and Messages to deliver final UI output. |
| `extensionContext.js` | **Context Shield**. Handles reloads, environment detection, and asset safety. |

Dependency direction (conceptual ownership/data flow, **not** literal import order):

```text
Raw/Internal Error
       │
       ▼
   ErrorMatcher
       │
       ▼
PublicErrorPolicy ──────► ErrorMessages
       │                      │
       └──── safe Error ◄─────┘
              │
              ▼
         ErrorHandler
              │
              ▼
             UI
```

- `PublicErrorPolicy` uses `ErrorMatcher` for classification/type resolution.
- `PublicErrorPolicy` uses `ErrorMessages` to resolve safe localized messages.
- It produces a sanitized `Error` for the consuming feature/UI boundary.
- `ErrorHandler` continues to use the existing matcher/message/display-strategy infrastructure directly.
- `PublicErrorPolicy` is **not** a mandatory stage inside `ErrorHandler`.
- `ErrorDisplayStrategies` remains part of `ErrorHandler`'s presentation infrastructure, not downstream of `PublicErrorPolicy`.
- This diagram is conceptual; it does not represent literal import order.

Compact ownership view:

```text
ErrorMatcher            → classification
PublicErrorPolicy       → public exposure/sanitization policy
ErrorMessages           → localized/fallback message resolution
ErrorDisplayStrategies  → presentation strategy
ErrorHandler            → final coordination/rendering
```

## Stability & Resilience

The system includes advanced mechanisms to handle transient failures and prevent infrastructure overloading.

### 1. Error Classifications (The Matcher)
The `ErrorMatcher` categorizes all errors into three main functional categories:
- **Fatal Errors**: Critical failures (e.g., `FORBIDDEN_ERROR`). These trigger an immediate stop and can trip the Circuit Breaker.
- **Transient Errors**: Temporary issues (e.g., `NETWORK_ERROR`, `SERVER_ERROR`, `MODEL_OVERLOADED`). These allow for automated retries.
- **Config Errors**: User-side configuration issues (e.g., `API_KEY_MISSING`, `INSUFFICIENT_BALANCE`). These fail immediately but **do not** trip the Circuit Breaker.

### 2. Circuit Breaker (RateLimitManager)
To protect both the user's experience and the provider's infrastructure, a Circuit Breaker is implemented:
- **Trigger**: Opens after 5 consecutive transient failures or 1 fatal (non-config) failure.
- **Behavior**: While "Open", all requests to that provider fail immediately with a `CIRCUIT_BREAKER_OPEN` error, preventing redundant network traffic.
- **Recovery**: Automatically attempts to close after a cooldown period (default: 30s).

### 3. Intelligent Retries (QueueManager)
Requests are managed via a priority queue with smart retry logic:
- **Exponential Backoff**: Retries use an increasing delay (e.g., 2s -> 4s -> 8s -> 10s for network errors).
- **Jitter**: Adds randomness to retry timing to prevent "Thundering Herd" problems.
- **First-Error Preservation**: The system remembers the original cause of failure to show the user the most relevant error message, even if subsequent retries fail due to the Circuit Breaker.

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

**Last Updated**: August 2026

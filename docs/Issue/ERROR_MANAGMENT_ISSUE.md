# Architectural Issue: Error Propagation & Masking

## The Core Problem
The extension suffers from **"Error Information Loss"** and **"Layer Leakage"**. Errors are often converted into generic strings in middle layers, killing their identity (`type`, `statusCode`), which makes it impossible for the centralized `ErrorHandler` to show localized messages or "Retry/Settings" buttons. 

Additionally, redundant logging across multiple layers (Provider, Coordinator, Manager, UI) creates a "Log Storm" in the console, making debugging difficult.

---

## The Standardized Solution (The "Golden Chain")

To keep the project clean and professional, every error must follow this lifecycle:

### 1. Low-Level Layer (Providers / Core Logic)
*   **Responsibility**: Execute the task.
*   **Action**: Catch technical error, attach metadata (`type`, `statusCode`), and **Throw**.
*   **Logging**: Use `logger.warn` for technical details (e.g., HTTP 402/429). **Never** call `ErrorHandler` here.
```javascript
// ✅ GOOD: Technical Warn + Structured Throw
const errorType = matchErrorToType(response);
logger.warn(`[Provider] API error (${response.status})`, { msg: body.message });
const err = new Error(body.message);
err.type = errorType;
err.statusCode = response.status;
throw err;
```

### 2. Middle Layer (Orchestrators / Adapters / Messaging)
*   **Responsibility**: Route and coordinate.
*   **Action**: Pass the error object upward. Do **not** wrap it in a new generic `Error` unless you preserve the `originalError`.
*   **Logging**: Demote logs to `logger.debug`. Avoid stacktraces at this level.
```javascript
// ✅ GOOD: Transparent Propagation
try {
  return await service.doWork();
} catch (error) {
  logger.debug("Coordination failed:", error.message);
  throw error; // Just propagate
}
```

### 3. High-Level Layer (Controllers / Composables / UI)
*   **Responsibility**: Manage User Experience.
*   **Action**: The **ONLY** layer that calls `ErrorHandler.handle()`.
*   **Logging**: The `ErrorHandler` will issue the final `logger.error` (Red Log) to signify the operation has failed and the user has been notified.

---

## Logging Level Conventions

| Level | Color | When to use? | Example |
| :--- | :--- | :--- | :--- |
| **Error** | Red | Final failure, System Crash, or 5xx Server errors. | Final handled error in UI, DB connection fail. |
| **Warn** | Orange | Expected technical issues or Business limits. | **HTTP 402 (Balance)**, 429 (Rate Limit), Fallbacks. |
| **Info** | Blue/White | High-level milestones. | "Translation Started", "Feature Loaded". |
| **Debug** | Grey | Internal tracing & step-by-step logic. | "Segment 1/5 processed", "Proxy Disabled". |

---

## Refactoring Roadmap

### Phase 1: Preserve Identity (Done for Messaging)
*   Update `MessagingCore.js` to preserve full error objects in responses.
*   Update `matchErrorToType` to accept full error objects.

### Phase 2: Decouple Logic (In Progress)
*   **Task**: Remove `ErrorHandler.handle()` from all files in `src/features/*/providers/`.
*   **Task**: Ensure all `catch` blocks in `core/` folders only use `debug` or `warn` levels.

### Phase 3: Global Error Boundary
*   Implement a mechanism where UI components subscribe to an error stream instead of calling the handler manually.

---

## Guidance for Developers
1.  **Never throw raw strings**: `throw "Error"` is forbidden. Use `new Error()`.
2.  **Preserve metadata**: If you must re-throw, attach the original error: `newErr.originalError = err`.
3.  **Check the console**: If you see more than one Red (Error) log for a single failure, you are violating the SRP (Single Responsibility Principle).
4.  **Use ErrorMatcher**: Always use `matchErrorToType(error)` to determine the error type instead of hardcoding strings.

**Current Status**: 
*   `Translation System`: **Fully Compliant** (Providers, Coordinator, and UI follow the Golden Chain).
*   `Select Element`: **Compliant** (Redundant logs removed).
*   `Storage/Settings`: Needs Refactoring.

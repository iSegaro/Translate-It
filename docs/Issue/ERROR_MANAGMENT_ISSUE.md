# Architectural Issue: Error Propagation & Masking

## The Core Problem
The extension currently suffers from **"Error Information Loss"** and **"Layer Leakage"** in its error handling flow. Instead of a clean, traceable chain of errors from the source to the UI, errors are often intercepted, renamed, or converted into generic strings, making it impossible for the centralized `ErrorHandler` to make intelligent decisions (like silencing a context error).

### 1. Error Masking (Information Loss)
In mid-layers (like `PageTranslationScheduler.js`), low-level system errors (e.g., `EXTENSION_CONTEXT_INVALIDATED`) are caught and re-thrown as generic business errors (e.g., `new Error("Batch translation failed")`).
*   **Result**: The original identity (`type`, `code`, `stack`) is killed.
*   **Impact**: The UI shows a "Translation failed" toast for a system reload, which should have been silent.

### 2. Layer Leakage (Violation of SRP)
The `ErrorHandler` (which is a **Presentation/Orchestration** layer component) is being imported and used in **low-level logic/core** layers (e.g., `BaseProvider.js`, `FeatureManager.js`).
*   **Violation**: Low-level logic should only care about *executing* a task and *throwing* an error if it fails. It should NOT know how to "handle" or "display" that error to a user.
*   **Impact**: Created circular dependencies (e.g., `Storage -> ErrorHandler -> Notification -> Storage`) that required emergency dynamic imports to fix.

---

## Case Study: Page Translation Chain
1.  **Browser API**: Throws `Extension context invalidated`.
2.  **Messaging Layer**: Detects it, but can only return a result.
3.  **Scheduler Layer**: Receives `{success: false, error: "..."}`.
    *   *Current Buggy Logic*: `throw new Error("Batch translation failed")`. **<-- IDENTITY LOST HERE**
4.  **Manager Layer**: Catches the generic error.
5.  **ErrorHandler**: Receives "Batch translation failed", looks up `ErrorMatcher`, finds no match for "Context", and displays a visible Toast.

---

## 🛠️ Proposed Solution (Refactoring Roadmap)

### Phase 1: Preserve Error Identity (Immediate Requirement)
**Never throw raw strings.** Always preserve the original error or use a structured Error object.
```javascript
// ❌ BAD
catch (err) { throw new Error("Something failed"); }

// ✅ GOOD (Preserve metadata)
catch (err) { 
  const newErr = new Error("Context-aware message");
  newErr.originalError = err;
  newErr.type = err.type || ErrorTypes.UNKNOWN;
  throw newErr;
}
```

### Phase 2: Decouple Logic from Presentation
Remove `ErrorHandler.handle()` calls from core logic files.
*   **Providers/Core Logic**: Should only `throw` structured errors.
*   **Composables/App Entry Points**: These are the "Controllers". Only *they* should call `ErrorHandler.handle()`.

### Phase 3: Implement "Global Error Boundary"
Instead of each file calling `ErrorHandler`, use the existing `pageEventBus` or a native `bubble` mechanism to let errors flow up to a single orchestrator that handles the UI feedback.

---

## Guidance for Future
When you start refactoring:
1.  Look for `ErrorHandler.getInstance()` calls. If they are in a folder like `core/` or `shared/storage/`, they are candidates for removal.
2.  Ensure every `catch` block that re-throws an error attaches the `originalError`.
3.  Standardize the `result` object of messaging to always include an `errorType` field derived from `ErrorMatcher`.

**Current Status**: A "Safety Net" was added to `ErrorHandler.js` to check `isValidSync()` globally, but this is a temporary guard. The root cause (Error Masking) still exists in many catch blocks.

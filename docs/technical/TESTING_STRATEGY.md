# Testing Strategy & Guidelines

## Overview

This document outlines the testing architecture and standards for the **Translate-It** extension. It serves as a roadmap for developers to ensure architectural integrity, prevent regressions, and maintain high performance across all modules.

---

## Testing Stack

- **Framework**: [Vitest](https://vitest.dev/) (Vite-native unit test framework)
- **Environment**: `jsdom` (Simulates browser DOM)
- **UI Testing**: `@vue/test-utils` (For Vue components and composables)
- **Mocks**: Built-in Vitest Mocking + Surgical Polyfill Stubs

---

## Directory Structure

Tests should follow one of these two patterns:
1. **Adjacent**: `MyModule.test.js` next to `MyModule.js` (Preferred for core features).
2. **Dedicated**: Inside a `__tests__` folder within the feature directory.

---

## Core Testing Principles

### 1. The "Surgical Mocking" Rule
Browser extensions rely heavily on global APIs (`browser`, `chrome`, `window.location`). Never try to run real extension APIs in tests.
- Use `vi.stubGlobal('browser', ...)` or `vi.mock('webextension-polyfill', ...)`
- Use `vi.stubGlobal('location', ...)` for URL-sensitive logic (SPAs, URL changes).

### 2. Class-Based Mocking
To prevent **"is not a constructor"** errors in Vitest/jsdom, always mock classes using the class syntax rather than simple objects:
```javascript
// ✅ Correct
vi.mock('@/core/bridge', () => ({
  default: class {
    constructor() { this.initialize = vi.fn(); }
    translate = vi.fn();
  }
}));
```

### 3. Memory Safety (ResourceTracker)
When testing components that inherit from `ResourceTracker`, always verify that `cleanup()` or `deactivate()` successfully removes listeners and timers.
- Check `vi.getTimerCount()` or mock `removeEventListener`.

---

## Layer-Specific Strategies

### A. Utility & Helper Testing (Unit)
Focus on pure functions, regex logic, and data normalization.
- **Location**: `src/utils/`
- **Example**: Testing `PageTranslationHelper.shouldTranslate(text)` to ensure it filters pure numbers or specific script types.

### B. Business Logic & Managers (Integration)
Testing the lifecycle of a feature (e.g., `SelectElementManager`).
- **Key Focus**: Event Bus communication and State transitions.
- **Pattern**: 
    1. Emit event via `PageEventBus`.
    2. Verify manager's internal state.
    3. Verify background message emission.

### C. Vue Composables (Reactivity)
Testing custom hooks like `useTTSSmart` or `usePageTranslation`.
- **Environment**: Requires `mounting` a dummy component if the composable relies on Vue lifecycle (`onUnmounted`).
- **Tools**: Use `flushPromises()` to wait for async state updates.

### D. Provider Testing (Network Logic)
Testing translation providers (Gemini, OpenAI, Google).
- **Focus**: Payload construction and result parsing.
- **Standard**: Mock the `fetch` or `ProviderRequestEngine` to return specific JSON artifacts.

---

## Handling Edge Cases

### 1. Iframe & Shadow DOM
When testing UI components (like `TranslationWindow`), ensure they behave correctly within a Shadow Root:
- Use `attachShadow({ mode: 'open' })` in your test setup if the component logic interacts with parent nodes.

### 2. BiDi & Layout Protection
For page translation tests, verify:
- Injection of `\u200f` (RLM) and `\u200e` (LRM).
- Application of `dir="rtl"` on surgical containers.

### 3. Rate Limits (Optimization Levels)
Verify that `PageTranslationScheduler` scales its `chunkSize` and `maxConcurrent` correctly when the optimization level changes (1 to 5).

---

## Running Tests

```bash
pnpm test          # Run all tests
pnpm test:watch    # Development mode
pnpm test:ui       # Vitest UI (Visual debugger)
pnpm test:coverage # Generate coverage report
```

---

## Developer Checklist for New Tests

- [ ] Does it mock `browser.runtime.sendMessage`?
- [ ] Does it use class-based mocks for Bridge/UI dependencies?
- [ ] Does it verify `ResourceTracker` cleanup?
- [ ] For UI: Are events emitted via `PageEventBus` verified?
- [ ] For Content Scripts: Is `jsdom` environment enabled?
- [ ] Are logs/warnings checked (avoid "Log Storms")?

---
*Last Updated: May 2026*

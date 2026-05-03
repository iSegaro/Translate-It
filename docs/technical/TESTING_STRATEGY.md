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

### 4. Centralized Mocking (`__mocks__`)
To maintain consistency and reduce boilerplate, utilize Vitest's automatic mock resolution. 
- **Pattern**: Place mock implementations in a `__mocks__` folder adjacent to the source file.
- **Usage**: Use `vi.mock('@/path/to/file.js')` without a second argument to trigger auto-loading from the `__mocks__` directory.
- **Example**: Error management infrastructure (e.g., `ErrorHandler`, `ErrorMatcher`) uses centralized mocks in `src/shared/error-management/__mocks__/`. Avoid defining custom mock factories for these modules unless testing specific edge cases.

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

## Coverage Strategy

### Coverage Goals & Targets

Different layers have different coverage expectations based on complexity and business impact:

| Layer | Target Statements | Target Branches | Priority |
|-------|-------------------|-----------------|----------|
| **Utilities & Helpers** | 90%+ | 85%+ | High |
| **Business Logic & Managers** | 85%+ | 80%+ | High |
| **Vue Composables** | 80%+ | 75%+ | Medium |
| **Providers** | 75%+ | 70%+ | Medium |
| **UI Components** | 70%+ | 65%+ | Low |

### Coverage Interpretation

**Coverage Report Location**: `./tests/coverage/index.html`

#### Understanding Metrics:
- **Statements**: Percentage of executable lines tested
- **Branches**: Percentage of conditional paths (if/else, switch) tested
- **Functions**: Percentage of functions/methods with at least one test
- **Lines**: Similar to statements, but excludes blank lines/comments

#### Color Coding:
- 🟢 **Green**: Fully covered (critical paths tested)
- 🟡 **Yellow**: Partially covered (some edge cases missing)
- 🔴 **Red**: Not covered (no tests for this code)

### CI/CD Integration

Configure coverage thresholds in `vitest.config.js`:

```javascript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  reportsDirectory: './tests/coverage',
  thresholds: {
    lines: 75,
    functions: 80,
    branches: 70,
    statements: 75
  }
}
```

**Pipeline Integration Example**:
```yaml
# .github/workflows/test.yml
- name: Run Tests with Coverage
  run: pnpm test:coverage

- name: Check Coverage Thresholds
  run: |
    if [ $? -ne 0 ]; then
      echo "Coverage below threshold"
      exit 1
    fi
```

### Best Practices for Improving Coverage

#### 1. **Focus on Critical Paths First**
- Start with core business logic (translation, TTS, state management)
- Prioritize error handling and edge cases
- Test user-facing features before internal utilities

#### 2. **Address Branch Coverage**
```javascript
// ❌ Incomplete: Only tests one path
it('should translate text', () => {
  expect(translate('hello')).toBe('سلام');
});

// ✅ Complete: Tests both success and error paths
it('should translate text successfully', () => {
  expect(translate('hello')).toBe('سلام');
});

it('should handle translation errors', () => {
  expect(translate(null)).toThrow('Invalid input');
});
```

#### 3. **Test Edge Cases Early**
- Empty/null inputs
- Special characters and Unicode
- Network failures and timeouts
- Browser API unavailability

#### 4. **Use Coverage Reports Strategically**
1. Run `pnpm test:coverage` regularly
2. Open `./tests/coverage/index.html` in browser
3. Click on red files to see uncovered lines
4. Prioritize high-impact, low-effort improvements

#### 5. **Avoid "Coverage for the Sake of Coverage"**
- Don't test trivial getters/setters
- Focus on meaningful behavior, not implementation details
- 100% coverage ≠ bug-free code

### Coverage Tools & Commands

```bash
# Generate full coverage report
pnpm test:coverage

# Coverage for specific file
pnpm test:coverage src/shared/utils/text/markdown.test.js

# Watch mode with coverage
pnpm test:watch --coverage

# Compare coverage over time
pnpm test:coverage -- --compare
```

### Coverage Maintenance

#### Monthly Coverage Review:
1. Generate coverage report: `pnpm test:coverage`
2. Identify decreasing coverage areas
3. Create tickets for uncovered critical paths
4. Update test suite before new features

#### Pre-Release Checklist:
- [ ] Coverage not decreased from baseline
- [ ] New features have minimum 70% coverage
- [ ] Critical paths have 85%+ coverage
- [ ] No new untested error handlers

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

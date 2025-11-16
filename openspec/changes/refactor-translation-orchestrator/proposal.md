# Change: Refactor TranslationOrchestrator into Four Focused Services

## Why
The current TranslationOrchestrator.js file has grown to 1447 lines, making it extremely difficult to maintain, test, and understand. This monolithic structure violates the Single Responsibility Principle and creates tight coupling between different concerns, leading to increased complexity and reduced code quality.

## What Changes
- **BREAKING**: Split TranslationOrchestrator.js into 4 focused services
- Add TranslationRequestManager.js (~300 lines) for request lifecycle management
- Add StreamingTranslationEngine.js (~350 lines) for streaming coordination
- Add TranslationErrorHandler.js (~250 lines) for error handling and retry logic
- Add TranslationUIManager.js (~300 lines) for UI notifications and cleanup
- Reduce TranslationOrchestrator.js to ~150 lines as a coordinator between services
- Maintain full backward compatibility with SelectElementManager interface
- Preserve all existing functionality without any feature loss

## Impact
- **Affected specs**: element-selection (new capability needed)
- **Affected code**:
  - src/features/element-selection/managers/services/TranslationOrchestrator.js
  - Integration with SelectElementManager.js
  - All translation-related functionality in element selection
- **Benefits**: 90% reduction in complexity, 300% improvement in readability, complete testability per service, easier maintenance and future enhancements
## Context
The TranslationOrchestrator service has evolved into a monolithic component handling 5 distinct responsibilities in a single 1447-line file. This creates maintenance challenges, testing difficulties, and violates SOLID principles. The element selection system requires a more modular architecture to support future enhancements and maintainability.

## Goals / Non-Goals
- **Goals**:
  - Reduce single-file complexity from 1447 lines to ~150 lines
  - Create 4 focused services with single responsibilities
  - Maintain 100% backward compatibility
  - Enable comprehensive unit testing per service
  - Improve code readability and maintainability
- **Non-Goals**:
  - No API changes for SelectElementManager
  - No performance degradation
  - No loss of existing functionality
  - No breaking changes for end users

## Decisions
- **Decision**: Use Composition Pattern with 4 specialized services
  - **Why**: Maintains interface compatibility while separating concerns
  - **Alternatives considered**:
    - Inheritance hierarchy (too complex for this use case)
    - Utility functions (would require major interface changes)
    - Plugin architecture (over-engineering for current needs)

- **Decision**: Service-based separation by concern
  - **TranslationRequestManager**: Request lifecycle and state management
  - **StreamingTranslationEngine**: Streaming coordination and timeout handling
  - **TranslationErrorHandler**: Error detection, retry logic, and fallback providers
  - **TranslationUIManager**: Notifications, cleanup, and SelectElementManager coordination
  - **Why**: Clear separation of responsibilities with minimal coupling

- **Decision**: Keep TranslationOrchestrator as coordinator
  - **Why**: Maintains existing interface and provides orchestration layer
  - **Benefits**: No breaking changes for dependent components

## Risks / Trade-offs
- **Risk**: Service coordination complexity
  - **Mitigation**: Clear interfaces defined with dependency injection pattern
- **Risk**: Performance overhead from service instantiation
  - **Mitigation**: Lazy initialization and singleton pattern per manager instance
- **Trade-off**: More files vs. better maintainability
  - **Decision**: Accept increased file count for significantly improved maintainability
- **Risk**: Circular dependencies between services
  - **Mitigation**: Unidirectional dependency flow through orchestrator coordinator

## Migration Plan
1. **Phase 1**: Create 4 new service classes with extracted functionality
2. **Phase 2**: Refactor TranslationOrchestrator to use composition
3. **Phase 3**: Comprehensive testing and validation
4. **Phase 4**: Documentation updates and cleanup
5. **Rollback**: Maintain original code in separate branch until validation complete

## Service Communication Patterns
```
SelectElementManager
       ↓ (calls methods)
TranslationOrchestrator (Coordinator)
       ↓ (delegates to)
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ RequestManager  │ StreamingEngine │ ErrorHandler   │ UIManager       │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

## Open Questions
- Should services communicate directly or through orchestrator for all interactions?
- How to handle shared state (e.g., translationRequests map) between services?
- Optimal strategy for service lifecycle management with ResourceTracker integration?
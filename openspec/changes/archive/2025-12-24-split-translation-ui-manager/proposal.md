# Proposal: Split TranslationUIManager into Focused Services

## Summary

Refactor the monolithic `TranslationUIManager.js` (3,016 lines) into multiple focused, single-responsibility services following the established service composition pattern used in `TranslationOrchestrator`. This refactoring improves maintainability, testability, and code organization while maintaining 100% backward compatibility.

## Current State

The `TranslationOrchestrator` uses four specialized services:
- `TranslationRequestManager` - Request lifecycle management (~200 lines)
- `StreamingTranslationEngine` - Streaming handling (~302 lines)
- `TranslationErrorHandler` - Error handling (~250 lines)
- `TranslationUIManager` - UI & DOM updates (**3,016 lines - significantly oversized**)

### Problem Statement

`TranslationUIManager.js` has grown to 3,016 lines with multiple distinct responsibilities:

| Responsibility | Lines | Key Methods |
|---|---:|---|
| Text matching & similarity | ~150 | `_calculateLevenshteinDistance()`, `_isPartialTranslation()` |
| Notification management | ~100 | `showStatusNotification()`, `dismissStatusNotification()` |
| Streaming translation processing | ~500 | `processStreamUpdate()`, `_processStreamTranslationData()` |
| Stream end processing | ~400 | `processStreamEnd()`, `_handleStreamEndSuccess/Error()` |
| Non-streaming handling | ~200 | `handleTranslationResult()`, `_processNonStreaming*()` |
| Node finding & matching | ~400 | `_findNodesToUpdate()`, `_filterValidNodesForTranslation()` |
| Segment translation handling | ~300 | `_handleMultiSegmentTranslation()`, `_handleSingleSegmentTranslation()` |
| Core DOM manipulation | ~800 | `applyTranslationsToNodes()` - main application |
| Direction (RTL/LTR) management | ~200 | `_applyImmersiveTranslatePattern()` |
| Debug utilities | ~200 | `debugTextMatching()`, `triggerPostTranslationCleanup()` |

### Impact

- **Maintainability**: Large file is difficult to navigate and modify
- **Testability**: Hard to unit test individual concerns
- **Onboarding**: New developers must understand 3,016 lines to work on any single concern
- **Bug Risk**: Changes in one area can inadvertently affect another

## Proposed Solution

Split `TranslationUIManager.js` into 7 focused services:

```
src/features/element-selection/managers/services/
├── TranslationUIManager.js          # Main coordinator (~150 lines)
├── NotificationService.js           # Status & toast notifications (~150 lines)
├── StreamingUpdateService.js        # Real-time streaming updates (~550 lines)
├── StreamEndService.js              # Stream completion handling (~450 lines)
├── DOMNodeMatcher.js                # Node finding & text matching (~500 lines)
├── TranslationApplier.js            # Core DOM application (~850 lines)
└── DirectionManager.js              # RTL/LTR direction handling (~250 lines)
```

### Service Responsibilities

1. **TranslationUIManager** (Coordinator)
   - Delegates to specialized services
   - Maintains backward-compatible public API
   - Orchestrates service initialization and cleanup

2. **NotificationService**
   - Status notifications for translation progress
   - Toast notifications for timeouts and errors
   - SelectElement notification dismissal

3. **StreamingUpdateService**
   - Process real-time streaming translation updates
   - Apply translations immediately for real-time feedback
   - Handle JSON array parsing in streaming responses

4. **StreamEndService**
   - Handle stream completion (success and error paths)
   - Process non-streaming translation results
   - Coordinate final result assembly and fallback processing

5. **DOMNodeMatcher**
   - Find DOM nodes that should receive translations
   - Multi-segment and partial text matching
   - Node validation and filtering

6. **TranslationApplier**
   - Core DOM manipulation for applying translations
   - Translation lookup with multiple matching strategies
   - Wrapper creation and node replacement

7. **DirectionManager**
   - RTL/LTR direction detection and application
   - Text container parent detection
   - Direction attribute management

## Benefits

1. **Maintainability**
   - Each service has a single, clear responsibility
   - Smaller files are easier to navigate and understand
   - Changes are isolated to specific services

2. **Testability**
   - Individual services can be unit tested independently
   - Mock dependencies for focused testing
   - Faster test execution

3. **Code Organization**
   - Related functionality is grouped together
   - Clear separation of concerns
   - Follows established architectural patterns

4. **Onboarding**
   - New developers can understand individual services quickly
   - Clear entry points for each responsibility
   - Reduced cognitive load

5. **Backward Compatibility**
   - Public API remains unchanged through delegation
   - No changes to `TranslationOrchestrator` interface
   - External callers are unaffected

## Implementation Approach

### Phase 1: Create New Services (No Breaking Changes)
1. Create each new service file with extracted code
2. Maintain exact same method signatures
3. Add comprehensive unit tests for each service

### Phase 2: Refactor TranslationUIManager
1. Convert to coordinator pattern with delegation
2. Initialize all specialized services in constructor
3. Delegate public methods to appropriate services

### Phase 3: Update Exports
1. Update `managers/index.js` to export new services
2. Keep `TranslationUIManager` as main export

### Phase 4: Validation
1. Run full test suite
2. Manual testing of element selection feature
3. Verify no regressions in translation functionality

## Alternatives Considered

### Alternative 1: Keep Monolithic File
**Pros**: No refactoring effort required
**Cons**: Continued maintenance burden, poor testability

### Alternative 2: Split into More Granular Services (10+ files)
**Pros**: Even more focused responsibilities
**Cons**: Over-engineering, excessive indirection, harder to understand relationships

**Decision**: 7 services provides the right balance between focus and complexity

## Dependencies

- Existing service composition pattern in `TranslationOrchestrator`
- `ResourceTracker` base class for automatic cleanup
- Centralized logging with `getScopedLogger`
- Existing text processing and DOM utilities

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking changes during refactoring | Medium | High | Comprehensive testing, delegation pattern preserves API |
| Circular dependencies between services | Low | Medium | Careful dependency design, orchestrator as mediator |
| Performance regression | Low | Low | Same operations, just reorganized; measure before/after |
| Increased bundle size | Low | Low | Same code, just split; no new dependencies |

## Success Criteria

1. All existing tests pass
2. New unit tests added for each service
3. No regressions in element selection functionality
4. Each service file < 1,000 lines
5. Code coverage maintained or improved
6. Manual testing confirms all features work as before

## Related Work

- `refactor-select-element-direction-handling` - Partially overlaps with RTL/LTR concerns
- `segment-id-translation-system` - Uses `TranslationUIManager` for DOM application

This refactoring enables those changes to work with cleaner, more focused services.

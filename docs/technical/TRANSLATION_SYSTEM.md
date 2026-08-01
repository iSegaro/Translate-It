# Translation System Guide

The translation system handles translation requests from popup, sidepanel, and content scripts through a **Unified Translation Service** architecture (2025) that provides centralized coordination, duplicate prevention, and intelligent result routing.

## Quick Start

### Frontend Usage
```javascript
// In Vue Components
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'

// For Popup
const { triggerTranslation, isTranslating, translatedText } = useUnifiedTranslation('popup')

// For Sidepanel
const { triggerTranslation, isTranslating, translatedText } = useUnifiedTranslation('sidepanel')

// Translate text
await triggerTranslation(sourceLang, targetLang)
```

### Message Flow
```
UI Component → useMessaging → browser.runtime.sendMessage
     ↓
Background: UnifiedTranslationService → handleTranslate.js
     ↓
TranslationEngine → Provider → Result Dispatcher → Target Context
```

### Unified Translation Service Architecture (2025)

The translation system has been completely redesigned with a **Unified Translation Service** that provides:

**Core Components**:
- **UnifiedTranslationService**: Central coordinator for all translation operations
- **TranslationRequestTracker**: Manages request lifecycle and prevents duplicates
- **UnifiedResultDispatcher**: Intelligent result routing based on translation mode

**Translation Modes**:
- **Field Mode**: Direct response pattern for text field translations
- **Select Element Mode**: Streaming/broadcast for large content translations
- **Standard Mode**: Regular translation with context-based routing

## Core Architecture

### Translation Handler
**File**: `src/features/translation/handlers/handleTranslate.js`
- Entry point for ALL translation requests
- Integrates with UnifiedTranslationService for centralized processing
- Delegates to UnifiedModeCoordinator for mode-specific handling

### Unified Translation Service
**File**: `src/core/services/translation/UnifiedTranslationService.js`
- **Central coordinator** for all translation operations
- **Request tracking** to prevent duplicate processing
- **Mode-specific routing** for optimal result delivery
- **Lifecycle management** with automatic cleanup

### Translation Request Tracker
**File**: `src/core/services/translation/TranslationRequestTracker.js`
- **Request lifecycle management** from creation to completion
- **Duplicate detection** using messageId-based tracking
- **Element data recovery** for resilient field mode translations
- **Automatic cleanup** of completed requests

### Runtime Ownership And Terminal Rules

Every translation request has one globally unique `messageId`. Exact-ID cancellation, queue removal, rate-limit cleanup, lifecycle aborting, and stream routing use this ID; text, tab, toast, and mode are never cancellation identities.

| Owner | Responsibility |
|---|---|
| Workflow/UI | Current intent, run/session identity, and stale presentation suppression. PDF, page, OCR, and window workflows retain their own session ownership. |
| `TranslationLifecycleRegistry` | `AbortController`, cancellation tombstones, pre-registration cancellation, and execution registration. |
| `TranslationRequestTracker` | Request status, active tab/toast/retry indexes, immutable terminal transitions, metrics, and retained terminal diagnostics. |
| `TranslationEngine` | Provider execution entry point and exact-ID cancellation propagation. |
| `QueueManager` / `RateLimitManager` | Admission and exact-ID pending-work removal. |
| `StreamingManager` | Sender routing, chunks, local terminal delivery suppression, and delayed stream retention. It does not own workflow lifecycle. |
| `UnifiedResultDispatcher` | Delivery of accepted results and cancellation notifications. Delivery failure never rewrites tracker state. |

Terminal states are `completed`, `failed`, `cancelled`, and `timeout`. `TranslationRequestTracker` accepts one terminal transition only. Rejected late transitions never dispatch a normal result. Terminal records remain available for five minutes of diagnostics, but leave active tab, toast, and retry indexes immediately.

Cancellation snapshots exact active IDs, marks accepted tracker requests cancelled, notifies their original sender once, then independently attempts lifecycle abort, stream cancellation, rate-limit cleanup, and queue removal. A cancellation tombstone rejects execution when cancellation arrives before lifecycle registration.

Forbidden patterns:
- Raw terminal status writes outside `TranslationRequestTracker`.
- Cancellation by text, mode, tab, or toast rather than exact `messageId`.
- Result delivery before tracker accepts its terminal transition.
- Treating every rejected transition as cancellation.
- Keeping retained terminal records in active indexes.
- Using `StreamingManager` as a workflow lifecycle owner.
- Broad cancellation where exact-ID ownership exists.

## Runtime Architecture Freeze

### Request Identity

One logical request owns one stable, globally unique `messageId` from dispatch through terminal retention. Distinct logical requests must never reuse an ID. The tracker rejects both active and retained terminal IDs; callers must generate a new ID instead of replacing a record.

```text
UI / workflow creates messageId
  -> request tracker registration
  -> lifecycle registration
  -> provider / queue / rate-limit / stream work keyed by messageId
  -> terminal tracker record retained for diagnostics
```

### Ownership

| Layer | Owns | Does Not Own |
|---|---|---|
| Workflow / UI | Current user intent, run/session identity, stale presentation suppression | Backend lifecycle state |
| `TranslationRequestTracker` | Request lifecycle, active indexes, terminal transition, metrics, terminal retention | Provider aborting or result transport |
| `TranslationLifecycleRegistry` | Abort controllers, tombstones, pre-registration cancellation, execution registration | Tracker terminal state |
| `TranslationEngine` | Provider entry and exact-ID cancellation propagation | UI session ownership |
| `ProviderCoordinator` | Provider selection and admission | Workflow staleness |
| `QueueManager` | Queue/retry ownership and exact-ID removal | Tracker terminal transition |
| `RateLimitManager` | Limiter admission and pending request cleanup | UI delivery |
| `StreamingManager` | Sender routing, chunk transport, local stream terminal suppression, delayed stream retention | Translation workflow lifecycle |
| `UnifiedResultDispatcher` | Accepted result and cancellation delivery; per-instance result deduplication | Tracker state mutation |

### Request Lifecycle

```text
CREATED
  -> TRACKED
  -> REGISTERED
  -> QUEUED / RATE-LIMITED
  -> DISPATCHED
  -> STREAMING (when supported)
  -> COMPLETED | FAILED | CANCELLED | TIMEOUT
  -> retained diagnostic record
  -> periodic cleanup
```

`TranslationRequestTracker` exclusively owns terminal lifecycle transitions. A transition returns an explicit acceptance result. Only an accepted completion may trigger normal result dispatch.

| Current State | Requested Terminal State | Result |
|---|---|---|
| `pending`, `processing`, `streaming` | `completed`, `failed`, `cancelled`, `timeout` | Accepted once |
| Any terminal state | Any terminal state | Rejected without metadata, metric, or timestamp mutation |

Late provider results, errors, timeout callbacks, and duplicate result messages are harmless after a terminal transition because they cannot replace tracker state or trigger normal delivery.

### Exact-ID Cancellation And Timeout

```text
CANCEL_TRANSLATION { messageId }
  -> tracker cancel transition
  -> cancellation delivery for accepted cancellation
  -> lifecycle abort and tombstone
  -> stream cancellation
  -> rate-limit cleanup
  -> queue/retry cleanup

Timeout for messageId
  -> CANCEL_TRANSLATION { messageId, timeout: true }
  -> tracker timeout transition, only while active
  -> same exact-ID cleanup sequence
  -> late duplicate timeout skips all cleanup
```

Timeout callbacks act only for their original request ID. A rejected timeout transition means that completion, failure, cancellation, or an earlier timeout already won; no additional cleanup is attempted.

### Cleanup Matrix

| Terminal Path | Tracker | Lifecycle / Provider | Queue / Rate Limit | Stream / Delivery |
|---|---|---|---|---|
| Success | Completed record retained; active indexes removed | Unregister after execution | Provider completion | Accepted result delivery; stream ends if present |
| Failure | Failed record retained; active indexes removed | Unregister after execution | Retry/reject cleanup | Error terminal delivery if stream exists |
| Cancellation | Cancelled record retained; active indexes removed | Abort and tombstone | Exact-ID removal | One cancellation/end delivery; late chunks ignored |
| Timeout | Timed-out record retained; active indexes removed | Exact-ID abort | Exact-ID removal | Timeout prevents later normal delivery |
| Empty batch | Normal service terminal handling | Batch executor allocates no lifecycle controller or provider work | None | Immediate empty success |
| Retention expiry | Terminal diagnostic record deleted | None | None | None |

Terminal records remain in tracker storage for diagnostics but leave tab, toast, and retry indexes immediately. They are not eligible for active request selection or bulk cancellation.

### Timeout Ownership Matrix

| Timeout Owner | Request Identity | Terminal Action |
|---|---|---|
| Messaging request timeout | Outgoing `messageId` | Sends timeout-marked exact cancellation |
| Unified streaming coordinator | Active streaming `messageId` | Sends timeout-marked exact cancellation |
| Translation window timeout | Window request `messageId` | Sends timeout-marked exact cancellation before local rejection |
| Smart field timeout | Field request `messageId` | Aborts local operation and sends timeout-marked exact cancellation |
| Generic batch timeout | Batch `messageId` / lifecycle controller | Aborts provider signal; tracker records timeout through service result handling |

### Streaming And Delivery

`StreamingManager` is a transport owner, not a workflow owner. It accepts chunks only while its local stream is active. Its terminal stream states are immutable and its delayed retention exists only for late transport messages.

`UnifiedResultDispatcher` owns delivery after tracker acceptance. Its `processedResults` set is per dispatcher instance, so duplicate-result suppression remains scoped to the owning `UnifiedTranslationService` instance. Delivery failure returns a delivery error and never rewrites accepted tracker state.

### Specialized Workflow Boundaries

| Workflow | Local Owner | Shared Runtime Boundary | Stale Guard |
|---|---|---|---|
| PDF visible blocks | `PdfTranslationCoordinator.activeRunId` | Exact active request IDs | Run ID before block update |
| PDF Region OCR | Region operation and run ID | OCR executor then window translation | Operation/run validation |
| PDF translation windows | Selection session and active message ID | Standard translation request | Session/message validation |
| Page translation | Scheduler session context | Unified batch requests | Session-context validation |
| Hover translation | Current message ID | Standard translation request | Latest-ID check before display |
| Screen OCR | Capture session ID | Downstream window/selection translation | Capture-session validation |
| Text replacement | Local field/toast ownership | Exact field request cancellation | Local message/toast guard |

### Frozen Runtime Invariants

- One logical request owns one stable `messageId`.
- Distinct logical requests never reuse a `messageId`.
- Tracker exclusively owns immutable terminal lifecycle transitions.
- Timeout behaves as exact-ID cancellation and only acts while the same request is active.
- Late callbacks cannot replace terminal state or publish normal stale results.
- Lifecycle ownership is separate from stream transport and UI presentation ownership.
- `StreamingManager` owns transport only; workflows own stale presentation rules.
- Dispatcher owns delivery only; delivery errors never alter tracker terminal state.
- Empty executable batches allocate no provider, lifecycle, timeout, or execution resources.

### Unified Result Dispatcher
**File**: `src/core/services/translation/UnifiedResultDispatcher.js`
- **Intelligent result routing** based on translation mode
- **Direct response** for field mode translations
- **Broadcast delivery** for select element streaming
- **Tab-specific routing** for context isolation

### Vue Composables
**File**: `src/features/translation/composables/useUnifiedTranslation.js`
- Unified reactive translation state management for both popup and sidepanel
- Context-specific message filtering and error handling
- Integrated with `useSettingsStore` for automatic language resolution

### Translation Engine
**File**: `src/features/translation/core/translation-engine.js`
- Provider coordination and selection
- Cache management via `StorageCore`
- Intelligent provider waterfall logic

## Translation Flows

### 1. Popup Translation
```
User Input → usePopupTranslation → handleTranslate.js → Provider → UI Update
```

### 2. Sidepanel Translation  
```
User Input → useSidepanelTranslation → handleTranslate.js → Provider → UI Update
```

### 3. Select Element Translation
```
DOM Selection → JSON Payload → UnifiedTranslationService → Streaming Coordinator → DOM Update
```

### 4. Subtitle Translation
```
File Upload → SubtitleTranslationCoordinator → Progressive Batching → SrtAdapter → UI Preview
```
*Note: Subtitle translation uses the unified provider infrastructure but maintains a decoupled orchestration flow to handle large file volumes and format preservation.*

**Special Processing**: Select element mode uses streaming for large content:
- **Streaming Updates**: Real-time translation progress
- **JSON Processing**: Efficient handling of multiple text elements
- **Broadcast Results**: Updates sent to all relevant tabs
- **Progress Tracking**: Visual feedback during translation

### 4. Field Mode Translation (New)
```
Text Field → Direct Request → UnifiedTranslationService → Direct Response → Field Update
```

**Field Mode Characteristics**:
- **Direct Response**: No broadcast, results returned directly
- **Element Tracking**: Resilient element reference management
- **Queue-Free**: Eliminated complex queueing mechanism
- **Duplicate Prevention**: Request tracking prevents multiple processing

## Provider System

### Supported Providers
- **Google Translate** (Free, default)
- **DeepL** (AI-powered with formal/informal styles)
- **Google Gemini** (AI-powered)
- **OpenAI** (GPT models)
- **Bing Translate** (Free tier)
- **Yandex** (Free tier)
- **DeepSeek** (AI service)
- **OpenRouter** (AI aggregator)
- **WebAI** (AI service)
- **Browser API** (Chrome 138+)
- **Custom APIs** (OpenAI-compatible)

### Provider Interface
```javascript
class BaseProvider {
  async translate(text, sourceLang, targetLang, mode) {
    // Implementation
    return {
      translatedText: 'result',
      sourceLanguage: 'detected',
      targetLanguage: 'target',
      provider: 'name'
    }
  }
}
```

### Provider Selection
```javascript
// In TranslationEngine
const provider = this.factory.getProvider(data.provider || 'google-translate')
const result = await provider.translate(text, sourceLang, targetLang, mode)
```

## Context Separation

### Multi-Context Isolation
The system ensures that translation results are routed only to the initiating context (Popup, Sidepanel, or Content Script). This prevents cross-component interference.

### Implementation
Context-based message filtering:
```javascript
// Each component filters by context
browser.runtime.onMessage.addListener((message) => {
  if (message.context !== MessagingContexts.POPUP) {
    return false // Ignore non-popup messages
  }
  // Handle popup-specific updates
})
```

## Message Format

### Standard Message
```javascript
{
  action: "TRANSLATE",
  context: "popup", // or "sidepanel", "content"
  data: {
    text: "Hello",
    provider: "google-translate",
    sourceLanguage: "auto",
    targetLanguage: "fa",
    mode: "Popup_Translate"
  }
}
```

### Result Message
```javascript
{
  action: "TRANSLATION_RESULT_UPDATE",
  context: "popup",
  data: {
    translatedText: "سلام",
    originalText: "Hello",
    provider: "google-translate",
    sourceLanguage: "en",
    targetLanguage: "fa"
  }
}
```

## Error Handling

### Translation Errors
```javascript
try {
  const result = await provider.translate(text, sourceLang, targetLang)
} catch (error) {
  return {
    success: false,
    error: {
      message: error.message,
      code: 'TRANSLATION_FAILED',
      provider: providerName
    }
  }
}
```

### Provider Fallback
```javascript
// Automatic fallback to Google Translate if primary provider fails
if (!result.success && data.provider !== 'google-translate') {
  const fallbackProvider = this.factory.getProvider('google-translate')
  result = await fallbackProvider.translate(text, sourceLang, targetLang)
}
```

## Development Guide

### Adding New Translation Context
1. Create composable in `src/composables/useNewContextTranslation.js`
2. Add context to `MessagingContexts` in `MessagingCore.js`
3. Register mode in `config.js` `TranslationMode`
4. Update message listeners for context filtering

### Adding New Provider
1. Implement `BaseProvider` interface
2. Add to `ProviderFactory.js`
3. Register in `ProviderRegistry.js`
4. Add API key handling in settings

### Debugging Translation Issues
1. Check browser console for errors
2. Monitor background service worker logs
3. Verify message format in `handleTranslate.js`
4. Test provider API connectivity
5. Check context filtering in composables

## Performance

### Optimization Strategies
- **Provider Caching**: Reuse provider instances
- **Result Caching**: Avoid duplicate API calls
- **Message Efficiency**: Minimal payload size
- **Context Routing**: Direct message routing

### Bundle Sizes
- **Popup**: ~6KB
- **Sidepanel**: ~8KB  
- **Content Script**: ~100KB (optimization ongoing)

## Key Files

### Core Files - Unified Translation Service (2025)
- `src/core/services/translation/UnifiedTranslationService.js` - Central translation coordinator
- `src/core/services/translation/TranslationRequestTracker.js` - Request lifecycle management
- `src/core/services/translation/UnifiedResultDispatcher.js` - Intelligent result routing
- `src/features/translation/handlers/handleTranslate.js` - Translation request handler
- `src/core/background/handlers/translation/handleTranslationResult.js` - Translation result processor
- `src/features/translation/core/translation-engine.js` - Provider coordination

### Integration Files
- `src/handlers/smartTranslationIntegration.js` - Field mode integration with element recovery
- `src/handlers/content/ContentMessageHandler.js` - Content script message handling

### Supporting Files
- `src/shared/messaging/core/UnifiedMessaging.js` - Unified messaging system
- `src/shared/messaging/core/UnifiedTranslationCoordinator.js` - Streaming coordination
- `src/features/translation/stores/` - Translation state management
- `src/features/translation/providers/` - Provider implementations

## Summary

The translation system provides:
- **Unified Architecture**: All translations coordinated through UnifiedTranslationService
- **Duplicate Prevention**: Request tracking eliminates duplicate processing
- **Mode-Specific Routing**: Optimal result delivery based on translation mode
- **Resilient Element Management**: Smart recovery for field mode translations
- **Streaming Support**: Real-time updates for large content translations
- **Context Isolation**: Components only receive relevant messages
- **Provider Flexibility**: Easy switching between translation services
- **Cross-Browser Support**: Chrome and Firefox compatibility
- **Error Resilience**: Comprehensive error handling and recovery

**Key Insight**: The **UnifiedTranslationService** is the core of all translation operations, providing centralized coordination, intelligent routing, and comprehensive lifecycle management for all translation requests regardless of source or mode.

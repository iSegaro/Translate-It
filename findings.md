# Messaging Audit Findings

Date: 

Scope: static audit of messaging usage, listener lifecycle, ACK behaviors, port usage, and timeout/retry config. No runtime browser tests were executed; audit is static + code analysis.

---

## 1) Static scan results (summary)
Files referencing messaging APIs:

- src/composables/usePopupTranslation.js
  - uses `browserAPI.onMessage.addListener(...)` in `onMounted` but does NOT remove listener in `onUnmounted` (comment explicitly says no cleanup). Possible listener leak or duplicated handling when component remounts.

- src/composables/useSelectionWindows.js
  - sets a message listener via `browserAPI.onMessage.addListener(messageListener)` and returns a cleanup that removes it. Good.

- src/composables/useTranslationModes.js
  - registers `_selectStateHandler` via `browser.runtime.onMessage.addListener` and unregisters it in `_unregisterSelectStateListener`. Good.

- src/composables/useSidepanelTranslation.js
  - registers and removes listener (add/remove present). Good.

- src/components/feature/SubtitleTranslationPanel.vue
  - registers and removes listener (uses call(..., handleSubtitleMessage) pattern). Good.

- src/views/sidepanel/SidepanelApp.vue
  - registers `handleMessage` and removes it in unmount. Good.

- src/managers/content/windows/translation/TranslationHandler.js
  - adds and removes listeners properly for translation result expectations. Good.

- src/background/index.js
  - new `onConnect` handler added to accept port and uses `port.onMessage.addListener` and `port.onDisconnect`. Good.

- src/messaging/core/ReliableMessaging.js
  - adds `port.onMessage.addListener` and attempts to remove listener/cleanup in promise flow. Basic protections in place.

- src/content-scripts/index.js
  - registers `browser.runtime.onMessage.addListener` with inline handler (no explicit remove). Content scripts are ephemeral and running in page context; typically ok but consider potential multiple registrations if script re-injects.

- src/core/SimpleMessageHandler.js
  - single global onMessage listener in background; routes to registered handlers. This is the centralized router.

## 2) Listener lifecycle findings
- Good patterns: many composables/components correctly register and remove message listeners (e.g., `useSelectionWindows`, `useTranslationModes`, `useSidepanelTranslation`, `SidepanelApp.vue`, `SubtitleTranslationPanel.vue`, `SelectElementManager`), which is ideal.

- Issue: `src/composables/usePopupTranslation.js` registers `browserAPI.onMessage.addListener(...)` in `onMounted` but the `onUnmounted` handler contains a comment "No specific cleanup needed for browser.runtime.onMessage.addListener" and does not remove the listener. This will cause the listener to persist across mounts and can cause duplicated handlers / stale closures calling into removed component state. Recommendation: add a named listener and remove it in `onUnmounted`.

- Note: content scripts (src/content-scripts/index.js) add an onMessage listener; content scripts live per page and are re-injected on reloads; generally they don't need explicit remove, but if you register multiple times on reload you might get duplicates — ensure initialization guards.

## 3) ACK / Response behavior findings
- Background translation handlers (notably `handleTranslate` and `handleTranslateText`) currently perform the translation work and then return a response (or send a `TRANSLATION_RESULT_UPDATE` to the tab). In other words, the `sendMessage` call from the sender will not resolve until the handler has finished processing (the handler returns after processing). This means there is no immediate ACK when using `runtime.sendMessage`.

- Implication: callers that expect an immediate short ACK (e.g., within 1s) from `sendMessage` could timeout, particularly if the translation provider is slower. Our `sendReliable` attempts `sendMessage` and expects a quick response (ACK). In cases where the background handler is slow, `sendMessage` may block until full processing completes — which may be OK (it gives final status as response), but it defeats the purpose of expecting an ACK + async final result split.

- We added a port-based handler in `src/background/index.js` that does `port.postMessage({type:'ACK', messageId})` immediately and then processes translation asynchronously and posts `RESULT`. That is good for port path, but `sendMessage` path still lacks immediate ACK.

- Recommendation:
  - Either: update background onMessage handlers for critical actions (TRANSLATE) to immediately respond with ACK (i.e., call `sendResponse({ack:true, messageId})`) and perform processing asynchronously, sending final RESULT via `tabs.sendMessage` or via ports. This preserves a fast ACK for `sendMessage` usage.
  - Or: prefer using port-based path for critical messages (i.e., call `sendReliable` which falls back to port), and update callers to rely on port for reliability. We have implemented fallback, but for completeness consider making handlers send ACK also for sendMessage.

## 4) Port usage findings
- Background `onConnect` handler (added) posts ACK immediately and posts RESULT when finished. It also has `onDisconnect` listener. Good.
- `ReliableMessaging` opens a port named `reliable-messaging` for fallback and listens for ACK/RESULT. It removes listener and disconnects port on timeouts. Good.
- Recommendation: ensure port name is consistent and documented, and that all entry points that create a port call `port.disconnect()` on unmount or when done.

## 5) Timeouts and retry config review
- Current defaults used in `sendReliable`:
  - ackTimeout: 1000 ms
  - retries: 2
  - backoff: [300ms, 1000ms]
  - totalTimeout (port): 12000 ms

- These values are reasonable as a default. If you frequently hit network slowness or provider latency, consider increasing ackTimeout or adding more retries. For translation requests that may legitimately take seconds, rely on port path or increase total timeout.

## 6) Recommended code changes (patch list)
- Fix listener leak in `usePopupTranslation.js`:
  - Make onMounted register a named listener function and store reference; in onUnmounted call `browserAPI.onMessage.removeListener(listener)`.

- Ensure background ACK for sendMessage path OR document that sendMessage path may be slow and rely on sendReliable:
  - Option A (preferred for minimal changes): Modify `SimpleMessageHandler` or message router to automatically return an immediate ACK for `TRANSLATE` action (i.e., return `{ack:true}` quickly) and continue processing asynchronously. This is a central change.
  - Option B: Modify `handleTranslate` and `handleTranslateText` to accept `sendResponse` callback (make them 3-arg handlers) and call `sendResponse({ack:true, messageId})` immediately before performing heavy processing. This requires the SimpleMessageHandler to call handlers in callback mode for those actions; it already supports callback-style if handler.length>=3.

- Add unit/test coverage for messaging reliability in the codebase: tests for `ReliableMessaging` expected behaviors (mock runtime) and for background `onConnect` behavior.

## 7) Smoke test plan (manual; to be executed)
1. Normal quick translation — confirming no regressions.
2. Artificial delay in background handler (simulate long provider latency): ensure `sendReliable` falls back to port and UI receives result via port path.
3. Force `sendMessage` to throw (simulate background SW not awake) — ensure fallback to port and recovery.
4. Close tab during processing — ensure no crash and proper cleanup logged.

## 8) Findings summary
- Major actionable item: `usePopupTranslation` lacks removeListener; fix required.
- Important design note: sendMessage handlers do not currently send immediate ACK; rely on `sendReliable` port fallback for reliability. Consider adding immediate ACK for sendMessage path for better behavior.

---

Refer to the main issue: see `issue.md` for overall plan and rationale. This findings report recommends the above patches and smoke tests.


## Migration actions performed (summary)
- Updated `useMessaging` to prefer `sendReliable` and fall back to `browser.runtime.sendMessage` only as last resort.
- Migrated several direct `sendMessage` usages to `sendReliable` to ensure retries and port fallback:
  - `src/composables/useDirectMessage.js`
  - `src/composables/useTranslationModes.js`
  - `src/content-scripts/index.js`
  - `src/components/content/TranslationTooltip.vue`
  - `src/managers/content/windows/translation/TTSManager.js`
  - `src/managers/browser-specific/capture/CaptureOffscreen.js`
  - `src/managers/content/SelectElementManager.js`

These changes aim to reduce message drops when the service worker is asleep or slow to respond. The `ReliableMessaging` module already existed and implements ackTimeout, retries, backoff, and port fallback.

## Remaining items / follow-ups
- Fix listener leak in `src/composables/usePopupTranslation.js` (register/remove listener consistently).
- Consider sending immediate ACKs in background `onMessage` handlers for critical actions (TRANSLATE) when callers use `sendMessage` and expect a quick ACK. Alternatively, document that critical calls must use `sendReliable`.
- Add unit tests for `ReliableMessaging` behaviors and for background `onConnect`/port handling.
- Run smoke tests in environments that emulate service worker sleep/wake lifecycles and slow provider responses.

## Date of migration update
Date: 


### Additional files migrated in this update
- `src/handlers/context-menu-handler.js`
- `src/handlers/content/CaptureHandler.js`
- `src/handlers/smartTranslationIntegration.js`
- `src/handlers/subtitleHandler.js`
- `src/background/handlers/translation/handleTranslate.js`
- `src/background/handlers/element-selection/selectElementStateManager.js`
- `src/managers/content/SelectElementManager.js`

All of the above now prefer `sendReliable` for outgoing messages to the background, or use `sendReliable` when sending updates; in a few places we kept a final fallback to `browser.runtime.sendMessage` inside a try/catch where `sendReliable` may not be importable in unusual build/runtime contexts.

## Changes in this update
- Fixed listener leak in `src/composables/usePopupTranslation.js` by registering a named listener and removing it in `onUnmounted`.
- Removed final fallbacks that called `browser.runtime.sendMessage` as a last resort; now code prefers `sendReliable` and surfaces errors to callers instead of attempting direct `sendMessage`.

These changes make the messaging more consistent and avoid reintroducing the unreliable behavior that `sendReliable` is intended to mitigate.

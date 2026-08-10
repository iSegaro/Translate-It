# Conversation Contract

Authoritative contract for conversation/context participation in AI-provider translation. Conversation/history participation is **separate from provider-call success**.

- **Owner(s)**: `BaseAIProvider`, `AIConversationHelper`, `TranslationSessionManager`, `AIResponseParser`.
- **Scope**: conversation candidate lifecycle for AI providers.
- **Status**: finalized for the documented scope.

- **Owner of storage**: `TranslationSessionManager` (in-memory session map, TTL 30 min, max 50, LRU evict). `AIConversationHelper` reads/writes through it and does **not** touch browser storage.

---

## 1. Purpose and Scope

Conversation/history participation is separate from provider-call success. A provider call may succeed without any conversation commit (e.g. structured recovery); conversely, no history entry may be created for a failed request.

---

## 2. Terminology

| Term | Definition |
| --- | --- |
| **conversation candidate** | The staged, commit-or-discard payload for one structured primary translation (`createConversationCommitCandidate`). |
| **stage** | Capture the candidate payload before any commit (at most once). |
| **commit** | Persist the staged candidate into conversation history (at most once). |
| **discard** | Drop the staged candidate; not committed (at most once for the terminal path). |
| **primary translation** | A `PRIMARY_TRANSLATION` provider call (participates in conversation). |
| **structured recovery** | A provider-local `STRUCTURED_RECOVERY` pass after a contract violation (does not participate, regardless of subset or full-batch scope). |
| **late settlement** | A provider outcome arriving after the request reached a terminal state. |
| **history-enabled request** | A request whose call purpose participates in conversation. |

---

## 3. Participation Policy

`AIConversationHelper.shouldParticipateInConversation(callPurpose)` (module-internal):

```text
callPurpose === PRIMARY_TRANSLATION (or undefined/invalid)
→ participates

callPurpose === STRUCTURED_RECOVERY
→ excluded from conversation history
```

- `PRIMARY_TRANSLATION` participates.
- `STRUCTURED_RECOVERY` is **excluded from conversation history** — recovery must not contaminate the normal conversation context.
- Nothing is written to session history without participation.

---

## 4. Primary Success Lifecycle

```text
primary call succeeds
→ candidate staged
→ parser/contract accepted
→ abort check
→ commit once
```

- Staging captures the payload (`stage(payload)`, only if not settled/staged).
- `AIResponseParser.parseBatchResult` acceptance is required.
- The late-abort check runs **after** acceptance and **before** commit.
- Commit always records with `callPurpose: PRIMARY_TRANSLATION`.

**No commit before candidate acceptance.**

---

## 5. Contract Violation Lifecycle

```text
structured candidate invalid (contractViolation)
→ discard primary candidate
→ structured recovery (selective or full, per provider policy)
```

- The invalid primary candidate is **discarded**; recovery does not reuse or commit it. The rejected candidate must never be committed merely because recovery later succeeds.
- Recovery scope may cover a subset of invalid request units or the full structured batch; conversation semantics are identical either way. The subset or full distinction is a provider recovery-policy concern, not a conversation concern.
- Recovery is a single provider-local pass (see [TRANSLATION_PROVIDER_LOGIC.md](../TRANSLATION_PROVIDER_LOGIC.md)).
- Exactly **one** sequential recovery pass is attempted.

---

## 6. Recovery Lifecycle

- Call purpose: `STRUCTURED_RECOVERY`.
- No conversation participation (excluded from history, per [Participation Policy](#3-participation-policy)).
- Recovery may operate on a subset of invalid request units or the full structured batch; conversation isolation is unchanged either way.
- Atomic failure: a failure rejects the active structured-recovery operation.
- Original recovery error is propagated with its `type` preserved (e.g. `NETWORK_ERROR`).

***

## 6.5. Repair Context Lifetime

`repairContext` is transient recovery metadata supplied to the structured
recovery request. It:

- exists only for the recovery request;
- is not committed into normal conversation history;
- does not alter conversation turn-counter semantics;
- does not become provider memory.

The fact that recovery may be supplied with failure-specific repair guidance does
not change the conversation-isolation rules above.

---

## 7. Failure Lifecycle

| Failure | Candidate discarded | History changed | Notes |
| --- | --- | --- | --- |
| `NETWORK_ERROR` | yes | no | `catch → discard` |
| `API_RESPONSE_INVALID` | yes | no | same |
| `VALIDATION` | yes | no | same |
| recovery failure | yes | no | recovery rethrown |

Invariant:

```text
failed request
→ no conversation commit
```

---

## 8. Timeout Lifecycle

```text
timeout / signal aborted before commit
→ discard candidate
→ no commit
→ USER_CANCELLED internally if abort propagated
→ external timeout remains TRANSLATION_TIMEOUT
```

- A timed-out request with an aborted signal discards its candidate; the commit is skipped.
- If the abort surfacing was a cancellation, it is raised as `USER_CANCELLED`; the canonical external timeout stays `TRANSLATION_TIMEOUT`.
- **Late-commit guard:** after a discard or an aborted signal, `commit()` is a no-op (`settled` guard).

---

## 9. Cancellation Lifecycle

```text
USER_CANCELLED
→ discard candidate
→ no commit
```

A genuine cancellation must not be reported as a timeout or generic translation error.

---

## 10. Late Settlement

- **Late provider success** and **late provider failure** after the request is already terminal are dropped.
- **No history write after terminal timeout/cancel.**
- **No second commit/discard cycle** — once settled, `commit`/`discard` are no-ops.

---

## 11. Exactly-Once Lifecycle

```text
stage:    at most once
commit:   at most once
discard:  at most once for the terminal path
```

- Candidate is **per `_translateBatch` execution** (local state, not shared across attempts).
- `stage` guarded by `!settled && !staged`.
- `commit` guarded by `settled || !staged`.
- `discard` sets `settled`; a second `discard` is a no-op (idempotent via the `settled` flag).

Nuance: discard is effectively **idempotent** rather than strictly once, because repeated `discard` calls are no-ops once settled. Do not overstate strictly-once semantics.

---

## 12. Retry Interaction

- **Queue retry creates a fresh translation attempt** (new candidate per `_translateBatch`).
- A failed candidate from a prior attempt is **not committed** and **not reused**.
- **Recovery failure** is rethrown and may enter the outer `QueueManager` retry of the whole task.
- **Retries must not double-commit** any previous candidate (candidates are per-attempt and consumed by commit/discard).
- **Structured recovery is not queue retry.** Structured recovery is a provider-local contract-failure response path excluded from conversation history; queue retry is a separate execution retry lifecycle. They must not be conflated in conversation semantics. See [TRANSLATION_PROVIDER_LOGIC.md](../TRANSLATION_PROVIDER_LOGIC.md) for execution policy.

---

## 13. Conversation Data vs Stats

These are separate systems:

| System | What it holds | Persistence |
| --- | --- | --- |
| Conversation history | `TranslationSessionManager.session.history` (messages) | in-memory only |
| Provider physical stats | `TranslationStatsManager` (`recordRequest`/`recordError`, counters) | in-memory (no raw payload) |
| Diagnostics | structural facts | — |
| Feature history/UI history | `HistoryStorage` (`translationHistory` key, `sourceText`/`translatedText`) | persisted (`StorageCore`) |

Do not imply they are one persistence system.

---

## 14. Privacy

- Conversation history stores raw `userContent` and `assistantContent` in memory (`session.history[].content`), plus the system prompt.
- **It is not persisted to `browser.storage`** — only the in-memory `Map`, TTL 30 min, evicted by LRU.
- Durable feature history (`HistoryStorage`) persists `sourceText`/`translatedText` under `translationHistory`.

Do not state more than verified: raw request/response content is retained in the in-memory conversation session only.

---

## 15. Consumer Guarantees

Callers may assume:
- accepted, committed history corresponds only to **accepted primary translations**;
- **structured recovery does not pollute** conversation history;
- timeout/cancel **cannot create phantom history entries**.

---

## 16. Known Intentional Behavior

```text
successful structured recovery
→ returned to caller
→ not committed into conversation history
```

This is an intentional current policy, **not a bug**, and is covered by `BaseAIProvider` and `AIConversationHelper` tests.

---

## 17. Non-Goals

This document does not define:
- provider retry algorithms → [PROVIDER_CONTRACT.md](PROVIDER_CONTRACT.md).
- provider recovery execution policy (selective vs full eligibility) → [TRANSLATION_PROVIDER_LOGIC.md](../TRANSLATION_PROVIDER_LOGIC.md).
- identity/fragment rules → [TRANSLATION_IDENTITY_AND_FRAGMENT_CONTRACT.md](TRANSLATION_IDENTITY_AND_FRAGMENT_CONTRACT.md).
- feature source preservation → [FEATURE_CONTRACTS.md](FEATURE_CONTRACTS.md).
- canonical `TranslationOutcome` model → [../../adr/ADR-015-translation-outcome-semantics.md](../../adr/ADR-015-translation-outcome-semantics.md).
- overall shared pipeline and runtime flow → [../architecture/TRANSLATION_SYSTEM.md](../architecture/TRANSLATION_SYSTEM.md).

Diagram: see the AI conversation lifecycle in [../architecture/DIAGRAMS.md](../architecture/DIAGRAMS.md).

---

## 18. Test Map

| Lifecycle guarantee | Primary tests |
| --- | --- |
| Participation policy / recovery exclusion | `src/features/translation/providers/utils/AIConversationHelper.test.js` |
| Commit-once, no commit before acceptance, abort guard | `src/features/translation/providers/BaseAIProvider.test.js` |
| Contract violation → discard → one recovery | `src/features/translation/providers/BaseAIProvider.test.js`, `AIResponseParser.test.js` |
| Recovery no history pollution | `src/features/translation/providers/BaseAIProvider.test.js`, `AIConversationHelper.test.js` |
| Failure discards, no history write | `src/features/translation/providers/BaseAIProvider.test.js` |
| Timeout / abort discard + late-commit guard | `src/features/translation/providers/BaseAIProvider.test.js`, `src/features/translation/core/managers/OptimizedJsonHandler.test.js` |
| Cancellation discard, no commit | `src/features/translation/providers/BaseAIProvider.test.js` |
| Late settlement suppression | `src/features/translation/core/managers/OptimizedJsonHandler.test.js` |
| Exactly-once stage/commit/discard (`settled` guard) | `src/features/translation/providers/BaseAIProvider.test.js` |
| Physical stats (transactional separation) | `src/features/translation/core/TranslationStatsManager.test.js`, `src/features/translation/providers/utils/ProviderRequestEngine.test.js` |

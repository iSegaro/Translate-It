# ADR-017: Conversation Acceptance Lifecycle Ownership

**Status:** Accepted
**Scope:** Ownership and lifetime of semantic conversation acceptance after translation execution.

---

## Context

Translation execution currently completes in Background after provider calls, parsing, recovery, merge, and validation. `TranslationOperation` then finalizes its execution facts and diagnostics.

Select Element reconstruction continues in Content. `DomTranslatorAdapter` and `BlockGroupReconstructor` can reject or accept the final logical parent only after reconstruction. This is the first point where `FinalAcceptance` exists.

Execution completion and conversation acceptance are therefore separate lifecycle events.

---

## Problem

Keeping `TranslationOperation` alive until Content acknowledgement would make an execution aggregate own concerns outside execution:

- Content acknowledgement and failure.
- Acknowledgement timeout.
- Duplicate and late acknowledgement handling.
- Parent source-order scheduling.
- Conversation history commit and discard.
- Content reload, tab loss, and conversation-only cancellation.

These are conversation lifecycle concerns, not provider execution concerns.

---

## Decision

Translation execution and Conversation acceptance are independent lifecycles.

`TranslationOperation` owns execution. `ConversationAcceptanceCoordinator` owns semantic parent acceptance and conversation commit. The broader acceptance lifecycle is the coordinator's bounded state machine.

Execution completion does not imply conversation completion.

```text
Provider execution
→ TranslationOperation finalized
→ immutable semantic handoff
→ ConversationAcceptanceCoordinator continues
→ Content FinalAcceptance
→ ConversationTurn commit
```

Conversation acceptance may outlive `TranslationOperation`.

---

## Ownership

### TranslationOperation

Owns:

- Provider execution and execution attempts.
- Completion records.
- Diagnostics and recovery facts.
- Request-unit settlement.
- Execution cancellation and timeout.
- Execution cleanup.

Never owns:

- FinalAcceptance.
- Content acknowledgement.
- Acknowledgement timeout.
- Parent ordering.
- Conversation history commit.
- Duplicate acknowledgement handling.

### ConversationAcceptanceCoordinator

Owns:

- Immutable parent semantic records.
- FinalAcceptance acknowledgement.
- Parent ordering and idempotency.
- Conversation commit and discard.
- Acknowledgement timeout.
- Conversation lifecycle cleanup.

Never owns:

- Provider execution.
- Completion records.
- Diagnostics.
- Structured recovery policy.

History storage remains owned by `TranslationSessionManager`; acceptance lifecycle coordinates commits through canonical conversation APIs.

The concrete runtime handoff is:

```text
ConversationAcceptanceHandoff
→ ConversationAcceptanceHandle registration
→ successful result dispatch
→ coordinator activation / ACK window
→ Content FinalAcceptance
→ PARENT_ACCEPTANCE_ACK
→ sourceOrder commit via commitAcceptedParent()
```

Registration does not start the ACK timeout. Activation is idempotent. Timeout or dispatch failure disposes the handle and removes the coordinator entry; late ACKs are stale. Canonical parent identity is `blockId`/`parentId` from the immutable handoff, never a fragment, unit, or DOM node identity.

---

## Handoff

Execution produces an immutable semantic handoff consumed by the conversation lifecycle.

The handoff contains only conversation-relevant parent identity and clean source metadata. The final clean result is supplied by Content acknowledgement after feature acceptance.

The handoff excludes:

- Raw provider payloads or responses.
- Diagnostics.
- Completion records.
- Provider execution state.
- Fragment transport state.
- Recovery context.

Concrete classes, registry structure, acknowledgement message shape, timeout values, and ordering algorithms remain implementation decisions.

---

## Relationship To Other Decisions

ADR-015 defines translation outcome and semantic conversation behavior. ADR-017 defines lifecycle ownership. They are complementary.

ADR-016 defines physical provider completion semantics. A `CompletionRecord` remains independent from conversation acceptance. One completion record never implies one `ConversationTurn`.

---

## Consequences

Positive:

- Clear execution and conversation ownership.
- Independent timeout and cancellation semantics.
- Conversation failures do not redefine translation execution success.
- Feature-specific FinalAcceptance remains authoritative.
- Provider fragmentation stays invisible to history.
- Non-DOM translation modes remain isolated.
- Future non-fragmented parent alignment is easier.

Tradeoffs:

- Requires an explicit immutable handoff.
- Requires a Content acknowledgement path.
- Introduces a second bounded lifecycle and cleanup path.
- Requires idempotency and ordering rules for asynchronous acknowledgements.

---

## Rejected Alternatives

### Extend TranslationOperation Lifetime

Rejected because it mixes execution facts with Content acknowledgement, conversation ordering, history commit, and acceptance timeout. It also retains diagnostics and completion state longer than execution requires.

### Content-Owned Conversation

Rejected because Content owns reconstruction and DOM application, while Background owns conversation policy and `TranslationSessionManager` owns committed history. Moving history writes to Content would split policy and storage ownership.

---

## Deferred Design

This ADR intentionally does not define:

- Acknowledgement message shape.
- Registry or handle implementation.
- Timeout values.
- Ordering algorithm.
- Retry policy for conversation commit.
- Concrete lifecycle API.

Those decisions belong to the implementation design that follows this ADR.

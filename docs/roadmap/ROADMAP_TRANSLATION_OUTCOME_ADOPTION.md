# Translation Outcome Adoption (Project B)
## Architecture Report & Implementation Roadmap

---

# Status

Project A is complete.

All runtime semantic inconsistencies that could be fixed without introducing
TranslationOutcome have already been resolved:

- runtime silent-success removal
- streaming silent-success removal
- page failure semantics
- truthful diagnostics
- empty translation classification
- execution vs translation wording cleanup

Project B therefore starts from a stable runtime.

The purpose of Project B is NOT fixing bugs.

Its purpose is moving translation semantics from scattered runtime flags into a
single canonical immutable object:

TranslationOutcome.

---

# Overall Goal

Current runtime exposes semantic state through many unrelated fields:

```

success
translatedText
hasError
error
errorType
retryCount
terminal diagnostics
history decisions
partial decisions

```

Each feature interprets those independently.

Project B introduces:

```

Execution Facts
Validation Facts
│
▼
TranslationOutcomeAssembler
│
▼
TranslationOutcome
│
▼
History
Popup
Selection
PDF
Page
Subtitle
Export
Debug
Analytics

```

Consumers should eventually depend on TranslationOutcome instead of reconstructing
semantic meaning themselves.

---

# Architectural Decisions

## Decision 1

TranslationOutcome is NOT produced by:

- TranslationEngine
- ProviderCoordinator
- TranslationOperation
- UnifiedTranslationService

Those remain owners of their own responsibilities.

The owner of outcome construction is:

```

TranslationOutcomeAssembler

```

The assembler does not exist today.

It will be introduced as a new standalone module.

---

## Decision 2

UnifiedTranslationService is the caller.

It is NOT the assembler.

Service responsibility:

```

collect terminal facts
│
▼
call assembler
│
▼
deliver outcome

```

Assembler responsibility:

```

execution facts
+
validation facts
│
▼
TranslationOutcome

```

---

## Decision 3

Assembler is PURE.

It owns:

- deterministic aggregation
- immutable output

It never owns:

- parsing
- validation
- retries
- provider logic
- transport
- messaging
- storage
- UI
- logging
- settings
- tracker
- service state

---

# Assembly Boundary

Assembler must execute only after terminal state exists.

Canonical order:

```

Execution

↓

Tracker transition

↓

TerminalExecutionRouter

↓

Diagnostics finalized

↓

TranslationOutcomeAssembler

↓

Dispatcher

↓

Consumers

```

Never before tracker transition.

Never inside dispatcher.

Never inside TranslationOperation.

Never inside TranslationEngine.

---

# Slice 1

Only introduce the assembler.

Do NOT redesign runtime.

Do NOT remove success.

Do NOT migrate consumers.

Do NOT change observable behaviour.

Assembler simply produces an immutable TranslationOutcome beside the existing
legacy result.

Legacy runtime continues unchanged.

---

# Stable Input Contract

Assembler receives only immutable facts.

```

assembleTranslationOutcome({

```
status,

terminalReason,

requestedCount,

translatedCount,

cancelledCount,

retryCount
```

})

```

---

## Notes

### translatedCount

The assembler contract intentionally does NOT define where translatedCount comes
from.

It is a caller supplied fact.

Current runtime may derive it from translatedText.

Future runtime may derive it from validated units.

The contract must remain independent from today's implementation.

This prevents coupling the assembler to legacy runtime.

---

### retryCount

retryCount is optional.

Default:

```

0

```

Retry metadata belongs to execution.

It must never determine translation quality.

---

# Output Contract

Assembler returns only TranslationOutcome.

Slice 1 uses:

```

execution

translationResult

diagnosticSummary

```

Everything else remains deferred.

---

# Deferred Fields

The following runtime facts do NOT exist today.

Assembler must simply use defaults.

Do NOT invent runtime.

Deferred:

- providerFailoverUsed
- completionReason
- attempts
- cancelledUnitIds
- validation units
- parser repair summary
- validation failure summary

These belong to future runtime adoption.

---

# Assembler Invariants

TranslationOutcomeAssembler must always satisfy:

- pure function
- deterministic
- total function
- immutable output
- never mutates inputs
- identical input -> identical output
- no side effects
- no logging
- no storage
- no messaging
- no retries
- no parsing
- no validation
- no runtime allocation
- no Date.now()
- no Math.random()

Assembler aggregates facts.

It never creates facts.

---

# Consumer Adoption Strategy

Consumers will migrate incrementally.

Never perform a big-bang migration.

Recommended order:

```

1.

History

↓

2.

Popup / Sidepanel

↓

3.

Dictionary

↓

4.

Text Fields

↓

5.

Selection

↓

6.

Whole Page

↓

7.

Subtitle

↓

8.

PDF

↓

9.

Legacy cleanup

```

Each step must preserve backward compatibility.

Legacy fields remain available until every consumer migrates.

---

# History Is First Consumer

History is intentionally the first adopter because:

- smallest surface
- no streaming
- no messaging changes
- storage serialization only
- user-visible
- export automatically benefits
- truthful execution status
- truthful quality

History validates the architecture without disturbing runtime.

---

# Legacy Removal Rule

The following fields are NOT removed during Slice 1:

```

success

translatedText

hasError

error

errorType

```

TranslationOutcome is additive.

Only after every consumer migrates may legacy fields be removed.

---

# Success Criteria

Slice 1 is complete when:

- TranslationOutcomeAssembler exists.
- It is pure.
- It is fully unit tested.
- UnifiedTranslationService calls it.
- TranslationOutcome is attached beside the legacy result.
- Existing runtime behaviour is identical.
- No consumer has migrated yet.
- All tests remain green.

At that point Project B has a stable semantic runtime without changing observable behaviour.

Consumer migration begins only after Slice 1 is complete.

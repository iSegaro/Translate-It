# ADR-016: Provider Completion Contract

**Status:** Accepted

**Scope:** Provider response handling, completion metadata normalization, recovery decision inputs, telemetry inputs, and provider adaptation across Gemini, OpenAI-compatible providers, OpenRouter, WebAI, BrowserAI, and future providers.

---

## Context

The translation pipeline is provider-neutral in its execution and validation layers, but it currently has no standardized contract for provider completion metadata. Provider-specific values leak out of their originating adapters and into provider implementations and temporary diagnostic hooks.

Observed provider-specific metadata today:

- **Gemini:** `finishReason`, `usageMetadata`, `modelVersion`, `responseId`.
- **OpenAI-compatible:** `finish_reason`, `usage`, `model`.
- **Claude:** `stop_reason`, `usage`.

Future providers will expose different schemas for the same underlying facts. The pipeline has no single normalization point, so each consumer that needs completion facts either duplicates normalization or depends on raw provider shapes. This produces provider-specific logic, temporary hooks, duplicated normalization, weak recovery decisions, and fragile telemetry.

A concrete consequence: `finishReason = MAX_TOKENS` and an invalid JSON payload are different events. Today recovery observes mostly parser failure, so the two events are conflated even though their architectural meaning is distinct.

The recent recovery-hardening work established parser/validator separation, provider-local recovery, fragment aggregation, and pre-stream validation. That work deliberately keeps `BaseAIProvider` free of V3 semantic interpretation. Completion metadata is the remaining unnormalized surface: it still reaches downstream layers in raw, provider-specific form.

---

## Problem

Completion metadata is not currently a first-class pipeline artifact. The consequences of its absence:

| Concern | Current behavior |
|---|---|
| Provider independence | Downstream layers can depend on provider-specific field names. |
| Single normalization | Normalization is repeated where metadata happens to be needed. |
| Recovery decisions | Recovery reacts primarily to parser failure; termination state is not an explicit input. |
| Telemetry | Telemetry must consume raw responses or accept provider-specific shapes. |
| Extensibility | New metadata categories (cost, latency, citations) would require pipeline changes. |

The pipeline requires a contract that guarantees each provider response is normalized exactly once before entering the translation pipeline, into one internal form that all downstream layers can consume.

---

## Decision

Adopt a **Provider Completion Contract**: a standardized internal representation of what a provider returned, how the response ended, who produced it, and at what cost.

```text
HTTP Transport
→ Provider Adapter
→ Completion Normalization (exactly once)
→ Normalized Provider Completion
→ Parser / Validator
→ Recovery Decision
→ Streaming
→ Telemetry
```

Normalization happens at the provider-adapter boundary and only there. Everything downstream consumes the normalized contract. The translation pipeline MUST never depend on raw provider response schemas.

**Each provider response MUST be normalized exactly once before entering the translation pipeline.** A retry or additional provider call produces a distinct provider response and is normalized independently. Transport or streaming chunks that belong to the same provider response do not constitute separate completion responses unless the provider contract explicitly defines them as such.

The completion contract is a companion to the outcome semantics defined in [ADR-015](./ADR-015-translation-outcome-semantics.md): ADR-015 governs what the translation operation decided; this ADR governs how the provider response is reduced into a single consumable fact set before those decisions are made.

---

## Architectural Principles

- **Single normalization point.** Each provider response MUST be normalized exactly once before entering the translation pipeline, at the provider-adapter boundary. No layer may re-derive completion facts from raw response data.
- **Provider independence.** The pipeline MUST NOT depend on provider-specific strings, field names, or termination values outside provider adapters.
- **Separation of responsibilities.** Transport returns raw protocol results; the adapter owns provider protocol; completion normalization owns reduction; the parser, validator, recovery, streaming, and telemetry each own exactly one downstream concern.
- **Normalized metadata only downstream.** Consumers receive completion facts as normalized concepts. If a fact is absent, the contract exposes its absence rather than a provider placeholder.
- **No provider-specific strings beyond adapters.** Provider termination codes, model identifiers in provider syntax, and usage key names never escape the adapter.

---

## Pipeline Ownership

| Layer | Owns | Must Never Own |
|---|---|---|
| HTTP Transport | Protocol, status, response bytes, abort signal | Provider semantics, completion reduction, translation text |
| Provider Adapter | Provider protocol, request construction, response-envelope decoding | Retry or failover policy, recovery policy, source substitution |
| Completion Normalization | Reduction of each provider response into the contract, exactly once per response | Parsing, validation, recovery, telemetry |
| Parser (`AIResponseParser`) | Syntax decoding, parser repair, response/request mapping | Completion normalization, semantic validity, recovery policy |
| Validator (`TranslationContractValidator`) | Semantic provider-contract validity, V3 marker ownership | Completion normalization, recovery, provider execution |
| Recovery (`BaseAIProvider`) | Recovery policy decisions over normalized completion + parser facts + validator facts | Raw provider schema interpretation, V3 semantics, queue retry |
| Streaming | Pre-stream enforcement of validated results | Completion normalization, recovery policy |
| Telemetry | Aggregation and reporting of normalized completion facts | Raw response parsing, provider schema knowledge |

Completion normalization MUST NOT be added to the parser, the validator, or recovery. Each of those layers consumes the contract; none owns its production.

---

## Provider Completion Contract

The contract is a normalized fact set grouped into categories. Field names are intentionally not prescribed here; the categories and their meanings are the contract. Every fact is OPTIONAL in the sense that a provider may not supply it, and the contract MUST represent absence as absence, never as a fabricated value.

The categories below describe architectural responsibilities, not a runtime object, a serialized schema, or a concrete data model. Implementation is intentionally unspecified: how completion facts are represented, transported, or stored is a later decision. This ADR defines architectural concepts only.

### Translated Content

The translated payload that proceeds to the parser. This is the only category whose content is interpreted downstream.

### Completion Metadata

A single normalized record describing how the provider call terminated, independent of the content it returned. This record is the primary subject of this ADR.

### Provider Identity

Which provider produced the response. Normalized to the pipeline's provider identifier, not to an adapter-internal name.

### Model Identity

The model that produced the response, normalized to a single pipeline-wide model identifier. A provider MAY report several model-related values; the adapter MUST reduce them to one canonical identifier.

### Termination Information

How the generation ended, expressed in pipeline-normalized termination semantics rather than provider codes. See [Termination Normalization](#termination-normalization).

### Usage Information

Tokens consumed, and any provider-supplied cost information, reduced to a single normalized shape. Providers that do not report usage MUST produce no usage facts rather than placeholders.

### Response Identity

Any identifier the provider assigns to the response. This remains distinct from logical IDs, positional wire IDs, and V3 member IDs, consistent with the identity namespaces defined in [ADR-015](./ADR-015-translation-outcome-semantics.md).

---

## Termination Normalization

Provider termination values are implementation details and MUST NOT escape the adapter.

Examples:

- Gemini `MAX_TOKENS`
- OpenAI `length`
- Claude `max_tokens`

are all expressions of one internal concept: the provider stopped because the output limit was reached. The contract SHOULD normalize such values into a single semantic, for example **`TRUNCATED`**.

The contract SHOULD define a small set of normalized termination semantics, including at minimum:

- a normal terminal completion of the generation;
- a generation stopped by an output limit;
- a generation stopped because of provider safety or policy constraints;
- a generation that ended with an error or without a usable result.

The exact set is an implementation decision; the architectural requirement is that downstream layers observe normalized semantics, never provider strings. A provider termination value that has no matching normalized semantic is represented as a distinct unknown semantic — never as a provider string and never as a successful normal completion.

Recovery MUST treat output-limit termination as fundamentally different from a syntactically valid but contract-invalid response, because the two imply different corrective actions. The pipeline must preserve that distinction from the adapter through recovery.

---

## Recovery Decision Model

Recovery decisions MUST be made from the combination of:

- completion metadata,
- parser result,
- validator result.

No single input is sufficient. In particular, recovery MUST NOT rely on parser failure alone.

Conceptually, the three inputs describe different things:

- **Completion metadata** says how the generation ended, independently of what it produced.
- **Parser result** says whether the payload could be decoded and mapped.
- **Validator result** says whether the mapped payload satisfies the requested response contract.

A decision to recover, and which recovery path to take, is a function of all three. For example, a truncated generation that happens to yield contract-valid content is not the same event as a truncated generation that yields invalid content, and neither is the same as a complete generation that violates the contract.

Recovery policy remains provider-local and provider-owned, per the recovery ownership established in ADR-015. This ADR changes the inputs available to that policy, not its location.

---

## Telemetry

Telemetry MUST consume only normalized completion facts. Telemetry MUST NOT parse raw provider responses and MUST NOT know provider-specific field names.

The completion contract is the telemetry boundary: everything telemetry may learn about a provider call is expressed through it. This keeps telemetry provider-independent and makes exported telemetry comparable across providers.

---

## Extensibility

The contract SHOULD support future metadata categories without changing the translation pipeline. Candidate categories include:

- cost,
- cached response indicators,
- latency,
- reasoning content,
- citations,
- tool calls.

A new category is added to the contract at the normalization boundary. Downstream layers that do not consume the category are unaffected, and consumers opt in by reading the normalized category. No new provider-specific code is required in the parser, validator, recovery, streaming, or telemetry layers to add a category.

The invariant is structural: providers and their schemas may change or multiply, while the contract surface grows only by explicit category addition at the single normalization point.

---

## Invariants

- The pipeline MUST NOT depend on raw provider response schemas.
- Each provider response MUST be normalized exactly once, before entering the translation pipeline, at the provider-adapter boundary.
- No layer other than the provider adapter produces or consumes provider-specific completion strings.
- Provider termination codes MUST NOT escape the adapter.
- Output-limit termination and contract-invalid content are distinct events and MUST remain distinct through recovery.
- Recovery MUST be decided from completion metadata, parser result, and validator result together.
- Recovery decisions MUST be reproducible from normalized completion metadata, parser output, and validator output without requiring access to the original provider response.
- Completion normalization MUST NOT be performed by the parser, validator, or recovery.
- Telemetry MUST consume only normalized completion facts.
- Absent facts are represented as absent, never fabricated.
- Normalized model identity is a single canonical identifier per response.
- Response identity remains distinct from logical, positional-wire, and V3 member identity.
- New metadata categories are introduced at the normalization boundary without pipeline change.
- Completion normalization MUST NOT alter recovery ownership or queue-retry semantics.

---

## Non-Goals

This ADR does NOT:

- redesign the parser or its repair behavior;
- redesign the validator or its validity rules;
- redesign recovery policy or its ownership;
- redesign provider APIs or their transport behavior;
- mandate an implementation order or a field-level schema;
- mandate how completion normalization is implemented in any adapter;
- change stats, retry, failover, or conversation semantics;
- define the exact set of normalized termination semantics (only the requirement that they exist and are distinct);
- apply the contract to non-provider sources of metadata.

Provider adapters remain the single place where provider-specific knowledge lives; this ADR only guarantees that knowledge terminates there.

---

## Alternatives Considered

| Alternative | Rejected Because |
|---|---|
| Normalize completion facts in the parser | Merges decoding with provider reduction; parser gains provider-specific knowledge and loses neutrality. |
| Normalize in recovery | Recovery would depend on raw schemas to make its primary decision; recovery ownership would be entangled with transport. |
| Normalize in telemetry | Telemetry would need provider-specific parsing; telemetry would no longer be provider-independent. |
| Extend the validator to own completion | Validation is a semantic contract concern; completion is a transport/production concern. |
| No contract; document conventions | Duplicated normalization and provider-specific logic would persist with no enforceable boundary. |
| Adapter passes raw response alongside normalized facts | Reintroduces raw schemas to downstream layers and defeats the single-source guarantee. |

---

## Consequences

### Positive

- Provider independence becomes enforceable rather than conventional.
- Normalization is written once per adapter instead of repeated per consumer.
- Recovery can distinguish termination causes from content invalidity.
- Telemetry becomes provider-independent and comparable across providers.
- New providers and new metadata categories do not ripple through the pipeline.
- Temporary diagnostic hooks that consume raw provider facts have a permanent home.

### Negative

- Each existing provider adapter requires completion normalization.
- Raw-response consumers must migrate to the contract, a compatibility-affecting change.
- The contract adds a boundary that must not be bypassed; drift requires review.

### Trade-offs

- A canonical normalized model identifier loses provider-native distinctions (for example, full model version strings) unless the adapter explicitly preserves them as additional normalized facts.
- Normalizing termination semantics to a small set discards provider-specific nuance by design; the set must be extended consciously when a new provider semantics appears.
- Absence-preserving facts are more honest but place a burden on consumers to handle absent categories.

---

## Adoption

The contract is the long-term architectural boundary. Adoption MAY be incremental, and individual providers MAY migrate independently without waiting for others. The architectural boundary MUST remain preserved regardless of adoption order or timing: no downstream layer may depend on raw provider response schemas, and each provider response MUST be normalized exactly once before entering the translation pipeline.

This ADR describes the decision, not an execution plan. It does not mandate phases, sequencing, or schedules.

---

## Risks

- Downstream layers may continue depending on raw provider fields during migration, creating a period of parallel representations.
- Normalized termination semantics must be extended whenever a provider introduces a genuinely new termination condition; an unclassified value must surface as unknown rather than silently normal.
- Model-identity canonicalization may lose provider-native detail that a future consumer needs; such detail is reintroduced only as an explicit additional normalized fact.

---

## Future Work

- Define the completion contract's exact normalized shape and the initial normalized termination set as a separate contract document once implementation begins.
- Adopt completion metadata as a recovery-decision input per the recovery decision model.
- Add future metadata categories (cost, cached, latency, reasoning, citations, tool calls) at the normalization boundary without pipeline change.

For outcome semantics, identity namespaces, and recovery ownership, see [ADR-015](./ADR-015-translation-outcome-semantics.md). For provider result/error/retry/health contracts and the provider execution policy, see [PROVIDER_CONTRACT.md](../technical/contracts/PROVIDER_CONTRACT.md) and [TRANSLATION_PROVIDER_LOGIC.md](../technical/TRANSLATION_PROVIDER_LOGIC.md).

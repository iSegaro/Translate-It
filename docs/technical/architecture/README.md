# architecture/ — Runtime Architecture

Purpose: **system-level runtime architecture and routing.**

## What belongs here

- Whole-runtime system architecture documents.
- Translation/routing orchestration and runtime boundaries.

## In this folder

- [TRANSLATION_SYSTEM.md](TRANSLATION_SYSTEM.md) — Translation Service: coordination, request tracking, result routing, runtime ownership and delivery.
- [DIAGRAMS.md](DIAGRAMS.md) — Mermaid architecture diagrams of the current translation runtime.

## What does not belong here

- Behavioral invariants and per-request contracts → `contracts/`.
- Provider implementation → `providers/`.
- Shared subsystem internals → `infrastructure/`.

## See also

- [../contracts/TRANSLATION_IDENTITY_AND_FRAGMENT_CONTRACT.md](../contracts/TRANSLATION_IDENTITY_AND_FRAGMENT_CONTRACT.md) — identity and fragment contract.
- [../providers/PROVIDERS.md](../providers/PROVIDERS.md) — provider implementation guide.

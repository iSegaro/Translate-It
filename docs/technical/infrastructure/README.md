# infrastructure/ — Shared Subsystems

Purpose: **shared runtime subsystems such as stats, queues, lifecycle, messaging.**

## What belongs here

- Internal subsystem documentation: statistics, queues, lifecycle, messaging, storage, and other shared runtime infrastructure.

## In this folder

- [STATS_MANAGER.md](STATS_MANAGER.md) — system for tracking usage statistics and analytics.

## What does not belong here

- Whole-runtime architecture → `architecture/`.
- Behavioral contracts → `contracts/`.
- Provider implementation → `providers/`.

## See also

- [../contracts/TRANSLATION_IDENTITY_AND_FRAGMENT_CONTRACT.md](../contracts/TRANSLATION_IDENTITY_AND_FRAGMENT_CONTRACT.md) — behavioral contracts.
- [../providers/PROVIDERS.md](../providers/PROVIDERS.md) — provider implementation.

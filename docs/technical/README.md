# Technical Documentation Index

General technical documentation for the extension. Documents are grouped by stable folder classification.

## Folders

- [**architecture/**](architecture/README.md) — system-level runtime architecture and routing.
- [**contracts/**](contracts/README.md) — behavioral invariants and runtime contracts.
- [**providers/**](providers/README.md) — provider implementation and integration guides.
- [**infrastructure/**](infrastructure/README.md) — shared runtime subsystems (stats, queues, lifecycle, messaging).

## In this folder

Flattened technical guides that cover standalone features and general engineering topics.

- [ARCHITECTURE.md](ARCHITECTURE.md) — complete system overview and integration guide.
- [MessagingSystem.md](MessagingSystem.md) — race-condition-free communication.
- [VITE_BUILD_SYSTEM.md](VITE_BUILD_SYSTEM.md) — modular bundling and manual chunking.
- [CSS_ARCHITECTURE.md](CSS_ARCHITECTURE.md), [CSS_VARIABLES_GUIDE.md](CSS_VARIABLES_GUIDE.md), [ICON_SYSTEM.md](ICON_SYSTEM.md) — styling and icon standards.
- Feature guides: [MOBILE_SUPPORT.md](MOBILE_SUPPORT.md), [DESKTOP_FAB_SYSTEM.md](DESKTOP_FAB_SYSTEM.md), [TTS_SYSTEM.md](TTS_SYSTEM.md), [MOUSE_HOVER_SYSTEM.md](MOUSE_HOVER_SYSTEM.md), [SUBTITLE_TRANSLATION_SYSTEM.md](SUBTITLE_TRANSLATION_SYSTEM.md), and others.

## Does not belong here

- Architecture of the translation runtime → move to `architecture/`.
- Behavioral invariants and contracts → move to `contracts/`.
- Provider-specific implementation → move to `providers/`.
- Shared subsystem internals → move to `infrastructure/`.

## See also

- [pdf-translator/](./pdf-translator/README.md) — PDF viewer internals.
- `docs/adr/` — architectural decision records.

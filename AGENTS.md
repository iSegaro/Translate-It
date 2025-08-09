# Repository Guidelines

## Project Structure & Module Organization
- Browser extension (MV3) with Vue. Key folders in `src/`: `core/` (SimpleMessageHandler, TranslationHandler), `messaging/` (MessagingCore + specialized messengers), `providers/` (factory/registry + implementations), `storage/` (StorageCore + composables), `background/`, `content-scripts/`, `components/`, `views/`, `managers/`, `utils/`, `store/`.
- Tests: unit tests colocated under `src/**/__tests__/*.test.js`; end‑to‑end tests in `tests/e2e/*.spec.js`.
- Config: Vite and test configs in `config/`; outputs in `dist/<browser>/Translate-It-v<version>/`.

## Build, Test, and Development Commands
- Install/setup: `pnpm install` then `pnpm run setup`
- Dev builds: `pnpm run dev:chrome` / `dev:firefox` (load `dist/<browser>/Translate-It-v<version>/` as an unpacked extension)
- Dev servers/logs: `pnpm run serve:chrome` (port 3000) / `serve:firefox` (port 3001); watch: `watch:<browser>`
- Build/validate: `pnpm run build`, `validate`, `validate:chrome`, `validate:firefox`
- Tests: `test:vue`, `test:vue:run`, `test:vue:coverage`, E2E `test:e2e` (UI: `test:e2e:ui`)
- Lint/format: `pnpm run lint`, `pnpm run format`; preflight: `pnpm run pre-submit`

## Coding Style & Naming Conventions
- ESLint flat config (`eslint.config.js`) + Prettier. 2‑space indent. Vue SFCs for UI; components PascalCase; composables `useXyz.js`.
- Security linting via `eslint-plugin-no-unsanitized`. Prefer `webextension-polyfill`/unified Browser wrapper—avoid direct `chrome.*`.
- Path aliases: `@`, `@components`, `@views`, `@composables`, `@utils`, `@providers`, `@messaging`.

## Testing Guidelines
- Vitest + Vue Test Utils (`jsdom`). Coverage thresholds: 80% branches/functions/lines/statements (see `config/test/vitest.config.js`).
- Unit tests in `src/<area>/**/__tests__/*.test.js`; E2E in `tests/e2e/*.spec.js` with Playwright (`config/test/playwright.config.js`).
- Examples: run headless `pnpm run test:vue:run`; open UI `pnpm run test:vue:ui`.

## Commit & Pull Request Guidelines
- Commits: imperative, scoped; Conventional types encouraged (`feat:`, `fix:`, etc.). Reference issues (`#123`).
- PRs: describe changes, include screenshots for UI, test plan, and linked issues. Must pass `pnpm run pre-submit`.

## Security & Configuration Tips
- Sanitize untrusted HTML (e.g., `DOMPurify`). Use StorageCore for persistence; never store raw secrets.
- Keep `_locales/` in sync with UI text. Respect feature detection for browser‑specific APIs (TTS, capture, side panel).

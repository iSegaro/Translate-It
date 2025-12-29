# Change: Refactor Select Element Direction Handling

## Why
The Select Element feature has over-engineered RTL/LTR text direction handling causing incorrect display of RTL content containing English words or numbers. The current implementation uses complex word-ratio calculations that determine text direction based on content analysis rather than the target language, leading to RTL translations incorrectly displaying as LTR.

## What Changes
- Simplify textDirection.js from 477 lines to ~30 lines of logic
- Remove complex mixed content processing (wrapping English words in spans)
- Use target language as primary determinant for text direction
- Remove redundant RTL detection functions from TranslationUIManager
- Simplify CSS classes for bidirectional text support
- **BREAKING**: Remove `.ltr-term` and `.aiwc-mixed-text` CSS classes and related processing

## Impact
- Affected specs: element-selection
- Affected code:
  - src/features/element-selection/utils/textDirection.js
  - src/features/element-selection/managers/services/TranslationUIManager.js
  - src/assets/styles/content-main-dom.css
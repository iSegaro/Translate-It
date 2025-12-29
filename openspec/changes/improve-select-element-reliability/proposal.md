# Change: Improve Select Element Reliability

## Why
The Select Element feature has critical reliability issues that directly impact user experience:

1. **RTL/LTR Direction Problems**: Technical terms like "API" and "Z.ai" display incorrectly in RTL contexts, making translations unreadable for users translating to RTL languages

2. **Over-Engineered Direction Handling**: The current `textDirection.js` implementation has 477 lines of complex logic with flawed threshold-based detection that causes more problems than it solves

3. **Unreliable Segment Mapping**: No reliable way to map translations back to original text positions, causing incorrect text placement and content loss

4. **Provider Limitations**: Traditional providers (Google, Bing) don't support JSON responses natively, limiting our ability to implement advanced features

These issues degrade the quality of translations and create inconsistent behavior across different content types and languages, with the RTL direction problem being particularly severe for users translating to Arabic, Persian, Hebrew, and other RTL languages.

## What Changes
This change combines two critical improvements into one cohesive implementation:

### 1. Simplify RTL/LTR Direction Handling
- Reduce `textDirection.js` from 477 lines to ~30 lines of focused logic
- Use target language as primary determinant for text direction instead of flawed content analysis
- Remove complex mixed content processing that wraps English terms in spans
- Fix RTL detection thresholds (increase from 0.1 to 0.4-0.5 for proper detection)
- Remove redundant RTL detection functions from TranslationUIManager

### 2. Implement Segment ID-Based Translation System
- Assign unique IDs to each extracted text segment during text extraction
- Maintain mapping between IDs and original DOM elements for reliable translation application
- Add hybrid JSON support that works across all provider types (AI and traditional)
- Enable graceful fallback to array format for providers that don't support JSON
- Improve translation reassembly reliability with ID-based matching

### 3. Clean Up Redundant Code
- Remove unused CSS classes (`.ltr-term`, `.aiwc-mixed-text`)
- Eliminate mixed content processing functions
- Simplify CSS classes for bidirectional text support
- Consolidate direction handling logic into a single, focused module

## Impact
- **Affected specs**: element-selection
- **Affected code**:
  - `src/features/element-selection/utils/textDirection.js` - Major simplification
  - `src/features/element-selection/utils/textExtraction.js` - Add segment ID assignment
  - `src/features/element-selection/utils/textProcessing.js` - Update for segment ID support
  - `src/features/element-selection/managers/services/TranslationUIManager.js` - Remove redundant RTL logic
  - `src/features/element-selection/utils/domManipulation.js` - Update for segment ID application
  - `src/assets/styles/content-main-dom.css` - Remove unused CSS classes

## Benefits
- **Fixes Critical RTL Issues**: Technical terms will display correctly in RTL contexts
- **Improves Reliability**: Segment IDs provide reliable mapping between translations and original content
- **Reduces Complexity**: 447 lines less code in direction handling, making the system more maintainable
- **Works with All Providers**: Hybrid approach maintains compatibility with both AI and traditional providers
- **Better User Experience**: Consistent, predictable behavior across all languages and content types
- **Performance**: Simplified logic reduces CPU overhead for direction detection
- **Maintainability**: Clear separation of concerns and reduced complexity
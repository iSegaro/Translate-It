## 1. Create Simplified Direction Utility
- [ ] 1.1 Backup current textDirection.js
- [ ] 1.2 Replace textDirection.js with simplified implementation (30 lines)
- [ ] 1.3 Remove all RTL detection patterns except single comprehensive one
- [ ] 1.4 Remove word-ratio calculation and threshold logic
- [ ] 1.5 Export only essential functions: getTextDirection, isRTLLanguage

## 2. Refactor TranslationUIManager
- [ ] 2.1 Remove processMixedContentForDisplay function
- [ ] 2.2 Remove isTextRTL function
- [ ] 2.3 Remove processRTLTextWithLTERMS function
- [ ] 2.4 Remove isRTLLanguage function
- [ ] 2.5 Update correctTextDirection to use simplified utility
- [ ] 2.6 Remove HTML span wrapping for LTR terms

## 3. Simplify CSS Classes
- [ ] 3.1 Remove .ltr-term class and related styles
- [ ] 3.2 Remove .aiwc-mixed-text class and related styles
- [ ] 3.3 Update .aiwc-rtl-text and .aiwc-ltr-text to use CSS logical properties
- [ ] 3.4 Test CSS behavior with mixed content scenarios

## 4. Update Integration Points
- [ ] 4.1 Search for all imports of removed functions
- [ ] 4.2 Update StreamingTranslationEngine if needed
- [ ] 4.3 Update TranslationOrchestrator if needed
- [ ] 4.4 Verify all callers use new simplified API

## 5. Testing and Validation
- [ ] 5.1 Test RTL translation with English words
- [ ] 5.2 Test RTL translation with numbers
- [ ] 5.3 Test streaming translation with mixed content
- [ ] 5.4 Verify no breaking changes to existing functionality
- [ ] 5.5 Run eslint and build to ensure no errors
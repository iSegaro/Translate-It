# Change: Add Multiple API Keys Support with Automatic Failover

## Why
Currently, each translation provider only supports a single API key. When an API key reaches its rate limit, quota, or becomes invalid, translation requests fail immediately. Users need to manually update their API key to continue using the service. This creates a poor user experience, especially for power users who have multiple API keys they want to use in rotation for better reliability and quota management.

## What Changes
- **UI Changes**: Replace single-line API key input fields with multiline textarea components for all API key providers (OpenAI, Gemini, DeepSeek, OpenRouter, DeepL, Custom)
- **Test Keys Button**: Add a "Test Keys" button next to each API key textarea to validate all keys and reorder them (working keys first, invalid keys last)
- **Storage Changes**: Store API keys as newline-separated strings, parsed into arrays for programmatic use
- **Provider Logic Changes**: Implement automatic failover to next API key when API key errors occur (API_KEY_INVALID, INSUFFICIENT_BALANCE, QUOTA_EXCEEDED, RATE_LIMIT_REACHED)
- **Key Reordering**: On successful translation, move the used API key to the top of the list (prioritize working keys)
- **Backward Compatibility**: Support both single string and multi-key formats; automatically migrate existing single keys

## Impact
- **Affected specs**: `translation-providers`
- **Affected code**:
  - `src/shared/config/config.js` - API key storage and getters
  - `src/components/feature/api-settings/*.vue` - API key input components (6 files)
  - `src/features/translation/providers/BaseProvider.js` - Error handling and retry logic
  - `src/features/translation/providers/BaseAIProvider.js` - AI provider key management
  - All individual provider files (OpenAI.js, GoogleGemini.js, DeepSeek.js, OpenRouter.js, DeepLTranslate.js, CustomProvider.js)

## Migration Considerations
- Existing single API keys will automatically be converted to the new format
- Users with multiple keys can enter them, one per line
- The first key in the list is always tried first
- Successfully used keys are promoted to the top of the list automatically

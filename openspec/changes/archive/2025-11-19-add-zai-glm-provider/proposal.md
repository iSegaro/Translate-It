# Change: Add Z.AI GLM Model Support

## Why
Add support for Z.AI GLM models (ChatGLM3-6B and ChatGLM4) to expand translation capabilities and provide users with additional AI-powered translation options using OpenAI-compatible API format.

## What Changes
- Add new ZAI GLM provider implementation extending BaseAIProvider
- Register ZAI provider in the provider registry
- Add configuration settings for ZAI API key, URL, and model selection
- Implement rate limiting and error handling specific to ZAI API
- Add ZAI model options to the UI provider selection

## Impact
- Affected specs: `translation-providers` (new capability)
- Affected code:
  - `src/features/translation/providers/ZAIGLM.js` (new)
  - `src/features/translation/providers/register-providers.js` (modified)
  - `src/shared/config/config.js` (modified)
  - `src/features/translation/core/ProviderConfigurations.js` (modified)
# Implementation Tasks

## 1. Storage Layer Changes
- [x] 1.1 Create `src/features/translation/providers/ApiKeyManager.js` module
  - [x] Implement `getKeys(providerSettingKey)` to parse newline-separated keys into array
  - [x] Implement `getPrimaryKey(providerSettingKey)` to return first key
  - [x] Implement `promoteKey(providerSettingKey, key)` to move key to front and save
  - [x] Implement `shouldFailover(error)` to check if error is key-related
  - [x] Implement `testAndReorderKeys(providerSettingKey, providerName)` to validate all keys and reorder them
  - [x] Implement `testKeysDirect(keysString, providerName)` for testing without storage I/O
  - [x] Implement `stringifyKeys(keys)` to convert array to newline-separated string
  - [x] Implement `getProviderName(providerCode)` and `getSettingsKey(providerCode)` helper methods
  - [x] Add unit tests for key parsing, promotion, and testing logic

- [x] 1.2 Update `src/shared/config/config.js`
  - [x] Add multi-key getter functions: `getOpenAIApiKeysAsync()`, `getGeminiApiKeysAsync()`, `getDeepSeekApiKeysAsync()`, `getOpenRouterApiKeysAsync()`, `getDeeplApiKeysAsync()`, `getCustomApiKeysAsync()`
  - [x] Modify existing single-key getters to call `ApiKeyManager.getPrimaryKey()` for backward compatibility
  - [x] Add auto-migration logic: detect single keys and treat as single-item arrays

## 2. Provider Logic Changes
- [x] 2.1 Modify `src/features/translation/providers/BaseProvider.js`
  - [x] Add `_executeApiCallWithFailover()` method with retry loop
  - [x] Integrate `ApiKeyManager` for key management
  - [x] On API-key-related error, get next key and retry (max 3 attempts)
  - [x] On success, call `ApiKeyManager.promoteKey()` to move successful key to front
  - [x] Ensure error types and propagation remain unchanged for callers

- [x] 2.2 Update individual AI provider files to use multi-key getters
  - [x] Update `src/features/translation/providers/OpenAI.js` to use `getOpenAIApiKeysAsync()`
  - [x] Update `src/features/translation/providers/GoogleGemini.js` to use `getGeminiApiKeysAsync()`
  - [x] Update `src/features/translation/providers/DeepSeek.js` to use `getDeepSeekApiKeysAsync()`
  - [x] Update `src/features/translation/providers/OpenRouter.js` to use `getOpenRouterApiKeysAsync()`
  - [x] Update `src/features/translation/providers/DeepLTranslate.js` to use `getDeeplApiKeysAsync()`
  - [x] Update `src/features/translation/providers/CustomProvider.js` to use `getCustomApiKeysAsync()`

## 3. UI Component Changes
- [x] 3.1 Update API settings components (6 files)
  - [x] Update `src/components/feature/api-settings/GeminiApiSettings.vue`
  - [x] Update `src/components/feature/api-settings/OpenAIApiSettings.vue`
  - [x] Update `src/components/feature/api-settings/DeepseekApiSettings.vue`
  - [x] Update `src/components/feature/api-settings/OpenRouterApiSettings.vue`
  - [x] Update `src/components/feature/api-settings/DeepLApiSettings.vue`
  - [x] Update `src/components/feature/api-settings/CustomApiSettings.vue`
  - For each component:
    - [x] Replace `<BaseInput type="password">` with `<BaseTextarea>`
    - [x] Update placeholder text: "Enter your API keys (one per line)"
    - [x] Maintain password masking visual style
    - [x] Update label text if needed
    - [x] Add "Test Keys" button next to textarea
    - [x] Implement test handler that calls `ApiKeyManager.testAndReorderKeys()`
    - [x] Add loading state and result feedback (success/error messages)

- [x] 3.2 Create or update `BaseTextarea.vue` component if needed
  - [x] Ensure password masking style compatibility
  - [x] Add proper styling for multiline input

## 4. Testing & Validation
- [x] 4.1 Manual testing scenarios
  - [x] Test backward compatibility: load existing single-key settings
  - [x] Test multiple keys input: enter 3 keys, verify all are saved
  - [x] Test failover: invalidate first key, verify second key is used
  - [x] Test key promotion: use second key successfully, verify it moves to top
  - [x] Test error types: verify only key-related errors trigger failover
  - [x] Test all providers: OpenAI, Gemini, DeepSeek, OpenRouter, DeepL, Custom
  - [x] Test "Test Keys" button: validate all keys and verify reordering
  - [x] Test "Test Keys" with all invalid keys: verify error message
  - [x] Test "Test Keys" loading state: verify button disabled during test

- [x] 4.2 Edge cases
  - [x] Test empty lines between keys (should be ignored)
  - [x] Test whitespace trimming around keys
  - [x] Test concurrent requests with different keys
  - [x] Test all keys exhausted scenario
  - [x] Test single provider with single key (existing behavior)
  - [x] Test "Test Keys" with no keys entered (button should be disabled)

## 5. Documentation
- [x] 5.1 Update user-facing documentation
  - [x] Add help text in UI explaining multi-key feature
  - [x] Update README or documentation about API key configuration

- [x] 5.2 Update developer documentation
  - [x] Document `ApiKeyManager` API and usage in PROVIDERS.md
  - [x] Update PROVIDERS.md with all ApiKeyManager methods and constants
  - [x] Add API Methods section with complete method documentation
  - [x] Add Constants section with PROVIDER_SETTINGS_KEYS and PROVIDER_NAMES
  - [x] Update Testing API Keys section with testKeysDirect() method
  - [x] Update Supported Providers table with correct setting keys
  - [x] Update ARCHITECTURE.md if needed

## Context

The Multiple API Keys feature requires changes across three architectural layers:

1. **Storage Layer**: How API keys are stored and retrieved
2. **UI Layer**: How users input and manage multiple API keys
3. **Provider Layer**: How providers select and use API keys with failover logic

The challenge is to implement this without breaking existing functionality while maintaining clean separation of concerns.

## Goals / Non-Goals

**Goals:**
- Support multiple API keys per provider with automatic failover
- Promote working API keys to the top of the list on successful translation
- Maintain backward compatibility with existing single-key configurations
- Keep UI simple: one key per line in a textarea
- Apply failover only to API-key-related errors (not network errors or other failures)
- Provide "Test Keys" button to validate all keys and reorder them automatically

**Non-Goals:**
- Per-key usage tracking or statistics
- Visual indication of which key is currently being used
- Key validation beyond what providers already do
- Different prioritization strategies (always most-recently-used at top)

## Decisions

### Decision 1: Storage Format
**Choice**: Store API keys as newline-separated strings in existing storage keys

**Rationale**:
- Minimal storage schema changes (reuse existing keys like `API_KEY`, `OPENAI_API_KEY`)
- Easy to parse and display in textarea
- Backward compatible: existing single keys work as-is
- No database migration needed

**Alternatives considered**:
- JSON array: More complex to edit manually, harder to debug
- Separate storage keys per provider: Doubles storage complexity
- Indexed metadata: Over-engineering for current use case

### Decision 2: Key Selection Strategy
**Choice**: Always try first key first; on success, move to top; on failover error, try next

**Rationale**:
- Promotes recently successful keys for better hit rate
- Simple deterministic behavior (no randomization)
- Users can control priority by manually ordering keys
- Automatic optimization without configuration

**Alternatives considered**:
- Round-robin: Would waste time trying known-bad keys
- Least-recently-used: Requires tracking metadata
- Random selection: Unpredictable behavior

### Decision 3: Failover Error Types
**Choice**: Only retry on specific API-key-related errors: `API_KEY_INVALID`, `INSUFFICIENT_BALANCE`, `QUOTA_EXCEEDED`, `RATE_LIMIT_REACHED`, `FORBIDDEN_ERROR` (when auth-related)

**Rationale**:
- Network errors should fail immediately (not a key problem)
- Server errors should fail immediately (not a key problem)
- Only retry when a different key might actually help

**Alternatives considered**:
- Retry on all errors: Would waste time and API quota
- Retry only on 401/403: Too narrow (misses quota/rate-limit cases)

### Decision 4: Where to Implement Failover Logic
**Choice**: Add to `BaseProvider._executeApiCall()` method

**Rationale**:
- Single point of control for all API calls
- Already has error handling logic
- Can intercept API-key-related errors before they propagate
- Works for all provider types (AI and traditional)

**Alternatives considered**:
- In each provider: Code duplication, inconsistent behavior
- In a new middleware layer: Unnecessary complexity
- In `UnifiedTranslationService`: Too far from API call site

### Decision 5: UI Component Changes
**Choice**: Replace `BaseInput type="password"` with `BaseTextarea` for API key fields

**Rationale**:
- Minimal code change across components
- Consistent pattern across all providers
- Textarea naturally supports multiline input

**Alternatives considered**:
- Dynamic list of individual inputs: More complex, harder to manage
- Keep single input + add advanced mode: Confusing UX

### Decision 6: Test Keys Button
**Choice**: Add a "Test Keys" button next to each API key textarea that validates all keys and reorders them

**Rationale**:
- Users can quickly verify which keys are working without translating
- Automatic reordering puts working keys at the top (same behavior as runtime promotion)
- Provides immediate feedback on key validity
- Helps users clean up their key lists

**Implementation**:
- Button triggers parallel validation requests for all non-empty keys
- Keys that successfully validate are moved to the top
- Invalid keys remain at the bottom
- If no keys are valid, show error message to user
- Show loading state during validation
- Display results: count of valid/invalid keys

**Alternatives considered**:
- Manual validation: Users would need to test each key individually
- Background validation: Could consume API quota unexpectedly
- No validation: Users wouldn't know which keys work until they fail in production

## Architecture Changes

### New Module: ApiKeyManager
**Location**: `src/features/translation/providers/ApiKeyManager.js`

**Responsibilities**:
- Parse API key strings into arrays
- Get next available key for a provider
- Move successful key to front of list
- Save updated key order to storage
- Test all keys for validity and reorder them

**API**:
```javascript
class ApiKeyManager {
  // Get all keys for a provider (returns array)
  static getKeys(providerSettingKey): string[]

  // Get primary key (first in list)
  static getPrimaryKey(providerSettingKey): string

  // Move key to front and save
  static promoteKey(providerSettingKey, key): Promise<void>

  // Check if error should trigger failover
  static shouldFailover(error): boolean

  // Test all keys and reorder (valid keys first, invalid keys last)
  // Returns { valid: string[], invalid: string[], allInvalid: boolean }
  static testAndReorderKeys(providerSettingKey, providerName): Promise<TestResult>
}
```

### Modified Components

**BaseProvider._executeApiCall()**:
- Wrap existing API call in retry loop
- On API-key-related error, get next key and retry
- On success, promote used key and return result
- Maintain same error types and behavior for callers

**API Settings Components** (6 files):
- Replace `<BaseInput type="password">` with `<BaseTextarea>`
- Update placeholder text to indicate one key per line
- Keep password masking (visual obfuscation)

**config.js Getters**:
- Add new getters that return arrays: `getOpenAIApiKeysAsync()`, etc.
- Keep existing single-key getters for backward compatibility (return first key)

## Risks / Trade-offs

### Risk: Breaking Existing Settings
**Mitigation**: Auto-migrate single keys to array format on first read

### Risk: Performance Impact from Multiple Retries
**Mitigation**: Limit to 3 retries; fail fast on non-key errors

### Risk: Key Order Changes During Concurrent Requests
**Mitigation**: Use atomic storage updates; last-write-wins is acceptable

### Risk: UI Complexity with Multiple Keys
**Mitigation**: Keep simple textarea input; no advanced UI needed

### Trade-off: Key Promotion on Every Success
**Rationale**: Ensures best key stays at top; acceptable storage overhead

## Migration Plan

**Phase 1: Storage Layer**
1. Add `ApiKeyManager` module
2. Update config.js getters to parse multi-key format
3. Add migration logic: if single key detected, treat as single-item array

**Phase 2: Provider Logic**
1. Modify `BaseProvider._executeApiCall()` with retry loop
2. Add key promotion on success
3. Update individual providers to use new key getters

**Phase 3: UI Layer**
1. Update all 6 API settings components to use textarea
2. Update placeholders and labels
3. Test backward compatibility

**Rollback**: Single keys still work; no breaking changes to storage schema

## Open Questions

1. **Should we show which key is currently being used?**
   - Deferred: Would require UI changes; low priority

2. **Should we limit the number of keys per provider?**
   - No explicit limit; textarea naturally limits to reasonable input

3. **Should keys be de-duplicated?**
   - No: User might want same key multiple times (unlikely but valid use case)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CUSTOM_RESPONSE_FORMAT_SUPPORT,
  normalizeCustomResponseFormatCacheKey,
  getCustomResponseFormatSupport,
  setCustomResponseFormatSupport,
  clearCustomResponseFormatSupportCache,
  isUnsupportedResponseFormatError,
} from './CustomResponseFormatCapability.js';
import * as CustomProviderModule from './CustomProvider.js';

const URL = 'https://custom-api.com/v1/chat/completions';
const MODEL = 'custom-model';

describe('CustomResponseFormatCapability extraction', () => {
  beforeEach(() => {
    clearCustomResponseFormatSupportCache();
  });

  it('exposes a frozen supported/unsupported tri-state', () => {
    expect(CUSTOM_RESPONSE_FORMAT_SUPPORT).toEqual({ SUPPORTED: 'supported', UNSUPPORTED: 'unsupported' });
    expect(Object.isFrozen(CUSTOM_RESPONSE_FORMAT_SUPPORT)).toBe(true);
  });

  it('normalizes trailing slashes and whitespace, preserves case', () => {
    expect(normalizeCustomResponseFormatCacheKey(`${URL}/`, MODEL))
      .toBe(normalizeCustomResponseFormatCacheKey(URL, MODEL));
    expect(normalizeCustomResponseFormatCacheKey(`  ${URL}  `, ` ${MODEL} `))
      .toBe(normalizeCustomResponseFormatCacheKey(URL, MODEL));
    expect(normalizeCustomResponseFormatCacheKey(URL.toUpperCase(), MODEL))
      .not.toBe(normalizeCustomResponseFormatCacheKey(URL, MODEL));
  });

  it('returns null for missing keying facts', () => {
    expect(normalizeCustomResponseFormatCacheKey('', MODEL)).toBeNull();
    expect(normalizeCustomResponseFormatCacheKey(URL, '')).toBeNull();
    expect(normalizeCustomResponseFormatCacheKey('   ', MODEL)).toBeNull();
    expect(normalizeCustomResponseFormatCacheKey(null, undefined)).toBeNull();
  });

  it('reads unknown for uncached keys and round-trips writes', () => {
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
    expect(setCustomResponseFormatSupport(URL, MODEL, 'supported')).toBe(true);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
    expect(setCustomResponseFormatSupport(URL, MODEL, 'unsupported')).toBe(true);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('unsupported');
  });

  it('rejects invalid values and keys without touching the cache', () => {
    expect(setCustomResponseFormatSupport(URL, MODEL, 'unknown')).toBe(false);
    expect(setCustomResponseFormatSupport(URL, MODEL, true)).toBe(false);
    expect(setCustomResponseFormatSupport('', MODEL, 'supported')).toBe(false);
    expect(setCustomResponseFormatSupport(URL, '', 'supported')).toBe(false);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('keys URL and model independently', () => {
    setCustomResponseFormatSupport(URL, MODEL, 'unsupported');
    expect(getCustomResponseFormatSupport('https://other.example/v1/chat/completions', MODEL)).toBeUndefined();
    expect(getCustomResponseFormatSupport(URL, 'other-model')).toBeUndefined();
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('unsupported');
  });

  it('clears all entries', () => {
    setCustomResponseFormatSupport(URL, MODEL, 'supported');
    clearCustomResponseFormatSupportCache();
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it.each([
    'Unknown parameter: response_format',
    'response_format is not supported',
    'unsupported response_format',
    "'response_format.type' must be 'json_schema' or 'text'",
  ])('classifies %s as an explicit rejection', (message) => {
    expect(isUnsupportedResponseFormatError({ statusCode: 400, message })).toBe(true);
  });

  it('does not classify unrelated or out-of-status errors', () => {
    expect(isUnsupportedResponseFormatError({ statusCode: 400, message: 'Invalid max_tokens' })).toBe(false);
    expect(isUnsupportedResponseFormatError({ statusCode: 401, message: 'Unknown parameter: response_format' })).toBe(false);
    expect(isUnsupportedResponseFormatError({ statusCode: 500, message: 'response_format is not supported' })).toBe(false);
  });

  it('is the single policy re-exported by CustomProvider (no second cache)', () => {
    expect(CustomProviderModule.normalizeCustomResponseFormatCacheKey)
      .toBe(normalizeCustomResponseFormatCacheKey);
    expect(CustomProviderModule.clearCustomResponseFormatSupportCache)
      .toBe(clearCustomResponseFormatSupportCache);
    expect(CustomProviderModule.isUnsupportedResponseFormatError)
      .toBe(isUnsupportedResponseFormatError);
    expect(CustomProviderModule.getCustomResponseFormatSupport)
      .toBe(getCustomResponseFormatSupport);
    expect(CustomProviderModule.setCustomResponseFormatSupport)
      .toBe(setCustomResponseFormatSupport);
  });
});

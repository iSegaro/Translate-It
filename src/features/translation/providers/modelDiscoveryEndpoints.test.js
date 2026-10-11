import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/shared/config/config.js';
import { isOfficialDeepSeekEndpoint, isOfficialGeminiEndpoint } from './modelDiscoveryEndpoints.js';

describe('isOfficialGeminiEndpoint', () => {
  const defaultUrl = new URL(CONFIG.GEMINI_API_URL);
  const modelsPath = defaultUrl.pathname.match(/^(.*\/models\/)[^/]+:generateContent$/)[1];

  it.each([
    ['the configured default', CONFIG.GEMINI_API_URL],
    ['the configured models list path', `${defaultUrl.origin}${modelsPath.slice(0, -1)}`],
    ['a curated model endpoint', `${defaultUrl.origin}${modelsPath}gemini-3.5-flash-lite:generateContent`],
    ['a non-curated model endpoint', `${defaultUrl.origin}${modelsPath}gemini-catalog-model:generateContent`],
    ['a suffixless model endpoint', `${defaultUrl.origin}${modelsPath}gemini-legacy-model`],
    ['a normalized explicit default port', `https://${defaultUrl.host}:443${defaultUrl.pathname}`],
    ['an absent endpoint', undefined],
    ['an empty endpoint', ''],
  ])('accepts %s', (_description, url) => {
    expect(isOfficialGeminiEndpoint(url)).toBe(true);
  });

  it.each([
    `${defaultUrl.origin}/v1beta/other/gemini:generateContent`,
    `${defaultUrl.origin}${modelsPath}gemini:streamGenerateContent`,
    `${defaultUrl.origin}${modelsPath}nested/model:generateContent`,
    'https://generativelanguage.googleapis.com.evil.example/v1beta/models/gemini:generateContent',
    'https://user:password@generativelanguage.googleapis.com/v1beta/models/gemini:generateContent',
    'https://generativelanguage.googleapis.com:444/v1beta/models/gemini:generateContent',
    `${CONFIG.GEMINI_API_URL}?key=secret`,
    `${CONFIG.GEMINI_API_URL}#fragment`,
    'not a url',
    'http://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent',
  ])('rejects %s', (url) => {
    expect(isOfficialGeminiEndpoint(url)).toBe(false);
  });
});

describe('isOfficialDeepSeekEndpoint', () => {
  const defaultUrl = new URL(CONFIG.DEEPSEEK_API_URL);

  it.each([
    ['the configured default', CONFIG.DEEPSEEK_API_URL],
    ['the exact normalized origin and path', `https://${defaultUrl.host}:443${defaultUrl.pathname}`],
    ['an absent endpoint', undefined],
    ['an empty endpoint', ''],
  ])('accepts %s', (_description, url) => {
    expect(isOfficialDeepSeekEndpoint(url)).toBe(true);
  });

  it.each([
    'https://api.deepseek.com.evil.example/chat/completions',
    'https://api.deepseek.com:444/chat/completions',
    'https://user:password@api.deepseek.com/chat/completions',
    'https://api.deepseek.com/v1/chat/completions',
    'https://api.deepseek.com/chat/completions/',
    `${CONFIG.DEEPSEEK_API_URL}?key=secret`,
    `${CONFIG.DEEPSEEK_API_URL}#fragment`,
    'not a url',
    'http://api.deepseek.com/chat/completions',
  ])('rejects %s', (url) => {
    expect(isOfficialDeepSeekEndpoint(url)).toBe(false);
  });
});

import { CONFIG } from '@/shared/config/config.js';

function parseOfficialEndpoint(rawUrl, defaultUrl) {
  if (rawUrl == null || rawUrl === '') return new URL(defaultUrl);
  if (typeof rawUrl !== 'string' || /[?#]/.test(rawUrl)) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function isOfficialGeminiEndpoint(rawUrl) {
  const defaultUrl = new URL(CONFIG.GEMINI_API_URL);
  const url = parseOfficialEndpoint(rawUrl, CONFIG.GEMINI_API_URL);
  const modelsPath = defaultUrl.pathname.match(/^(.*\/models\/)[^/]+:generateContent$/)?.[1];
  const modelsListPath = modelsPath?.slice(0, -1);

  return Boolean(
    url &&
    modelsPath &&
    url.origin === defaultUrl.origin &&
    (url.pathname === modelsListPath ||
      new RegExp(`^${modelsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^/:]+(?::generateContent)?$`).test(url.pathname))
  );
}

export function isOfficialDeepSeekEndpoint(rawUrl) {
  const defaultUrl = new URL(CONFIG.DEEPSEEK_API_URL);
  const url = parseOfficialEndpoint(rawUrl, CONFIG.DEEPSEEK_API_URL);

  return Boolean(url && url.origin === defaultUrl.origin && url.pathname === defaultUrl.pathname);
}

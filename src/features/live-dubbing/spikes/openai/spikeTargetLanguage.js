const TARGET_LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * Normalize a spike target language without loading any language catalog.
 * The spike binds whatever well-formed tag it is given into the mint body;
 * production catalog policy is out of scope for the spike.
 *
 * This helper lives in a neutral module on purpose: the Offscreen transport
 * needs it, and importing it from the Background-only mint service module
 * would drag the long-lived key lookup into the Offscreen boundary.
 * @param {unknown} language
 * @returns {string|null} The trimmed tag, or null when malformed.
 */
export function normalizeSpikeTargetLanguage(language) {
  if (typeof language !== 'string') return null;
  const trimmed = language.trim();
  if (!trimmed || trimmed.length > 32 || !TARGET_LANGUAGE_PATTERN.test(trimmed)) return null;
  return trimmed;
}

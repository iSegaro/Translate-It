/**
 * Google Slash-Dash Normalization
 * Normalizes the specific Google artifact where a source "/-" token is
 * duplicated to "//-" in the translated single-segment response.
 *
 * The normalization is intentionally gated by the original source text so it
 * only applies when the source actually contained the slash-dash pattern.
 */

const SOURCE_SLASH_DASH_REGEX = /\/-/;
const DUPLICATED_SLASH_DASH_REGEX = /(^|[\s([{<])\/\/\s*-(?=$|[\s)\]}>.,!?;:])/g;

export const normalizeGoogleSlashDashArtifact = (translatedText, sourceText) => {
  if (typeof translatedText !== 'string' || typeof sourceText !== 'string') {
    return translatedText;
  }

  if (!SOURCE_SLASH_DASH_REGEX.test(sourceText)) {
    return translatedText;
  }

  return translatedText.replace(DUPLICATED_SLASH_DASH_REGEX, (_match, prefix = '') => `${prefix}/-`);
};

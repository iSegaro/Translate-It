/**
 * Subtitle Text Protector - Handles tokenization of subtitle-specific formatting
 * Ensures that line breaks and HTML tags are preserved during translation.
 */

export class SubtitleTextProtector {
  constructor() {
    // Use a token format that is less likely to be modified by translation providers
    // The format @@SUB_...@@ is more robust than [[...]] which providers may interpret as markup
    this.tokenPrefix = '@@SUB_';
    this.tokenSuffix = '@@';
  }

  /**
   * Protects text by replacing structural elements with tokens.
   * @param {string} text - Original cue text
   * @returns {Object} { text: protectedText, tokens: Map }
   */
  protect(text) {
    if (!text || typeof text !== 'string') return { text, tokens: new Map() };

    const tokens = new Map();
    let protectedText = text;
    let tokenCounter = 0;

    // 1. Protect Internal Newlines
    // We use a specific token for newlines to distinguish them from provider-injected breaks
    protectedText = protectedText.replace(/\n/g, () => {
      const token = `${this.tokenPrefix}NL_${tokenCounter++}${this.tokenSuffix}`;
      tokens.set(token, '\n');
      return token;
    });

    // 2. Protect HTML/Formatting tags (e.g., <i>, <b>, <font color="...">)
    // SRT supports some basic HTML-like tags
    protectedText = protectedText.replace(/<\/?[^>]+>/g, (match) => {
      const token = `${this.tokenPrefix}TAG_${tokenCounter++}${this.tokenSuffix}`;
      tokens.set(token, match);
      return token;
    });

    // 3. Protect SRT/ASS style tags (e.g., {\an8}, {\i1})
    // These tags are enclosed in curly braces
    protectedText = protectedText.replace(/\{[^}]+\}/g, (match) => {
      const token = `${this.tokenPrefix}STY_${tokenCounter++}${this.tokenSuffix}`;
      tokens.set(token, match);
      return token;
    });

    return { text: protectedText, tokens };
  }

  /**
   * Normalizes tokens that might have been mangled by translation providers (like Yandex)
   * by adding spaces inside or around the @@ boundaries.
   * e.g. "@@ SUB_NL_0 @ @" -> "@@SUB_NL_0@@"
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
   */
  normalize(text) {
    if (!text || typeof text !== 'string') return text;
    // Pattern: @\s*@\s*SUB_([A-Z]+)\s*_\s*(\d+)\s*@\s*@
    return text.replace(/@\s*@\s*SUB_([A-Z]+)\s*_\s*(\d+)\s*@\s*@/ig, (match, type, id) => {
      return `@@SUB_${type.toUpperCase()}_${id}@@`;
    });
  }

  /**
   * Restores tokens in the translated text back to their original values.
   * @param {string} translatedText - Text returned by the provider
   * @param {Map} tokens - Tokens map from the protect phase
   * @returns {string} Restored text
   */
  restore(translatedText, tokens) {
    if (!translatedText || !tokens || tokens.size === 0) return translatedText;

    let restoredText = this.normalize(translatedText);

    // Sort tokens by length (longest first) to avoid partial replacement if any overlap exists
    // (though our token format SUB_NL_0, SUB_TAG_1 should be unique enough)
    const sortedTokens = Array.from(tokens.keys()).sort((a, b) => b.length - a.length);

    for (const token of sortedTokens) {
      const value = tokens.get(token);
      // Use split/join for global replacement without regex escaping issues
      restoredText = restoredText.split(token).join(value);
    }

    return restoredText;
  }

  /**
   * Validates if all tokens were preserved in the translated text.
   * @param {string} translatedText 
   * @param {Map} tokens 
   * @returns {Array} List of missing tokens
   */
  getMissingTokens(translatedText, tokens) {
    const missing = [];
    if (!tokens) return missing;

    const normalizedText = this.normalize(translatedText);

    for (const token of tokens.keys()) {
      if (!normalizedText.includes(token)) {
        missing.push(token);
      }
    }
    return missing;
  }
}

export const subtitleTextProtector = new SubtitleTextProtector();

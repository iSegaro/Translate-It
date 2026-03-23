// src/features/translation/providers/DeepLTranslate.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getDeeplApiKeysAsync,
  getDeeplApiTierAsync,
  getDeeplFormalityAsync,
  getDeeplBetaLanguagesEnabledAsync,
  getDeeplFreeApiUrlAsync,
  getDeeplProApiUrlAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { PROVIDER_LANGUAGE_MAPPINGS } from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepLTranslate');

// Use mappings from languageConstants.js
const DEEPL_LANG_CODE_MAP = PROVIDER_LANGUAGE_MAPPINGS.DEEPL;
const DEEPL_BETA_LANG_CODE_MAP = PROVIDER_LANGUAGE_MAPPINGS.DEEPL_BETA;

export class DeepLTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "DeepL Translate";
  static description = "AI-powered translation by DeepL";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static CHAR_LIMIT = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.DEEPL;

  // BaseTranslateProvider capabilities
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.DEEPL;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.DEEPL;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.DEEPL;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.DEEPL;

  constructor() {
    super(ProviderNames.DEEPL_TRANSLATE);
    this.providerSettingKey = 'DEEPL_API_KEY';
  }

  /**
   * Get configuration using project's existing config system
   * Uses StorageManager's built-in caching and config.js helpers
   */
  async _getConfig() {
    try {
      // Use project's existing config system with built-in caching
      const [apiKeys, apiTier] = await Promise.all([
        getDeeplApiKeysAsync(),
        getDeeplApiTierAsync(),
      ]);

      // Get first available key
      const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

      // Get API endpoint based on tier
      const apiUrl = apiTier === 'pro'
        ? await getDeeplProApiUrlAsync()
        : await getDeeplFreeApiUrlAsync();

      // Configuration loaded successfully
      logger.info(`[DeepL] Using tier: ${apiTier}`);

      return { apiKey, apiTier, apiUrl };
    } catch (error) {
      logger.error(`[DeepL] Error loading configuration:`, error);
      throw error;
    }
  }

  /**
   * Convert language code to DeepL uppercase format
   * @param {string} lang - Language code or name
   * @param {boolean} enableBetaLanguages - Whether beta languages are enabled
   * @returns {string} DeepL language code (uppercase)
   */
  _getLangCode(lang, enableBetaLanguages = false) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return ''; // DeepL auto-detect uses empty string

    // Check standard languages first
    if (DEEPL_LANG_CODE_MAP[normalized]) {
      return DEEPL_LANG_CODE_MAP[normalized];
    }

    // Check beta languages if enabled
    if (enableBetaLanguages && DEEPL_BETA_LANG_CODE_MAP[normalized]) {
      return DEEPL_BETA_LANG_CODE_MAP[normalized];
    }

    // Convert to uppercase as fallback
    return normalized.toUpperCase().replace(/-/g, '-');
  }

  /**
   * Extract contextual metadata to improve DeepL translation quality
   * Provides domain and semantic information to help disambiguate terms
   * @param {HTMLElement} blockContainer - The block container being translated
   * @returns {string|null} Context string or null if not available
   */
  _extractTranslationContext(blockContainer) {
    if (!blockContainer) return null;

    const contextParts = [];

    // 1. Extract page title (source domain context)
    if (typeof document !== 'undefined' && document.title) {
      const title = document.title.trim();
      if (title) {
        contextParts.push(`Source Page: ${title}`);
      }
    }

    // 2. Extract block container type (structural context)
    const tagName = blockContainer.tagName;
    if (tagName) {
      // Map common tag names to semantic descriptions
      const semanticNames = {
        'P': 'paragraph',
        'H1': 'main heading',
        'H2': 'subheading',
        'H3': 'section heading',
        'LI': 'list item',
        'DIV': 'content section',
        'ARTICLE': 'article',
        'SECTION': 'section',
        'BLOCKQUOTE': 'blockquote',
        'TD': 'table cell',
        'TH': 'table header',
        'CAPTION': 'caption',
        'FIGCAPTION': 'figure caption'
      };

      const semanticName = semanticNames[tagName] || tagName.toLowerCase();
      contextParts.push(`Content Area: ${semanticName}`);
    }

    // 3. Add parent context for better disambiguation
    const parent = blockContainer.parentElement;
    if (parent) {
      const parentTag = parent.tagName;
      const parentSemantic = {
        'NAV': 'navigation',
        'ARTICLE': 'article',
        'SECTION': 'section',
        'ASIDE': 'sidebar',
        'HEADER': 'header',
        'FOOTER': 'footer',
        'MAIN': 'main content'
      }[parentTag];

      if (parentSemantic) {
        contextParts.push(`Location: ${parentSemantic}`);
      }
    }

    if (contextParts.length === 0) return null;

    // Combine with separator, limit to 1000 characters
    let context = contextParts.join(' | ');

    // Sanitize: Remove any XML tags or @@@ markers
    context = context
      .replace(/<[^>]+>/g, '')  // Remove XML tags
      .replace(/@@@/g, '')       // Remove newline markers
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    // Limit length to avoid API overhead
    const MAX_CONTEXT_LENGTH = 1000;
    if (context.length > MAX_CONTEXT_LENGTH) {
      context = context.substring(0, MAX_CONTEXT_LENGTH - 3) + '...';
    }

    return context;
  }

  /**
   * Validate XML placeholder integrity in DeepL response
   * @param {string} requestText - Original text sent to DeepL
   * @param {string} responseText - Translated text received from DeepL
   * @returns {Object} Validation result with isValid flag and error details
   */
  _validateXMLPlaceholders(requestText, responseText) {
    // Extract XML tags from request
    const requestTags = requestText.match(/<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi);
    const requestTagCount = requestTags ? requestTags.length : 0;

    // Extract XML tags from response
    const responseTags = responseText.match(/<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi);
    const responseTagCount = responseTags ? responseTags.length : 0;

    // Check 1: Tag count mismatch
    if (requestTagCount !== responseTagCount) {
      return {
        isValid: false,
        error: 'tag_count_mismatch',
        details: {
          requestTagCount,
          responseTagCount
        }
      };
    }

    // Check 2: Validate tag syntax integrity
    const malformedPatterns = [
      /<x\s+id[^>]*[^/]>/gi,      // Missing closing slash: <x id="0">
      /<x\s+id=\s*[^"'][^>]*>/gi,  // Missing quotes: <x id=0/>
      /<x\s+[^i]/gi,                // Missing id attribute: <x/>
      /<\s*x/gi                     // Space after <: < x>
    ];

    for (const pattern of malformedPatterns) {
      if (pattern.test(responseText)) {
        return {
          isValid: false,
          error: 'malformed_tags',
          details: {
            pattern: pattern.source
          }
        };
      }
    }

    // Check 3: Verify all placeholder IDs are unique and present
    const requestIds = new Set();
    const requestIdMatch = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;
    let match;
    while ((match = requestIdMatch.exec(requestText)) !== null) {
      requestIds.add(parseInt(match[1], 10));
    }

    const responseIds = new Set();
    const responseIdMatch = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;
    while ((match = responseIdMatch.exec(responseText)) !== null) {
      const id = parseInt(match[1], 10);
      if (responseIds.has(id)) {
        // Duplicate ID found
        return {
          isValid: false,
          error: 'duplicate_ids',
          details: {
            duplicateId: id
          }
        };
      }
      responseIds.add(id);
    }

    // Check 4: All request IDs present in response
    for (const id of requestIds) {
      if (!responseIds.has(id)) {
        return {
          isValid: false,
          error: 'missing_ids',
          details: {
            missingId: id
          }
        };
      }
    }

    return {
      isValid: true,
      details: {
        requestTagCount,
        responseTagCount
      }
    };
  }

  /**
   * Translate a single chunk of texts using DeepL API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language (DeepL code)
   * @param {string} targetLang - Target language (DeepL code)
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @param {HTMLElement} blockContainer - Block container for context extraction
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt = 0, chunkIndex = 0, totalChunks = 1, blockContainer = null) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;

    // Normalize language codes
    const sl = this._getLangCode(sourceLang, true); // Enable beta for normalization
    const tl = this._getLangCode(targetLang, true);

    // Get configuration and validate API key
    const { apiKey, apiUrl } = await this._getConfig();

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      context
    );

    // Filter out empty or whitespace-only texts (DeepL rejects them)
    const validTexts = chunkTexts.filter(text => text && text.trim().length > 0);

    if (validTexts.length === 0) {
      logger.warn('[DeepL] No valid texts to translate after filtering');
      return chunkTexts.map(() => '');
    }

    // CRITICAL: Pre-compile regex patterns FIRST, before any usage
    // Build control character pattern from character codes to avoid lint errors
    const CONTROL_CHAR_CODES = [
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,  // \x00-\x08
      0x0B, 0x0C,  // \x0B-\x0C (vertical tab, form feed)
      0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F,  // \x0E-\x1F
      0x7F  // DEL
    ];
    const CONTROL_CHARS_PATTERN = new RegExp(`[${CONTROL_CHAR_CODES.map(c => String.fromCharCode(c)).join('')}]`, 'g');
    const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
    const SPECIAL_UNICODE_PATTERN = /[\uFFF0-\uFFFF]/g;

    // Pattern to detect potentially problematic characters BEFORE escaping
    // These cause "not well-formed" errors in XML mode
    const PROBLEMATIC_XML_CHARS = /[<>&]|&#?\w+;/;

    // Unescape XML entities back to original characters after translation
    const unescapeXML = (text) => {
      if (!text) return text;
      return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');  // Must be last to avoid double-unescaping
    };

    // PRE-FLIGHT: Detect texts with problematic XML characters
    // This helps identify which segments would cause HTTP 400 errors
    const problematicIndices = [];
    validTexts.forEach((text, i) => {
      if (PROBLEMATIC_XML_CHARS.test(text)) {
        problematicIndices.push(i);
      }
    });

    if (problematicIndices.length > 0) {
      logger.debug(`[DeepL] Pre-flight: Found ${problematicIndices.length} texts with XML-special chars (indices: ${problematicIndices.join(', ')}) - will escape them`);
    }

    if (validTexts.length < chunkTexts.length) {
      logger.debug(`[DeepL] Filtered ${chunkTexts.length - validTexts.length} empty/whitespace texts`);
    }

    // Step 1: Detect XML placeholders in request
    const hasXMLPlaceholders = validTexts.some(text =>
      /<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi.test(text)
    );

    logger.debug('[DeepL] XML placeholder detection:', {
      hasXMLPlaceholders,
      textCount: validTexts.length
    });

    const sanitizeText = (text) => {
      const originalLength = text.length;
      let sanitized = text
        .replace(ZERO_WIDTH_PATTERN, '')  // Zero-width characters
        .replace(CONTROL_CHARS_PATTERN, '')  // Control chars except \n, \r, \t
        .replace(SPECIAL_UNICODE_PATTERN, '');  // Other special Unicode characters

      // CRITICAL: Escape XML special characters BEFORE adding XML markers
      // This prevents "not well-formed (invalid token)" errors when tag_handling=xml
      // Order matters: escape & first, then < and >
      sanitized = sanitized
        .replace(/&/g, '&amp;')           // Must be first to avoid double-escaping
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Log if sanitization removed any characters
      if (sanitized.length !== originalLength) {
        logger.debug(`[DeepL] Sanitization processed ${originalLength} char text (removed special chars, escaped XML)`);
      }

      return sanitized;
    };

    // CRITICAL: Use XML-based markers to preserve ALL newlines
    // This is much safer than text markers like " @ " which can confuse DeepL
    const BLANK_LINE_MARKER = '<n2/>';  // Marker for \n\n
    const SINGLE_NEWLINE_MARKER = '<n1/>';  // Marker for \n

    const textsToTranslate = validTexts.map(text => {
      // CRITICAL: Sanitize text before processing to remove problematic characters
      const sanitizedText = sanitizeText(text);

      // Step 1: Replace blank lines (\n\n) with their marker
      let processed = sanitizedText.replace(/\n\n+/g, (match) => {
        const blankLineCount = Math.floor(match.length / 2);
        return BLANK_LINE_MARKER.repeat(blankLineCount);
      });

      // Step 2: Replace remaining single newlines (\n) with their marker
      processed = processed.replace(/\n/g, SINGLE_NEWLINE_MARKER);

      return processed;
    });

    // Get beta languages setting
    let betaLanguagesEnabled = await getDeeplBetaLanguagesEnabledAsync();

    // Auto-detect: if source or target language is a beta language, enable beta languages
    // Check if sl is a beta language
    const sourceIsBeta = sl && sl !== '' &&
      !DEEPL_LANG_CODE_MAP[sourceLang.toLowerCase()] &&
      DEEPL_BETA_LANG_CODE_MAP[sourceLang.toLowerCase()];

    // Check if tl is a beta language
    const targetIsBeta = tl &&
      !DEEPL_LANG_CODE_MAP[targetLang.toLowerCase()] &&
      DEEPL_BETA_LANG_CODE_MAP[targetLang.toLowerCase()];

    // Auto-enable beta languages if needed
    if (sourceIsBeta || targetIsBeta) {
      betaLanguagesEnabled = true;
      logger.info(`[DeepL] Auto-enabling beta languages for ${sourceIsBeta ? 'source' : ''}${sourceIsBeta && targetIsBeta ? ' and ' : ''}${targetIsBeta ? 'target' : ''} language`);
    }

    // Add key info log for translation start
    logger.info(`[DeepL] Starting translation: ${validTexts.join('').length} chars, ${validTexts.length} segments (filtered from ${chunkTexts.length}), beta languages: ${betaLanguagesEnabled}`);

    // Build request body with valid texts only (with text markers for newlines)
    const requestBody = new URLSearchParams();
    textsToTranslate.forEach(text => requestBody.append('text', text));

    // DeepL uses empty source_lang for auto-detection
    if (sl && sl !== '') {
      requestBody.append('source_lang', sl);
    }
    requestBody.append('target_lang', tl);

    // Add formality parameter (not supported for beta languages)
    const formality = await getDeeplFormalityAsync() || 'default';
    if (formality !== 'default' && !betaLanguagesEnabled) {
      requestBody.append('formality', formality);
    }

    // Add beta languages parameter if enabled
    if (betaLanguagesEnabled) {
      requestBody.append('enable_beta_languages', '1');
    }

    // CRITICAL: Add XML tag handling parameters
    // This enables DeepL's native XML tag preservation
    requestBody.append('tag_handling', 'xml');
    // Ignore both newline markers and any existing placeholders
    requestBody.append('ignore_tags', 'n1,n2,x');

    logger.debug('[DeepL] XML tag handling enabled', {
      tag_handling: 'xml',
      ignore_tags: 'n1,n2,x'
    });

    // CRITICAL: Add contextual metadata for better translation quality
    // Extract context from block container if available
    if (blockContainer) {
      const translationContext = this._extractTranslationContext(blockContainer);
      if (translationContext) {
        requestBody.append('context', translationContext);

        logger.debug('[DeepL] Context parameter added', {
          contextLength: translationContext.length,
          contextPreview: translationContext.substring(0, 100) + '...'
        });
      }
    }

    // Additional options
    requestBody.append('split_sentences', 'nonewlines'); // Preserve newlines in translation
    requestBody.append('preserve_formatting', '1'); // true

    // Debug log the request (without exposing full text content)
    logger.debug('[DeepL] Request details:', {
      textCount: validTexts.length,
      totalChars: validTexts.join('').length,
      sourceLang: sl || 'auto',
      targetLang: tl,
      betaLanguages: betaLanguagesEnabled,
      formality: betaLanguagesEnabled ? 'N/A (beta)' : (await getDeeplFormalityAsync() || 'default'),
      hasXMLPlaceholders,
      hasContext: blockContainer && this._extractTranslationContext(blockContainer) !== null
    });

    try {
      const result = await this._executeRequest({
        url: apiUrl,
        fetchOptions: {
          method: "POST",
          headers: {
            "Authorization": `DeepL-Auth-Key ${apiKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: requestBody,
        },
        extractResponse: (data) => {
          if (!data?.translations || !Array.isArray(data.translations)) {
            logger.error('[DeepL] Invalid API response:', data);
            return chunkTexts.map(() => '');
          }

          // DeepL returns array of translation objects for valid texts only
          const validTranslations = data.translations.map(t => t.text || '');

          // CRITICAL: Validate XML placeholders if present in request
          if (hasXMLPlaceholders) {
            for (let i = 0; i < validTranslations.length; i++) {
              const requestText = textsToTranslate[i];
              const responseText = validTranslations[i];

              const validation = this._validateXMLPlaceholders(requestText, responseText);

              if (!validation.isValid) {
                logger.error('[DeepL] XML placeholder validation failed', {
                  index: i,
                  error: validation.error,
                  details: validation.details
                });

                // Throw special error with XML corruption flag to trigger fallback
                const error = new Error(`XML placeholder validation failed: ${validation.error}`);
                error.isXMLCorruptionError = true;
                error.validationDetails = validation.details;
                error.errorIndex = i;
                throw error;
              }
            }

            logger.debug('[DeepL] XML placeholder validation passed for all translations');
          }

          // Restore ALL newlines by replacing XML markers with their original format
          const restoredTranslations = validTranslations.map(translation => {
            let restored = translation;

            // Step 1: Restore blank lines first (<n2/> → \n\n)
            if (restored.includes('<n2/>')) {
              restored = restored.replace(/<n2\s*\/?>/g, '\n\n');
            }

            // Step 2: Then restore single newlines (<n1/> → \n)
            if (restored.includes('<n1/>')) {
              restored = restored.replace(/<n1\s*\/?>/g, '\n');
            }

            // Step 3: Unescape XML entities back to original characters
            restored = unescapeXML(restored);

            return restored;
          });

          // Validate segment count (should match valid texts, not original chunkTexts)
          if (restoredTranslations.length !== validTexts.length) {
            logger.debug('[DeepL] Segment count mismatch');
          }

          // Map translations back to original chunkTexts order
          // Fill in empty strings for filtered texts
          const result = [];
          let validIndex = 0;

          for (let i = 0; i < chunkTexts.length; i++) {
            const text = chunkTexts[i];
            if (text && text.trim().length > 0) {
              // This text was translated - use restored translation
              result.push(restoredTranslations[validIndex] || '');
              validIndex++;
            } else {
              // This text was filtered out, return empty
              result.push('');
            }
          }

          return result;
        },
        context,
        abortController,
      });

      const finalResult = result || chunkTexts.map(() => '');

      // Add completion log for successful translation
      if (finalResult.length > 0) {
        logger.info(`[DeepL] Translation completed successfully`);
      }

      return finalResult;
    } catch (error) {
      // CRITICAL: Check if this is an XML corruption error and trigger fallback
      if (error.isXMLCorruptionError) {
        logger.error('[DeepL] XML corruption detected, triggering fallback to atomic extraction', {
          error: error.error,
          details: error.validationDetails,
          index: error.errorIndex
        });

        // Return original texts to trigger atomic extraction fallback in SelectElementManager
        // This preserves backward compatibility and allows translation to continue
        return chunkTexts;
      }

      // If HTTP 400 error and we have more than 1 segment, try splitting into smaller chunks
      // Reduced retry attempts from 5 to 3 since we now escape XML characters properly
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt < 3) {
        logger.debug(`[DeepL] HTTP 400 error with ${validTexts.length} segments, retrying with smaller chunks (attempt ${retryAttempt + 1}/3)`);

        // Split into smaller chunks and retry SEQUENTIALLY (not parallel)
        // DeepL Free API has issues with concurrent requests
        const midPoint = Math.ceil(validTexts.length / 2);
        const firstHalf = chunkTexts.slice(0, midPoint);
        const secondHalf = chunkTexts.slice(midPoint);

        let firstResult, secondResult;

        try {
          firstResult = await this._translateChunk(firstHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, chunkIndex, totalChunks);
        } catch {
          logger.debug(`[DeepL] First half failed, returning original texts for ${firstHalf.length} segments`);
          firstResult = firstHalf;
        }

        try {
          secondResult = await this._translateChunk(secondHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, chunkIndex, totalChunks);
        } catch {
          logger.debug(`[DeepL] Second half failed, returning original texts for ${secondHalf.length} segments`);
          secondResult = secondHalf;
        }

        return [...firstResult, ...secondResult];
      }

      // Final fallback for HTTP 400: translate each segment individually (sequential)
      // Only do this if we haven't already tried individual translation (now after 3 attempts)
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt >= 3) {
        logger.debug(`[DeepL] Retry attempts exhausted, attempting sequential one-by-one translation for ${validTexts.length} segments`);

        const results = [];
        let successCount = 0;
        const FALLBACK_BLANK_MARKER = '<n2/>';
        const FALLBACK_SINGLE_MARKER = '<n1/>';

        for (let i = 0; i < chunkTexts.length; i++) {
          const text = chunkTexts[i];
          // Skip empty texts
          if (!text || text.trim().length === 0) {
            results.push('');
            continue;
          }

          try {
            // CRITICAL: Sanitize and escape XML special characters before processing
            let sanitizedText = text
              .replace(ZERO_WIDTH_PATTERN, '')
              .replace(CONTROL_CHARS_PATTERN, '')
              .replace(SPECIAL_UNICODE_PATTERN, '');

            // Escape XML special characters to prevent parsing errors
            sanitizedText = sanitizedText
              .replace(/&/g, '&amp;')    // Must be first
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');

            // Step 1: Convert blank lines (\n\n) to marker
            let textWithMarkers = sanitizedText.replace(/\n\n+/g, (match) => {
              const blankLineCount = Math.floor(match.length / 2);
              return FALLBACK_BLANK_MARKER.repeat(blankLineCount);
            });

            // Step 2: Convert single newlines (\n) to marker
            textWithMarkers = textWithMarkers.replace(/\n/g, FALLBACK_SINGLE_MARKER);

            // Translate single segment
            const requestBody = new URLSearchParams();
            requestBody.append('text', textWithMarkers);

            if (sourceLang && sourceLang !== '') {
              requestBody.append('source_lang', sourceLang);
            }
            requestBody.append('target_lang', targetLang);

            if (betaLanguagesEnabled) {
              requestBody.append('enable_beta_languages', '1');
            }
            
            // Enable XML handling for markers
            requestBody.append('tag_handling', 'xml');
            requestBody.append('ignore_tags', 'n1,n2,x');
            requestBody.append('split_sentences', 'nonewlines');
            requestBody.append('preserve_formatting', '1');

            const result = await this._executeRequest({
              url: apiUrl,
              fetchOptions: {
                method: "POST",
                headers: {
                  "Authorization": `DeepL-Auth-Key ${apiKey}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: requestBody,
              },
              extractResponse: (data) => {
                if (!data?.translations || !Array.isArray(data.translations)) {
                  return text;
                }
                let translated = data.translations[0]?.text || text;

                // Restore markers
                translated = translated.replace(/<n2\s*\/?>/g, '\n\n');
                translated = translated.replace(/<n1\s*\/?>/g, '\n');

                // Unescape XML entities back to original characters
                translated = unescapeXML(translated);

                return translated;
              },
              context,
              abortController,
            });

            results.push(result || text);
            successCount++;
            logger.debug(`[DeepL] Sequential fallback: segment ${i + 1}/${chunkTexts.length} translated`);
          } catch {
            logger.debug(`[DeepL] Sequential fallback failed for segment ${i + 1}, using original`);
            results.push(text); // Return original text as fallback
          }
        }

        logger.info(`[DeepL] Sequential fallback completed: ${successCount}/${chunkTexts.length} segments translated`);
        return results;
      }

      // Otherwise, rethrow the error
      const errorType = error.type || matchErrorToType(error);
      if (isFatalError(error) || isFatalError(errorType)) {
        if (!error.type) error.type = errorType;
      }
      throw error;
    }
  }
}

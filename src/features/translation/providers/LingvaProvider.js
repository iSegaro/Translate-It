import { BaseTranslateProvider } from "./BaseTranslateProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getTextInfo } from "./utils/TraditionalTextProcessor.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { getLingvaApiUrlAsync } from "@/shared/config/config.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TranslationSegmentMapper } from '@/utils/translation/TranslationSegmentMapper.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'LingvaProvider');

/**
 * Lingva Translate Provider
 * A free and open-source alternative front-end for Google Translate.
 * Following the project's standard pattern for traditional providers.
 *
 * Blank items remain represented as empty delimiter-separated segments.
 * The downstream segment-mapping layer reconstructs their original positions
 * from the joined translation result. All-blank chunks retain the established
 * joined-string behavior; this provider does not introduce blank-input filtering.
 */
export class LingvaProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Lingva";
  static reliableJsonMode = true;

  // Standard delimiter used by traditional providers in this project.
  static TEXT_DELIMITER = '\n\n---\n\n';

  // Conservative full-URL budget for Lingva GET requests.
  // Measured against the full serialized request URL including:
  //   normalized-api-path + /api/v1/ + source + / + target + / + encoded-text
  // NOT an authoritative Lingva protocol limit. Chosen as a conservative
  // compatibility budget for common browsers and server configurations.
  static FULL_URL_BUDGET = 1900;

  constructor() {
    super(ProviderNames.LINGVA);
  }

  /** @returns {number} Current full-URL budget. Override in tests via spy. */
  _getFullUrlBudget() {
    return LingvaProvider.FULL_URL_BUDGET;
  }

  async _getApiPath() {
    return await getLingvaApiUrlAsync();
  }

  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return "auto";
    return getProviderLanguageCode(lang, 'LINGVA');
  }

  /**
   * Normalize the configured API path: strip trailing slashes, reject query/hash.
   * @param {string} rawPath
   * @returns {string}
   * @private
   */
  _normalizeApiPath(rawPath) {
    let p = String(rawPath || '').trim().replace(/\/+$/, '');
    if (p.includes('?') || p.includes('#')) {
      const error = new Error('Lingva API path must not contain query or hash');
      error.type = ErrorTypes.API_CONFIG_INVALID;
      throw error;
    }
    return p;
  }

  /**
   * Build a Lingva request URL from normalized components.
   * @param {string} apiPath - Normalized (trailing-slash-free) base path.
   * @param {string} sl - Source language code.
   * @param {string} tl - Target language code.
   * @param {string} text - Raw text to encode into the path.
   * @returns {string}
   * @private
   */
  _buildRequestUrl(apiPath, sl, tl, text) {
    return `${apiPath}/api/v1/${sl}/${tl}/${encodeURIComponent(text)}`;
  }

  /**
   * Extract and validate the translation string from a Lingva API response.
   * @param {*} data - Raw API response.
   * @returns {string}
   * @private
   */
  _extractLingvaTranslation(data) {
    if (typeof data?.translation !== 'string' || !data.translation.trim()) {
      const error = new Error('Lingva response contained no translation text');
      error.type = ErrorTypes.API_RESPONSE_INVALID;
      throw error;
    }
    return data.translation;
  }

  /**
   * Execute a single Lingva GET request via the provider request engine.
   * @param {string} url - Full request URL.
   * @param {string} context - Diagnostic context label.
   * @param {AbortController} abortController
   * @param {number} charCount - Normalized text character count (pre-encoding).
   * @param {number} originalCharCount - Original source character count.
   * @returns {Promise<string>}
   * @private
   */
  async _executeLingvaRequest(url, context, abortController, charCount, originalCharCount, options = {}) {
    return this._executeRequest({
      url,
      fetchOptions: {
        method: "GET",
        mode: 'cors',
        credentials: 'omit',
        headers: { "Accept": "application/json" }
      },
      extractResponse: (data) => this._extractLingvaTranslation(data),
      context,
      abortController,
      charCount,
      originalCharCount,
      callPurpose: options.callPurpose
    });
  }

  /**
   * Validate mapped output before returning the joined provider result.
   *
   * @param {string} translatedText - Joined Lingva response.
   * @param {Array} sourceTexts - Source items for the physical chunk.
   * @throws {Error} with type API_RESPONSE_INVALID for invalid mapped output.
   * @private
   */
  _validateMappedOutput(translatedText, sourceTexts) {
    // No delimiter means BaseTranslateProvider owns fallback word-ratio mapping.
    if (sourceTexts.length <= 1 || !translatedText.includes(LingvaProvider.TEXT_DELIMITER)) return;

    let mappedTexts;
    try {
      mappedTexts = TranslationSegmentMapper.mapTranslationToOriginalSegments(
        translatedText,
        sourceTexts,
        TranslationSegmentMapper.STANDARD_DELIMITER,
        this.providerName
      );
    } catch (error) {
      // Preserve BaseTranslateProvider's existing cardinality conversion path.
      if (error.type === TranslationSegmentMapper.INCOMPLETE_CARDINALITY) return;
      throw error;
    }

    const invalidIndex = mappedTexts.findIndex((translatedItem, index) => {
      const sourceText = getTextInfo(sourceTexts[index]).text;
      return sourceText.trim() !== ''
        && (typeof translatedItem !== 'string' || translatedItem.trim() === '');
    });

    if (invalidIndex !== -1) {
      const invalidResponse = new Error(
        `[${this.providerName}] Invalid mapped translation at index ${invalidIndex}`
      );
      invalidResponse.type = ErrorTypes.API_RESPONSE_INVALID;
      throw invalidResponse;
    }
  }

  /**
   * Partition an array of normalized texts into URL-budget-safe subgroups.
   * Uses deterministic greedy grouping based on full encoded URL length.
   *
   * INVARIANT: every returned subgroup produces a full URL length ≤ budget.
   * If any single item exceeds the budget alone, TEXT_TOO_LONG is thrown.
   *
   * @param {string[]} normalizedTexts - Preprocessed texts (may include blanks).
   * @param {string} apiPath - Normalized API path.
   * @param {string} sl - Source language code.
   * @param {string} tl - Target language code.
   * @param {number} budget - Full URL character budget.
   * @returns {string[][]}
   * @throws {Error} with type TEXT_TOO_LONG if any single item exceeds budget.
   * @private
   */
  _partitionByBudget(normalizedTexts, apiPath, sl, tl, budget) {
    if (normalizedTexts.length === 0) return [];

    // Enforce single-item invariant: first item must fit alone
    if (this._buildRequestUrl(apiPath, sl, tl, normalizedTexts[0]).length > budget) {
      const error = new Error('Lingva single item exceeds URL budget');
      error.type = ErrorTypes.TEXT_TOO_LONG;
      throw error;
    }

    const delimiter = LingvaProvider.TEXT_DELIMITER;
    const subgroups = [];
    let current = [normalizedTexts[0]];

    for (let i = 1; i < normalizedTexts.length; i++) {
      // Check if appending this item to the current subgroup stays within budget
      const candidate = current.join(delimiter) + delimiter + normalizedTexts[i];
      if (this._buildRequestUrl(apiPath, sl, tl, candidate).length <= budget) {
        current.push(normalizedTexts[i]);
      } else {
        // Finalize current subgroup and start new one
        subgroups.push(current);
        // Enforce invariant: new item must fit alone
        if (this._buildRequestUrl(apiPath, sl, tl, normalizedTexts[i]).length > budget) {
          const error = new Error('Lingva single item exceeds URL budget');
          error.type = ErrorTypes.TEXT_TOO_LONG;
          throw error;
        }
        current = [normalizedTexts[i]];
      }
    }
    subgroups.push(current);
    return subgroups;
  }

  /**
   * Standard _translateChunk implementation.
   * Receives a chunk of texts, partitions into URL-budget-safe subgroups,
   * translates each sequentially, and returns a single delimiter-joined string.
   *
   * Blank logical positions are preserved as empty delimiter-separated segments
   * so downstream positional mapping can reconstruct the original item order.
   *
   * @param {string[]} chunkTexts - Texts in this chunk (may include blanks)
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} segmentCount - Number of segments in this chunk
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @returns {Promise<string>}
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {
    const rawApiPath = await this._getApiPath();
    const apiPath = this._normalizeApiPath(rawApiPath);
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);
    const budget = this._getFullUrlBudget();

    logger.debug(`[Lingva] Translating chunk ${chunkIndex + 1}/${totalChunks} (${segmentCount} segments, attempt ${retryAttempt + 1})`);

    // Normalize text from objects (Subtitle cues, Select Element) to prevent crashes.
    // Preserves blank items to maintain source↔result positional mapping.
    const normalizedTexts = chunkTexts.map(t => {
      const text = getTextInfo(t).text;
      return String(text).replace(/\//g, ' ');
    });

    // originalCharCount: sum of raw source lengths (pre-normalization).
    // Used for stats attribution, not budget decisions.
    const originalCharCount = chunkTexts.reduce((s, t) => s + getTextInfo(t).length, 0);

    // Partition into URL-budget-safe subgroups.
    // _partitionByBudget enforces the single-item invariant internally.
    const subgroups = this._partitionByBudget(normalizedTexts, apiPath, sl, tl, budget);

    // Single subgroup: direct request (fast path)
    if (subgroups.length === 1) {
      const joinedText = normalizedTexts.join(LingvaProvider.TEXT_DELIMITER);
      const url = this._buildRequestUrl(apiPath, sl, tl, joinedText);

      const result = await this._executeLingvaRequest(
        url, 'lingva-standard-chunk', abortController, joinedText.length, originalCharCount, options
      );

      this._validateMappedOutput(result, chunkTexts);

      if (result) {
        logger.info(`[Lingva] Translation completed successfully`);
      }
      return result;
    }

    // Multiple subgroups: sequential execution, atomic result
    logger.debug(`[Lingva] Partitioned ${normalizedTexts.length} items into ${subgroups.length} subgroups`);
    const subgroupResponses = [];

    for (let i = 0; i < subgroups.length; i++) {
      const subgroup = subgroups[i];
      const joinedText = subgroup.join(LingvaProvider.TEXT_DELIMITER);
      const url = this._buildRequestUrl(apiPath, sl, tl, joinedText);
      const subgroupOriginalCharCount = subgroup.reduce((s, t) => s + getTextInfo(t).length, 0);

      const subgroupResult = await this._executeLingvaRequest(
        url,
        `lingva-rebatched-subgroup-${i + 1}/${subgroups.length}`,
        abortController,
        joinedText.length,
        subgroupOriginalCharCount,
        options
      );

      this._validateMappedOutput(subgroupResult, subgroup);
      subgroupResponses.push(subgroupResult);
    }

    if (subgroupResponses.length > 0) {
      logger.info(`[Lingva] Rebatched translation completed (${subgroups.length} subgroups)`);
    }

    return subgroupResponses.join(LingvaProvider.TEXT_DELIMITER);
  }
}

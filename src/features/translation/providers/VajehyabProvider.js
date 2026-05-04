import { BaseProvider } from "./BaseProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { getTranslationString } from "@/utils/i18n/i18n.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'VajehyabProvider');

/**
 * Vajehyab Dictionary Provider
 * A Persian-to-Persian (and more) dictionary service.
 * Specialized: Only supports dictionary lookups for single words.
 */
export class VajehyabProvider extends BaseProvider {
  static type = "translate";
  static displayName = "Vajehyab";
  static reliableJsonMode = true;
  static supportsTranslation = true;
  static supportsDictionary = true;

  constructor() {
    super(ProviderNames.VAJEHYAB);
  }

  /**
   * Internal helper for language mapping.
   * Required by BaseProvider structure.
   */
  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return "fa";
    return getProviderLanguageCode(lang, 'VAJEHYAB');
  }

  /**
   * Maps standard ISO codes to Vajehyab-specific codes.
   * Called by ProviderCoordinator.
   */
  convertLanguage(lang) {
    return this._getLangCode(lang);
  }

  /**
   * Specialized batch translation for Vajehyab.
   * Since this is a dictionary, it only processes the first segment and first word.
   */
  async _batchTranslate(texts, sourceLang, targetLang, mode, engine, messageId, abortController, priority, sessionId) {
    const text = texts[0] || "";
    
    // 1. Take only the first word
    const words = String(text).trim().split(/\s+/);
    const targetWord = words[0] || "";
    
    if (!targetWord) {
      return texts; // Return original array if no word found
    }

    logger.debug(`[Vajehyab] Looking up: "${targetWord}" (${sourceLang} -> ${targetLang})`);

    const url = `https://engine.vajehyab.com/magicword?q=${encodeURIComponent(targetWord)}`;

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions: {
          method: "GET",
          headers: {
            "Accept": "application/json"
          }
        },
        context: 'vajehyab-lookup',
        extractResponse: (data) => data,
        abortController,
        sessionId,
        charCount: targetWord.length,
        originalCharCount: text.length
      });

      if (!result || !result.hit || Object.keys(result.hit).length === 0) {
        logger.debug(`[Vajehyab] Word not found: "${targetWord}"`);
        const notFoundMsg = (await getTranslationString('vajehyab_word_not_found')) || `Word not found in Vajehyab dictionary`;
        return texts.map((t, idx) => idx === 0 ? notFoundMsg : t);
      }

      const finalResult = this._formatDictionaryResponse(result.hit);
      
      // Update last detected language for Coordinator
      this.lastDetectedLanguage = sourceLang === 'auto' ? 'fa' : sourceLang;

      // Return array matching input texts (only first one translated)
      return texts.map((t, idx) => idx === 0 ? finalResult : t);
      
    } catch (error) {
      logger.error(`[Vajehyab] Error during lookup:`, error);
      throw error;
    }
  }

  /**
   * Format the raw API response into a structured Markdown string for the UI.
   * @private
   */
  _formatDictionaryResponse(hit) {
    const title = hit.title || "";
    const kind = hit.kind ? `*${hit.kind}*` : "";
    
    // Decode HTML entities in pronunciation (e.g., &#39; -> ')
    let pronunciation = hit.pronunciation || "";
    if (pronunciation) {
      pronunciation = pronunciation
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      pronunciation = ` [${pronunciation}]`;
    }

    let description = hit.description || "";

    // Mapping slugs to friendly names
    const slugMap = {
      'amid': 'لغت‌نامه عمید',
      'dehkhoda': 'لغت‌نامه دهخدا',
      'moein': 'فرهنگ معین',
      'moaser': 'فرهنگ معاصر',
      'teyfi': 'فرهنگ طیفی',
      'wiki': 'ویکی‌پدیا',
      'motaradef': 'مترادف و متضاد',
      'ganjvajeh': 'گنج‌واژه',
      'sereh': 'فرهنگ سره',
      'quran': 'قرآن',
      'name': 'نام‌ها و اسامی',
      'isfahani': 'لهجه اصفهانی',
      'gonabadi': 'لهجه گنابادی',
      'thesis': 'علمی',
      'brand': 'برندها و شرکت‌ها',
      'dezfuli': 'لهجه دزفولی',
      'tehrani': 'لهجه تهرانی',
      'khalkhal': 'لهجه خلخالی',
      'kermanshah': 'لهجه کرمانشاهی',
      'mazani': 'لهجه مازنی',
      'bakhtiari': 'لهجه بختیاری',
      'fa2en': 'فارسی به انگلیسی',
      'en2fa': 'انگلیسی به فارسی',
      'ar2fa': 'عربی به فارسی',
      'fa2ar': 'فارسی به عربی',
      'fa2tr': 'فارسی به ترکی'
    };
    const sourceName = slugMap[hit.dictionarySlug] || hit.dictionarySlug || "واژه‌یاب";

    // Clean up HTML tags while preserving basic structure
    description = description
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Build the Markdown format response
    let markdown = `### ${title}${pronunciation}\n`;
    if (kind) markdown += `${kind}\n`;
    markdown += `\n---\n\n`;
    markdown += `**معنی (${sourceName}):**\n${description}`;

    return markdown;
  }
}

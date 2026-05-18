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
        const notFoundMsg = (await getTranslationString('vajehyab_word_not_found')) || `(Word not found in Vajehyab dictionary)`;
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

    // kind field may include pronunciation bracket, extract only the kind type
    // e.g., "(صفت) [پهلوی: drust]" -> extract just the kind if it's a simple pattern
    let kind = "";
    if (hit.kind) {
      // If kind contains bracket pronunciation, use it as-is (don't add markdown)
      // If it's a simple word like "صفت", add italic formatting
      if (!hit.kind.includes('[')) {
        kind = `*${hit.kind}*`;
      } else {
        kind = hit.kind;
      }
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

    // Parse Vajehyab description using structured approach
    // Structure: "main definition &lang; label: [params] content &lang; label: [params] = &lang; ..."
    const parsed = this._parseVajehyabDescription(description);
    description = this._formatParsedDescription(parsed);

    // Build the Markdown format response
    let markdown = `### ${title}${pronunciation}\n`;
    if (kind) markdown += `${kind}\n`;
    markdown += `\n---\n\n`;
    markdown += `**معنی (${sourceName})**:\n${description}`;

    return markdown;
  }

  /**
   * Parse Vajehyab description into structured data.
   * Structure: "main definition &lang; label: [params] content &lang; label: [params] = &lang; ..."
   * @param {string} description - Raw description from API
   * @returns {Object} { mainDef: string, wordForms: Array<{label, content}> }
   * @private
   */
  _parseVajehyabDescription(description) {
    // Clean HTML tags and artifacts
    let cleaned = description
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<p>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      // Convert poetry separators to newlines
      .replace(/◻/g, '\n')
      .replace(/︎/g, '\n')
      // Remove zero-width characters
      .replace(/[​-‍⁠﻿]/g, '');

    // Split by &lang; separator
    const sections = cleaned.split('&lang;');

    // First section is the main definition
    const mainDef = sections[0].trim();

    // Parse remaining sections as word forms
    const wordForms = [];
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;

      // Parse "label: content" format
      const colonIndex = section.indexOf(':');
      if (colonIndex === -1) {
        // No colon found, treat entire section as content with empty label
        wordForms.push({ label: '', content: section });
        continue;
      }

      const label = section.slice(0, colonIndex).trim();
      const content = section.slice(colonIndex + 1).trim();

      // Check if content is empty after bracketed params
      // Pattern: "[params] =" or "[params]=" or just "="
      if (/^\[[^\]]+\]\s*=\s*$/.test(content) || /^=\s*$/.test(content)) {
        // Empty content, skip this section
        continue;
      }

      wordForms.push({ label, content });
    }

    return { mainDef, wordForms };
  }

  /**
   * Format parsed description to Markdown.
   * @param {Object} parsed - Result from _parseVajehyabDescription
   * @returns {string} Markdown formatted description
   * @private
   */
  _formatParsedDescription(parsed) {
    const { mainDef, wordForms } = parsed;

    // Start with main definition
    let markdown = mainDef;

    // Add each word form as a section
    for (const form of wordForms) {
      markdown += '\n\n';
      if (form.label) {
        markdown += `**${form.label}**:\n`;
      }
      markdown += form.content;
    }

    // Clean up multiple empty lines
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
  }
}

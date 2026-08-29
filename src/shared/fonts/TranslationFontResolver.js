import { UI_LOCALE_TO_CODE_MAP } from '@/shared/config/languageConstants.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';
import { systemFontDetector } from './SystemFontDetector.js';

const AUTO_FONT_FAMILIES = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
  vazirmatn: '"Vazirmatn", "Vazir", Tahoma, Arial, sans-serif',
  notoSans: '"Noto Sans", "Noto Sans Arabic", "Noto Sans CJK", Arial, sans-serif',
};

export function resolveTranslationFontFamily(configuredFont = 'auto', targetLanguage = '') {
  if (configuredFont !== 'auto') {
    return systemFontDetector.getFontCSSFamily(configuredFont);
  }

  const language = UI_LOCALE_TO_CODE_MAP[targetLanguage] || targetLanguage?.toLowerCase();
  if (language === 'fa' || language === 'farsi' || language === 'persian') {
    return AUTO_FONT_FAMILIES.vazirmatn;
  }
  if (language === 'ar' || language === 'arabic' || LanguageDetectionService.isRTL(language)) {
    return AUTO_FONT_FAMILIES.notoSans;
  }
  return AUTO_FONT_FAMILIES.system;
}

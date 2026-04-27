import { computed, unref } from 'vue';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';

/**
 * Vue Composable for consistent text direction management across UI components.
 * 
 * @param {Ref|string} text - The text content to analyze (reactive or static)
 * @param {Ref|string} langCode - The language code (reactive or static)
 * @returns {Object} { direction, textAlign }
 */
export function useTextDirection(text, langCode) {
  /**
   * Computed direction ('rtl' or 'ltr')
   */
  const direction = computed(() => {
    const t = unref(text);
    const l = unref(langCode);
    return LanguageDetectionService.getDirection(t, l);
  });

  /**
   * Computed text alignment ('right' or 'left')
   */
  const textAlign = computed(() => {
    return direction.value === 'rtl' ? 'right' : 'left';
  });

  /**
   * Computed style object for easy binding :style="textDirectionStyle"
   */
  const textDirectionStyle = computed(() => ({
    direction: direction.value,
    textAlign: textAlign.value
  }));

  return {
    direction,
    textAlign,
    textDirectionStyle
  };
}

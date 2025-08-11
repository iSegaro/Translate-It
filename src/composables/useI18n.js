// src/composables/useI18n.js
// Safe i18n composable with fallback support

import { computed, getCurrentInstance } from "vue";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useI18n');

/**
 * Safe i18n composable that provides fallback when i18n is not ready
 * @returns {Object} i18n functions with fallback support
 */
export function useI18n() {
  const instance = getCurrentInstance();

  /**
   * Safe translation function with fallback
   * @param {string} key - Translation key
   * @param {string} fallback - Fallback text
   * @returns {string} Translated text or fallback
   */
  const t = (key, fallback = key) => {
    try {
      // Try to use Vue instance $t if available
      if (instance?.appContext?.app?.config?.globalProperties?.$t) {
        return (
          instance.appContext.app.config.globalProperties.$t(key) || fallback
        );
      }

      // Try to use global $t if available
      if (typeof window !== "undefined" && window.vue_i18n_global_t) {
        return window.vue_i18n_global_t(key) || fallback;
      }

      // Fallback to original key or provided fallback
      return fallback;
    } catch (error) {
      logger.debug("[useI18n] Translation failed for key:", key, error);
      return fallback;
    }
  };

  /**
   * Check if i18n is ready
   * @returns {boolean} True if i18n is available
   */
  const isI18nReady = computed(() => {
    return !!instance?.appContext?.app?.config?.globalProperties?.$t;
  });

  return {
    t,
    isI18nReady,
  };
}
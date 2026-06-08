import { computed } from 'vue';
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { normalizeAutoTranslateRuleUrl, matchesAutoTranslateRule } from '@/utils/ui/exclusion.js';

/**
 * Composable for page auto-translation rules management.
 * 
 * @param {Object} params
 * @param {import('vue').Ref<string>} params.currentUrl - Reactive ref of the current page URL
 */
export function useAutoTranslateRules({ currentUrl }) {
  const settingsStore = useSettingsStore();
  const { t } = useUnifiedI18n();

  const normalizedPageUrl = computed(() => {
    return normalizeAutoTranslateRuleUrl(currentUrl.value);
  });

  const hasExactAutoTranslateRule = computed(() => {
    const url = normalizedPageUrl.value;
    if (!url) return false;
    const currentRules = settingsStore.settings?.WHOLE_PAGE_AUTO_TRANSLATE_RULES || [];
    return currentRules.includes(url);
  });

  const hasNonExactMatchingAutoTranslateRule = computed(() => {
    const url = currentUrl.value;
    if (!url) return false;
    if (hasExactAutoTranslateRule.value) return false;
    const currentRules = settingsStore.settings?.WHOLE_PAGE_AUTO_TRANSLATE_RULES || [];
    return currentRules.some(rule => matchesAutoTranslateRule(url, rule));
  });

  const isAutoTranslateToggleVisible = computed(() => {
    return !!normalizedPageUrl.value;
  });

  const isAutoTranslateToggleActive = computed(() => {
    return hasExactAutoTranslateRule.value || hasNonExactMatchingAutoTranslateRule.value;
  });

  const isAutoTranslateToggleDisabled = computed(() => {
    return hasNonExactMatchingAutoTranslateRule.value;
  });

  const autoTranslateToggleTitle = computed(() => {
    if (hasExactAutoTranslateRule.value) {
      return t('page_translation_remove_auto_translate_tooltip') || 'Remove from auto-translate rules';
    }
    if (hasNonExactMatchingAutoTranslateRule.value) {
      return t('page_translation_auto_translate_inherited_tooltip') || 'This page is auto-translated by a broader rule. Change it in settings.';
    }
    return t('page_translation_add_auto_translate_tooltip') || 'Add to auto-translate rules';
  });

  const toggleAutoTranslateForCurrentPage = async () => {
    const url = normalizedPageUrl.value;
    if (!url || isAutoTranslateToggleDisabled.value) return;

    const currentRules = [...(settingsStore.settings?.WHOLE_PAGE_AUTO_TRANSLATE_RULES || [])];
    const exactIndex = currentRules.indexOf(url);

    if (exactIndex > -1) {
      currentRules.splice(exactIndex, 1);
    } else {
      currentRules.push(url);
    }

    await settingsStore.updateSettingAndPersist('WHOLE_PAGE_AUTO_TRANSLATE_RULES', currentRules);
  };

  return {
    normalizedPageUrl,
    hasExactAutoTranslateRule,
    hasNonExactMatchingAutoTranslateRule,
    isAutoTranslateToggleVisible,
    isAutoTranslateToggleActive,
    isAutoTranslateToggleDisabled,
    autoTranslateToggleTitle,
    toggleAutoTranslateForCurrentPage
  };
}

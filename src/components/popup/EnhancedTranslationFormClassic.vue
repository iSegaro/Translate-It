<template>
  <UnifiedTranslationInput
    mode="popup"
    :enhanced="true"
    :show-controls="false"
    :show-language-selector="false"
    :show-provider-selector="false"
    :show-input-label="false"
    :show-result-label="false"
    :input-rows="2"
    :auto-translate-on-paste="settingsStore.settings.AUTO_TRANSLATE_ON_PASTE"
    :input-placeholder="t('popup_source_text_placeholder') || 'متن را اینجا وارد کنید...'"
    :result-placeholder="t('TRANSLATION_PLACEHOLDER') || 'نتیجه ترجمه اینجا نمایش داده می‌شود...'"
    :copy-source-title="t('popup_copy_source_title_icon') || 'کپی متن مبدا'"
    :paste-title="t('popup_paste_source_title_icon') || 'چسباندن'"
    :tts-source-title="t('popup_voice_source_title_icon') || 'خواندن متن مبدا'"
    :copy-result-title="t('popup_copy_target_title_icon') || 'کپی نتیجه ترجمه'"
    :tts-result-title="t('popup_voice_target_title_icon') || 'خواندن نتیجه ترجمه'"
    :initial-source-language="currentSourceLanguage"
    :initial-target-language="currentTargetLanguage"
    @can-translate-change="handleCanTranslateChange"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import UnifiedTranslationInput from '@/components/shared/UnifiedTranslationInput.vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'EnhancedTranslationForm')

// Props & Emits
const emit = defineEmits(['can-translate-change'])

// Stores & Composables
const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()

// Computed
const currentSourceLanguage = computed(() => settingsStore.settings.SOURCE_LANGUAGE)
const currentTargetLanguage = computed(() => settingsStore.settings.TARGET_LANGUAGE)

// Event Handlers
const handleCanTranslateChange = (canTranslate) => {
  emit('can-translate-change', canTranslate)
}

</script>

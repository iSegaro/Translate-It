<template>
  <div class="result-container">
    <!-- Translation Display -->
    <TranslationDisplay
      :content="translatedText"
      :language="targetLanguage"
      :is-loading="isLoading"
      :error="error"
      :placeholder="t('SIDEPANEL_RESULT_PLACEHOLDER', 'Translation will appear here...')"
      :copy-title="t('SIDEPANEL_COPY_TARGET_TITLE_ICON', 'Copy Translation')"
      :copy-alt="'Copy'"
      :tts-title="t('SIDEPANEL_VOICE_TARGET_TITLE_ICON', 'Play Translation')"
      :tts-alt="'Play'"
      mode="sidepanel"
      :enable-markdown="true"
      :show-fade-in-animation="true"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/composables/shared/useI18n.js'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

// Props
const props = defineProps({
  result: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  targetLanguage: {
    type: String,
    default: 'English'
  }
})

// Composables
const { t } = useI18n()

// Computed
const translatedText = computed(() => {
  return props.result?.data?.translatedText || ''
})
</script>

<style scoped>
.result-container {
  flex-grow: 1;
  min-height: 0;
  position: relative;
}
</style>
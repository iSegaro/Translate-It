<template>
  <div
    v-if="showFooter"
    class="translation-window-footer"
    :class="theme"
    data-testid="translation-window-footer"
  >
    <div class="ti-footer-labels">
      <span
        v-if="showDetectedLanguage && detectedLanguageLabel"
        class="ti-footer-detected-language-label"
        data-testid="translation-window-footer-detected-language"
      >
        {{ detectedLanguageLabel }}
      </span>

      <span
        v-if="showDetectedLanguage && detectedLanguageLabel && showTargetLanguage && targetLanguageLabel"
        class="ti-footer-language-separator"
        aria-hidden="true"
        data-testid="translation-window-footer-language-separator"
      >
        &gt;
      </span>

      <span
        v-if="showTargetLanguage && targetLanguageLabel"
        class="ti-footer-target-language-label"
        data-testid="translation-window-footer-target-language"
      >
        {{ targetLanguageLabel }}
      </span>
    </div>

    <button
      v-if="showRetry"
      type="button"
      class="ti-footer-action-btn"
      :disabled="retryDisabled"
      :title="retryTitle"
      :aria-label="retryAriaLabel"
      data-testid="translation-window-footer-retry"
      @click.stop="emit('retry')"
      @mousedown.stop
      @touchstart.stop
    >
      <SvgIcon
        :src="retryIcon"
        :size="14"
      />
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SvgIcon from './SvgIcon.vue'
import retryIcon from '@/icons/ui/retry.svg?url'
import './TranslationWindowFooter.scss'

defineOptions({
  name: 'TranslationWindowFooter'
})

const props = defineProps({
  detectedLanguageLabel: {
    type: String,
    default: ''
  },
  showDetectedLanguage: {
    type: Boolean,
    default: true
  },
  targetLanguageLabel: {
    type: String,
    default: ''
  },
  showTargetLanguage: {
    type: Boolean,
    default: true
  },
  showRetry: {
    type: Boolean,
    default: false
  },
  retryDisabled: {
    type: Boolean,
    default: false
  },
  retryTitle: {
    type: String,
    default: ''
  },
  retryAriaLabel: {
    type: String,
    default: ''
  },
  theme: {
    type: String,
    default: 'light',
    validator: (value) => ['light', 'dark'].includes(value)
  }
})

const emit = defineEmits(['retry'])

const showFooter = computed(() => (
  (props.showDetectedLanguage && !!props.detectedLanguageLabel)
  || (props.showTargetLanguage && !!props.targetLanguageLabel)
  || props.showRetry
))
</script>

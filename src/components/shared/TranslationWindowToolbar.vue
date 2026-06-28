<template>
  <div
    class="translation-window-toolbar"
    :class="theme"
  >
    <div class="ti-header-actions">
      <ProviderSelector
        v-if="showProviderSelector && provider"
        :model-value="provider"
        :mode="providerSelectorMode"
        :is-global="providerSelectorIsGlobal"
        :allow-default="providerSelectorAllowDefault"
        :allow-set-default="providerSelectorAllowSetDefault"
        :only-configured="providerSelectorOnlyConfigured"
        :required-feature="providerSelectorRequiredFeature"
        class="ti-window-provider-selector"
        @update:model-value="handleProviderChange"
        @mousedown.stop
        @touchstart.stop
      />

      <button
        v-if="showPinButton"
        type="button"
        class="ti-action-btn"
        :class="{ 'ti-active': isPinned }"
        :title="pinTitle"
        :aria-label="pinTitle"
        @click.stop="emit('toggle-pin')"
        @mousedown.stop
        @touchstart.stop
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M16 9V4l1 0V2H7v2l1 0v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
          />
        </svg>
      </button>

      <button
        v-if="showCopyButton"
        type="button"
        class="ti-action-btn"
        :title="copyTitle"
        :aria-label="copyTitle"
        @click.stop="emit('copy')"
        @mousedown.stop
        @touchstart.stop
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
          />
        </svg>
      </button>

      <TTSButton
        v-if="showTTSButton"
        :text="ttsText"
        :language="ttsLanguage"
        :is-dictionary="isDictionary"
        size="sm"
        variant="secondary"
        class="ti-smart-tts-btn"
        @mousedown.stop
        @touchstart.stop
        @tts-started="forwardTtsStarted"
        @tts-stopped="forwardTtsStopped"
        @tts-error="forwardTtsError"
        @state-changed="forwardTtsStateChanged"
      />

      <button
        v-if="showOriginalButton"
        type="button"
        class="ti-action-btn"
        :class="{ 'ti-original-visible': showOriginal }"
        :title="originalTitle"
        :aria-label="originalTitle"
        @click.stop="emit('toggle-original')"
        @mousedown.stop
        @touchstart.stop
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8zm-2-9.41V12h2.59L15 14.41V16h-4v-1.59L8.59 12H7v-2h3.59L13 7.59V6h4v1.59L14.41 10H12v.59z"
          />
        </svg>
      </button>
    </div>

    <div class="ti-header-close">
      <span
        v-if="targetLanguageLabel"
        class="ti-target-language-label"
      >
        {{ targetLanguageLabel }}
      </span>

      <span
        v-if="detectedLanguageLabel"
        class="ti-detected-language-label"
      >
        {{ detectedLanguageLabel }}
      </span>

      <button
        v-if="showCloseButton"
        type="button"
        class="ti-action-btn"
        :title="closeTitle"
        :aria-label="closeTitle"
        @click.stop="emit('close')"
        @mousedown.stop
        @touchstart.stop
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import './TranslationWindowToolbar.scss';
import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import TTSButton from '@/components/shared/TTSButton.vue';

defineOptions({
  name: 'TranslationWindowToolbar',
});

defineProps({
  provider: { type: String, default: '' },
  theme: { type: String, default: 'light' },
  isPinned: { type: Boolean, default: false },
  showOriginal: { type: Boolean, default: false },
  isDictionary: { type: Boolean, default: false },
  ttsText: { type: String, default: '' },
  ttsLanguage: { type: String, default: '' },
  targetLanguageLabel: { type: String, default: '' },
  detectedLanguageLabel: { type: String, default: '' },
  pinTitle: { type: String, default: '' },
  copyTitle: { type: String, default: '' },
  originalTitle: { type: String, default: '' },
  closeTitle: { type: String, default: '' },
  showProviderSelector: { type: Boolean, default: true },
  showPinButton: { type: Boolean, default: true },
  showCopyButton: { type: Boolean, default: true },
  showTTSButton: { type: Boolean, default: true },
  showOriginalButton: { type: Boolean, default: true },
  showCloseButton: { type: Boolean, default: true },
  providerSelectorMode: {
    type: String,
    default: 'icon-only',
    validator: (value) => ['split', 'button', 'icon-only', 'compact', 'mobile'].includes(value),
  },
  providerSelectorIsGlobal: { type: Boolean, default: false },
  providerSelectorAllowDefault: { type: Boolean, default: false },
  providerSelectorAllowSetDefault: { type: Boolean, default: true },
  providerSelectorOnlyConfigured: { type: Boolean, default: true },
  providerSelectorRequiredFeature: { type: String, default: 'translation' },
});

const emit = defineEmits([
  'close',
  'copy',
  'provider-change',
  'toggle-pin',
  'toggle-original',
  'tts-started',
  'tts-stopped',
  'tts-error',
  'tts-state-changed',
]);

const handleProviderChange = (newProvider) => {
  emit('provider-change', newProvider);
};

const forwardTtsStarted = (...args) => emit('tts-started', ...args);
const forwardTtsStopped = (...args) => emit('tts-stopped', ...args);
const forwardTtsError = (...args) => emit('tts-error', ...args);
const forwardTtsStateChanged = (...args) => emit('tts-state-changed', ...args);
</script>

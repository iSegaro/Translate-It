<!-- PageTranslationButton - Translate/Restore button or text label -->
<template>
  <div
    class="page-translation-controls"
    :class="{ 'text-only': textOnly, 'compact-wrapper': compact }"
  >
    <!-- Progress Bar (shown during translation, only if not textOnly) -->
    <div
      v-if="showProgress && !textOnly"
      class="progress-bar"
      :class="{ compact }"
    >
      <div
        class="progress-fill"
        :style="{ width: `${progress}%` }"
      />
      <span class="progress-text">{{ progressText }}</span>
    </div>

    <!-- State: Not Translated (Show Red dot here if there was a previous error) -->
    <template v-if="!isTranslated && !isTranslating && !isAutoTranslating">
      <a
        v-if="textOnly"
        href="#"
        class="toolbar-link"
        :class="{ disabled: !canTranslate }"
        @click.prevent="handleTranslate"
      >
        <PageTranslationStatus 
          v-if="hasError"
          :status-data="{ hasError: true }"
          mode="compact"
          class="ti-text-status-badge"
        />
        {{ t('page_translation_btn_translate') || 'Translate Page' }}
      </a>
      <BaseButton
        v-else
        :variant="compact ? 'ghost' : 'secondary'"
        :disabled="!canTranslate"
        :title="translateButtonTitle"
        :class="{ 'is-compact-icon': compact }"
        @click="handleTranslate"
      >
        <div class="ti-btn-status-container">
          <PageTranslationStatus 
            v-if="hasError"
            :status-data="{ hasError: true }"
            mode="compact"
            class="ti-btn-status-badge"
          />
          <img
            v-if="compact"
            :src="ExtensionContextManager.safeGetURL('icons/ui/whole-page.png')"
            class="toolbar-icon"
            alt="Translate"
          >
          <Icon
            v-else
            icon="fa6-solid:language"
          />
        </div>
        <span v-if="!compact">{{ translateButtonText }}</span>
      </BaseButton>
    </template>

    <!-- State: Translating or Auto-Translating -->
    <template v-if="isTranslating || isAutoTranslating">
      <div
        v-if="textOnly"
        class="ti-text-status-wrapper"
      >
        <a
          href="#"
          class="toolbar-link loading"
          :class="{ 'is-active': isAutoTranslating }"
          @click.prevent="handleCancelOrStop"
        >
          <PageTranslationStatus 
            :status-data="{ isTranslating, isAutoTranslating, isTranslated, progress }"
            mode="compact"
            class="ti-text-status-badge"
          />
          {{ t('page_translation_btn_stop') || 'Stop Translating' }}
        </a>
      </div>
      <BaseButton
        v-else
        :variant="compact ? 'ghost' : 'primary'"
        :title="cancelButtonTitle"
        :class="{ 'is-compact-icon': compact, 'is-active': isAutoTranslating }"
        @click="handleCancelOrStop"
      >
        <!-- Shared Status Indicator for Popup/Sidepanel -->
        <div class="ti-btn-status-container">
          <LoadingSpinner
            v-if="isTranslating || isAutoTranslating"
            size="sm"
          />
          <PageTranslationStatus 
            :status-data="{ isTranslating, isAutoTranslating, isTranslated, progress }"
            mode="compact"
            class="ti-btn-status-badge"
          />
        </div>

        <img
          v-if="compact && !isTranslating && !isAutoTranslating"
          :src="ExtensionContextManager.safeGetURL('icons/ui/whole-page.png')"
          class="toolbar-icon"
          alt="Stop"
        >
        <Icon
          v-else-if="!compact && !isTranslating && !isAutoTranslating"
          icon="fa6-solid:language"
        />
        <span v-if="!compact">{{ isTranslating ? translatingText : stopTranslatingText }}</span>
      </BaseButton>
    </template>

    <!-- State: Translated -->
    <template v-if="isTranslated && !isTranslating && !isAutoTranslating">
      <div
        v-if="textOnly"
        class="ti-text-status-wrapper"
      >
        <a
          href="#"
          class="toolbar-link"
          :class="{ disabled: !canRestore }"
          @click.prevent="handleRestore"
        >
          <PageTranslationStatus 
            :status-data="{ isTranslated: true, isTranslating: false, isAutoTranslating: false }"
            mode="compact"
            class="ti-text-status-badge"
          />
          {{ t('page_translation_btn_restore') || 'Restore Original' }}
        </a>
      </div>
      <BaseButton
        v-else
        :variant="compact ? 'ghost' : 'secondary'"
        :disabled="!canRestore"
        :title="restoreButtonTitle"
        :class="{ 'is-compact-icon': compact }"
        @click="handleRestore"
      >
        <div class="ti-btn-status-container">
          <PageTranslationStatus 
            :status-data="{ isTranslated: true, isTranslating: false, isAutoTranslating: false }"
            mode="compact"
            class="ti-btn-status-badge"
          />
          <img
            :src="ExtensionContextManager.safeGetURL('icons/ui/restore.png')"
            :class="compact ? 'toolbar-icon' : 'ti-btn__icon'"
            alt="Restore"
          >
        </div>
        <span v-if="!compact">{{ restoreButtonText }}</span>
      </BaseButton>
    </template>

    <!-- Error State Message -->
    <div
      v-if="hasError && !compact && !textOnly"
      class="error-message"
    >
      {{ message }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import BaseButton from '@/components/base/BaseButton.vue';
import LoadingSpinner from '@/components/base/LoadingSpinner.vue';
import { Icon } from '@iconify/vue';
import { usePageTranslation } from '../composables/usePageTranslation.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import PageTranslationStatus from '@/components/shared/PageTranslationStatus.vue';
import ExtensionContextManager from '@/core/extensionContext.js';

const props = defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  textOnly: {
    type: Boolean,
    default: false,
  },
  targetLanguage: {
    type: String,
    default: null
  }
});

const { t } = useUnifiedI18n();

const {
  isTranslating,
  isTranslated,
  isAutoTranslating,
  progress,
  message,
  canTranslate,
  canRestore,
  hasError,
  translatePage,
  restorePage,
  stopAutoTranslation,
  cancelTranslation,
} = usePageTranslation();

// Computed properties
const showProgress = computed(() => isTranslating.value && progress.value > 0);

const progressText = computed(() => {
  if (message.value) return message.value;
  if (progress.value > 0) {
    return `${progress.value}%`;
  }
  return '';
});

const translateButtonText = computed(() => {
  if (props.compact) return t('popup_translate_button_text') || 'Translate';
  return t('page_translation_btn_translate') || 'Translate Page';
});

const translatingText = computed(() => {
  return t('popup_string_during_translate') || 'Translating...';
});

const stopTranslatingText = computed(() => {
  return t('page_translation_btn_stop') || 'Stop Translating';
});

const restoreButtonText = computed(() => {
  return t('page_translation_btn_restore') || 'Restore Original';
});

const translateButtonTitle = computed(() => {
  if (!canTranslate.value) {
    return isTranslating.value || isAutoTranslating.value ? 'Translation in progress...' : 'Translate entire page';
  }
  return 'Translate entire page';
});

const cancelButtonTitle = computed(() => {
  if (isAutoTranslating.value) return 'Stop auto-translation';
  return 'Cancel translation';
});

const restoreButtonTitle = computed(() => {
  if (!canRestore.value) {
    return isTranslating.value || isAutoTranslating.value ? 'Cannot restore during translation' : 'No translation to restore';
  }
  return 'Restore original page content';
});

// Actions
const handleTranslate = () => {
  if (!canTranslate.value) return;
  // Start translation using user's configured settings
  translatePage({ targetLanguage: props.targetLanguage });
};

const handleCancelOrStop = () => {
  if (isAutoTranslating.value) {
    stopAutoTranslation();
  } else if (isTranslating.value) {
    cancelTranslation();
  }
};

const handleRestore = () => {
  if (!canRestore.value) return;
  restorePage();
};
</script>

<script>
// For recursive or named access if needed
export default {
  name: 'PageTranslationButton'
};
</script>

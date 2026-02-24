<!-- PageTranslationButton - Translate/Restore button with progress indicator -->
<template>
  <div class="page-translation-controls">
    <!-- Progress Bar (shown during translation) -->
    <div v-if="showProgress" class="progress-bar" :class="{ compact }">
      <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      <span class="progress-text">{{ progressText }}</span>
    </div>

    <!-- Translate Button -->
    <BaseButton
      v-if="!isTranslated && !isTranslating"
      :variant="compact ? 'secondary' : 'primary'"
      :disabled="!canTranslate"
      :title="translateButtonTitle"
      @click="handleTranslate"
    >
      <Icon icon="fa6-solid:language" />
      <span v-if="!compact">{{ translateButtonText }}</span>
    </BaseButton>

    <!-- Translating State (with Cancel) -->
    <BaseButton
      v-if="isTranslating"
      variant="secondary"
      :title="cancelButtonTitle"
      @click="handleCancel"
    >
      <LoadingSpinner v-if="compact" size="sm" />
      <span v-else>{{ translatingText }}</span>
    </BaseButton>

    <!-- Restore Button -->
    <BaseButton
      v-if="isTranslated && !isTranslating"
      variant="secondary"
      :disabled="!canRestore"
      :title="restoreButtonTitle"
      @click="handleRestore"
    >
      <Icon icon="fa6-solid:rotate-left" />
      <span v-if="!compact">{{ restoreButtonText }}</span>
    </BaseButton>

    <!-- Error State -->
    <div v-if="hasError && !compact" class="error-message">
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

const props = defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
});

const {
  isTranslating,
  isTranslated,
  progress,
  message,
  canTranslate,
  canRestore,
  canCancel,
  hasError,
  translatePage,
  restorePage,
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
  if (props.compact) return 'Translate';
  return 'Translate Page';
});

const translatingText = computed(() => {
  if (props.compact) return 'Translating...';
  return 'Translating...';
});

const restoreButtonText = computed(() => {
  if (props.compact) return 'Restore';
  return 'Restore Original';
});

const translateButtonTitle = computed(() => {
  if (!canTranslate.value) {
    return isTranslating.value ? 'Translation in progress...' : 'Translate entire page';
  }
  return 'Translate entire page';
});

const cancelButtonTitle = computed(() => {
  return 'Cancel translation';
});

const restoreButtonTitle = computed(() => {
  if (!canRestore.value) {
    return isTranslating.value ? 'Cannot restore during translation' : 'No translation to restore';
  }
  return 'Restore original page content';
});

// Actions
const handleTranslate = () => {
  translatePage();
};

const handleCancel = () => {
  cancelTranslation();
};

const handleRestore = () => {
  restorePage();
};
</script>

<style scoped>
.page-translation-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.progress-bar {
  position: relative;
  flex: 1;
  min-width: 100px;
  height: 24px;
  background: var(--color-bg-subtle, #f0f0f0);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar.compact {
  max-width: 200px;
  height: 20px;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary, #4a90d9);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-inverted, #ffffff);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.error-message {
  color: var(--color-error, #e74c3c);
  font-size: 12px;
  padding: 4px 8px;
  background: var(--color-error-bg, #fee);
  border-radius: 4px;
}
</style>

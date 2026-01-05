<template>
  <div class="api-key-section">
    <div class="setting-group">
      <div class="label-with-toggle">
        <label>{{ label }}</label>
        <button
          type="button"
          class="toggle-visibility-button"
          @click="togglePasswordVisibility"
          :title="passwordVisible ? 'Hide' : 'Show'"
        >
          <img
            v-if="!passwordVisible"
            :src="eyeIcon"
            alt="Show"
            class="toggle-icon"
            width="16"
            height="16"
          >
          <img
            v-else
            :src="eyeHideIcon"
            alt="Hide"
            class="toggle-icon"
            width="16"
            height="16"
          >
        </button>
      </div>
      <div class="api-key-input-wrapper">
        <BaseTextarea
          ref="textareaRef"
          :model-value="modelValue"
          @update:model-value="$emit('update:modelValue', $event)"
          :placeholder="placeholder"
          :rows="rows"
          class="api-key-textarea"
          :password-mask="true"
          :hide-toggle="true"
        />
        <div class="button-result-row">
          <div v-if="testResult" class="test-result" :class="testResult.allInvalid ? 'error' : 'success'">
            {{ testResult.message }}
          </div>
          <button
            @click="handleTestKeys"
            :disabled="testing || !hasKeys"
            class="test-keys-button"
            :class="{ 'testing-keys': testing }"
          >
            {{ testing ? t('api_test_testing') : t('api_test_button') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import eyeIcon from '@/icons/ui/eye-open.svg?url'
import eyeHideIcon from '@/icons/ui/eye-hide.svg?url'

const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: 'API Keys'
  },
  placeholder: {
    type: String,
    default: 'Enter your API keys (one per line)'
  },
  rows: {
    type: Number,
    default: 3
  },
  providerName: {
    type: String,
    required: true
  },
  testing: {
    type: Boolean,
    default: false
  },
  testResult: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'test'])

const textareaRef = ref(null)
const passwordVisible = ref(false)

const hasKeys = computed(() => {
  return props.modelValue?.trim().length > 0
})

const togglePasswordVisibility = () => {
  if (textareaRef.value) {
    textareaRef.value.toggleVisibility()
    passwordVisible.value = textareaRef.value.visibilityVisible
  }
}

const handleTestKeys = () => {
  emit('test', props.providerName)
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.api-key-section {
  width: 100%;
  margin-bottom: $spacing-lg;
}

.setting-group {
  margin-bottom: $spacing-lg;

  &:last-child {
    margin-bottom: 0;
  }
}

.label-with-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-sm;
  gap: $spacing-sm;

  label {
    margin-bottom: 0;
    flex: 1;
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
  }

  .toggle-visibility-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity var(--transition-base, 0.2s);
    flex-shrink: 0;

    &:hover {
      opacity: 1;
    }

    .toggle-icon {
      display: block;
      pointer-events: none;
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
  }
}

.api-key-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .api-key-textarea {
    width: 100%;
  }

  .button-result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .test-keys-button {
    margin-inline-start: auto;
    padding: 8px 16px;
    background-color: var(--color-primary, #1976d2);
    color: white;
    border: none;
    border-radius: var(--border-radius-base, 4px);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-base, 0.2s);

    &:hover:not(:disabled) {
      background-color: var(--color-primary-dark, #1565c0);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &.testing-keys {
      opacity: 0.8;
      cursor: wait;
    }
  }

  .test-result {
    padding: 8px 12px;
    border-radius: var(--border-radius-base, 4px);
    font-size: 14px;

    &.success {
      background-color: var(--color-success-bg, #e8f5e9);
      color: var(--color-success-text, #2e7d32);
    }

    &.error {
      background-color: var(--color-error-bg, #ffebee);
      color: var(--color-error-text, #c62828);
    }
  }
}
</style>

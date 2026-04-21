<template>
  <div class="api-key-section">
    <div class="setting-group vertical">
      <div class="label-with-toggle">
        <label>{{ label }}</label>
        <button
          type="button"
          class="toggle-visibility-button"
          :title="passwordVisible ? t('api_key_hide') : t('api_key_show')"
          @click="togglePasswordVisibility"
        >
          <img
            v-if="!passwordVisible"
            :src="eyeIcon"
            :alt="t('api_key_show')"
            class="toggle-icon"
            width="16"
            height="16"
          >
          <img
            v-else
            :src="eyeHideIcon"
            :alt="t('api_key_hide')"
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
          :placeholder="placeholder"
          :rows="rows"
          class="api-key-textarea"
          :password-mask="true"
          :hide-toggle="true"
          dir="ltr"
          @update:model-value="$emit('update:modelValue', $event)"
        />
        <div class="api-key-tips">
          {{ t('api_key_tips') }}
        </div>
        <div class="button-result-row">
          <div
            v-if="translatedTestResult"
            class="test-result"
            :class="testResult.allInvalid ? 'error' : 'success'"
          >
            {{ translatedTestResult }}
          </div>
          <button
            :disabled="testing || !hasKeys"
            class="test-keys-button"
            :class="{ 'testing-keys': testing }"
            @click="handleTestKeys"
          >
            {{ testing ? t('api_test_testing') : t('api_test_button') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import "./ApiKeyInput.scss"
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

const translatedTestResult = computed(() => {
  if (!props.testResult?.messageKey) return null

  const { messageKey, params } = props.testResult
  return params ? t(messageKey, params) : t(messageKey)
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

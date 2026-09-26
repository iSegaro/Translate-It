<template>
  <section
    class="live-dubbing-card live-dubbing-setup-card"
    :aria-label="`${providerName} — ${t('custom_api_settings_api_key_label', 'API Key')}`"
  >
    <p
      class="live-dubbing-setup-source"
      dir="auto"
    >
      {{ infoText }}
      <a
        class="live-dubbing-setup-link"
        :href="keyUrl"
        target="_blank"
        rel="noopener noreferrer"
      >{{ linkText }}</a>
    </p>

    <!-- Field, guidance/Save row, then always-mounted feedback in normal flow. -->
    <div class="live-dubbing-setup-row">
      <div class="live-dubbing-setup-input-field">
        <div class="live-dubbing-setup-input-control">
          <BaseTextarea
            id="live-dubbing-key-input"
            ref="keyInput"
            v-model="draft"
            class="live-dubbing-setup-input"
            password-mask
            hide-toggle
            :rows="3"
            resize="none"
            dir="ltr"
            :aria-label="t('custom_api_settings_api_key_label', 'API Key')"
            :aria-describedby="errorMessage ? 'live-dubbing-key-guidance live-dubbing-key-error' : 'live-dubbing-key-guidance'"
            :aria-invalid="Boolean(errorMessage)"
            :placeholder="t(placeholderKey, 'Paste your API key here')"
            :disabled="saving"
          />
          <button
            type="button"
            class="live-dubbing-setup-toggle"
            :title="revealed ? t('api_key_hide', 'Hide') : t('api_key_show', 'Show')"
            :aria-label="revealed ? t('api_key_hide', 'Hide') : t('api_key_show', 'Show')"
            :aria-pressed="revealed"
            :disabled="saving"
            @click="toggleReveal"
          >
            <img
              :src="revealed ? eyeHideIcon : eyeIcon"
              alt=""
              aria-hidden="true"
              width="16"
              height="16"
            >
          </button>
        </div>
      </div>
      <div class="live-dubbing-setup-controls-row">
        <p
          id="live-dubbing-key-guidance"
          class="live-dubbing-setup-guidance"
          dir="auto"
        >
          {{ t('live_dubbing_setup_key_guidance', 'One API key per line') }}
        </p>
        <BaseButton
          class="live-dubbing-setup-save"
          size="sm"
          variant="primary"
          :loading="saving"
          :disabled="saving"
          :text="t('live_dubbing_setup_save', 'Save')"
          @click="save"
        />
      </div>
      <!-- Feedback follows the guidance/Save row in normal flow. -->
      <p
        class="live-dubbing-setup-feedback"
        dir="auto"
        role="alert"
      >
        <span id="live-dubbing-key-error">{{ errorMessage }}</span>
      </p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import eyeIcon from '@/icons/ui/eye-open.svg?url'
import eyeHideIcon from '@/icons/ui/eye-hide.svg?url'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_PROVIDER_IDS
} from '@/features/live-dubbing/constants.js'

// Card styles live in LiveDubbingView.scss — this component is view-scoped.

const props = defineProps({
  providerId: {
    type: String,
    default: LIVE_DUBBING_PROVIDER_ID,
    validator: (value) => LIVE_DUBBING_PROVIDER_IDS.includes(value)
  },
  targetLanguage: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['save-pending', 'saved'])

const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { sendMessage } = useMessaging(MessageContexts.POPUP)

const isOpenAI = computed(() => props.providerId === LIVE_DUBBING_OPENAI_PROVIDER_ID)

const providerName = computed(() => (isOpenAI.value
  ? t('provider_openai_title', 'OpenAI GPT')
  : t('provider_gemini_title', 'Google Gemini')))

/** Localized explanation that names the selected provider. */
const infoText = computed(() => (isOpenAI.value
  ? t('openai_api_key_info', 'You can get your OpenAI API key from OpenAI Platform.')
  : t('gemini_api_key_info', 'You can get your Gemini API key from Google AI Studio.')))
const linkText = computed(() => (isOpenAI.value
  ? t('openai_api_key_link', 'Get Your API Key')
  : t('gemini_api_key_link', 'Get Your Free API Key')))
const placeholderKey = computed(() => (isOpenAI.value
  ? 'openai_api_key_placeholder'
  : 'gemini_api_key_placeholder'))
const keyUrl = computed(() => (isOpenAI.value
  ? 'https://platform.openai.com/api-keys'
  : 'https://aistudio.google.com/app/apikey'))
const storageKey = computed(() => (isOpenAI.value ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'))

const draft = ref('')
const revealed = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const keyInput = ref(null)

const toggleReveal = () => {
  if (saving.value) return
  keyInput.value?.toggleVisibility()
  revealed.value = !revealed.value
}

const validationErrorKey = (reason) => {
  if (reason === 'AUTH_INVALID' || reason === 'FORBIDDEN') return 'live_dubbing_validation_auth_error'
  if (['QUOTA_EXCEEDED', 'RATE_LIMITED', 'INSUFFICIENT_BALANCE'].includes(reason)) {
    return 'live_dubbing_validation_quota_error'
  }
  if (['NETWORK_ERROR', 'SERVER_ERROR', 'INVALID_RESPONSE', 'REQUEST_FAILED'].includes(reason)) {
    return 'live_dubbing_validation_unavailable_error'
  }
  return 'live_dubbing_validation_configuration_error'
}

/**
 * Validate and persist the trimmed key list under the provider's own storage key.
 * updateSettingAndPersist() mutates reactive local state BEFORE storage
 * persistence resolves, so the parent is told a save is pending first (it
 * keeps this card mounted) and the previous value is snapshotted for a
  * local restore on a reported write failure. The draft stays in the field on
  * failure; raw errors are never rendered or logged — only a fixed localized
  * message is shown, so the secret cannot leak through feedback.
 */
const save = async () => {
  if (saving.value) return
  errorMessage.value = ''
  const keys = [...new Set(draft.value.split('\n').map((key) => key.trim()).filter(Boolean))]
  if (!keys.length) {
    errorMessage.value = t('validation_api_key_empty', { provider: providerName.value })
      || `API key for ${providerName.value} cannot be empty.`
    return
  }
  if (keys.length > 10) {
    errorMessage.value = t('live_dubbing_setup_too_many_keys', 'Enter no more than 10 unique API keys.')
    return
  }
  const snapshot = Object.freeze({
    providerId: props.providerId,
    targetLanguage: props.targetLanguage,
    keys: Object.freeze(keys),
    storageKey: storageKey.value,
    previous: settingsStore.settings?.[storageKey.value] ?? ''
  })
  saving.value = true
  emit('save-pending', true)
  try {
    let nextIndex = 0
    let failure = null
    const validateNext = async () => {
      while (!failure && nextIndex < snapshot.keys.length) {
        const index = nextIndex++
        try {
          const response = await sendMessage({
            action: LIVE_DUBBING_ACTIONS.VALIDATE_CREDENTIAL,
            data: { providerId: snapshot.providerId, apiKey: snapshot.keys[index], targetLanguage: snapshot.targetLanguage }
          })
          if (!(response?.ok === true && response?.valid === true && response?.reason === 'VALID')) {
            failure = !failure || index < failure.index
              ? { index, reason: response?.reason }
              : failure
          }
        } catch {
          failure = !failure || index < failure.index
            ? { index, reason: 'REQUEST_FAILED' }
            : failure
        }
      }
    }
    await Promise.all([validateNext(), validateNext()])
    if (failure) {
      const reason = t(validationErrorKey(failure.reason), 'This key could not be validated. Check it and try again.')
      errorMessage.value = t('live_dubbing_setup_key_failed', { position: failure.index + 1, reason })
      return
    }

    await settingsStore.updateSettingAndPersist(snapshot.storageKey, snapshot.keys.join('\n'))
    // Success: the parent hides this card and freshens the session control.
    draft.value = ''
    if (revealed.value) {
      keyInput.value?.toggleVisibility()
      revealed.value = false
    }
    emit('saved')
  } catch {
    // Restore the pre-save reactive value after a reported write failure;
    // this does not guarantee rollback of an already-completed storage write.
    settingsStore.updateSettingLocally(snapshot.storageKey, snapshot.previous)
    errorMessage.value = t('live_dubbing_setup_save_error', "Your API key couldn't be saved. Please try again.")
  } finally {
    saving.value = false
    emit('save-pending', false)
  }
}
</script>

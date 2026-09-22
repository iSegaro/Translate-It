<template>
  <section
    class="live-dubbing-card live-dubbing-setup-card"
    :aria-label="`${providerName} — ${t('custom_api_settings_api_key_label', 'API Key')}`"
  >
    <p
      class="live-dubbing-setup-explanation"
      dir="auto"
    >
      {{ explanation }}
    </p>
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

    <div class="live-dubbing-setup-row">
      <BaseInput
        v-model="draft"
        class="live-dubbing-setup-input"
        :type="revealed ? 'text' : 'password'"
        dir="ltr"
        :label="t('custom_api_settings_api_key_label', 'API Key')"
        :placeholder="t(placeholderKey, 'Paste your API key here')"
        :error="errorMessage"
        :disabled="saving"
      />
      <BaseButton
        size="xs"
        variant="ghost"
        :text="revealed ? t('api_key_hide', 'Hide') : t('api_key_show', 'Show')"
        @click="revealed = !revealed"
      />
      <BaseButton
        class="live-dubbing-setup-save"
        size="sm"
        :loading="saving"
        :text="t('live_dubbing_setup_save', 'Save')"
        @click="save"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import {
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
  }
})

const emit = defineEmits(['save-pending', 'saved'])

const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()

const isOpenAI = computed(() => props.providerId === LIVE_DUBBING_OPENAI_PROVIDER_ID)

const providerName = computed(() => (isOpenAI.value
  ? t('provider_openai_title', 'OpenAI GPT')
  : t('provider_gemini_title', 'Google Gemini')))

/** Localized explanation that names the selected provider. */
const explanation = computed(() => t(
  'provider_config_required_api',
  { provider: providerName.value }
) || `This service (${providerName.value}) requires an API Key.`)

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

/**
 * Persist the typed key immediately under the provider's own storage key.
 * updateSettingAndPersist() mutates reactive local state BEFORE storage
 * persistence resolves, so the parent is told a save is pending first (it
 * keeps this card mounted) and the previous value is snapshotted for a
 * transactional restore on failure. The draft stays in the masked input on
 * failure; raw errors are never rendered or logged — only a fixed localized
 * message is shown, so the secret cannot leak through feedback.
 */
const save = async () => {
  if (saving.value) return
  errorMessage.value = ''
  if (!draft.value.trim()) {
    errorMessage.value = t('validation_api_key_empty', { provider: providerName.value })
      || `API key for ${providerName.value} cannot be empty.`
    return
  }
  const key = storageKey.value
  const previous = settingsStore.settings?.[key] ?? ''
  saving.value = true
  emit('save-pending', true)
  try {
    await settingsStore.updateSettingAndPersist(key, draft.value)
    // Success: the parent hides this card and freshens the session control.
    draft.value = ''
    revealed.value = false
    emit('saved')
  } catch {
    // Restore the pre-save store value so storage stays the source of truth
    // and the card (which never unmounted) keeps showing the draft + error.
    settingsStore.updateSettingLocally(key, previous)
    errorMessage.value = t('live_dubbing_setup_save_error', "Your API key couldn't be saved. Please try again.")
  } finally {
    saving.value = false
    emit('save-pending', false)
  }
}
</script>

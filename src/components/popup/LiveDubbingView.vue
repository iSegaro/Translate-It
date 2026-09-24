<template>
  <div
    class="live-dubbing-view"
    :class="{ 'live-dubbing-view--rtl': isRtlLocale }"
  >
    <!-- Configuration: target language + provider for upcoming sessions -->
    <section
      class="live-dubbing-card live-dubbing-config-card"
      :aria-label="t('live_dubbing_config_label', 'Configuration')"
    >
      <div class="live-dubbing-config-grid">
        <div class="live-dubbing-config-field live-dubbing-config-field--language">
          <span class="live-dubbing-config-label">{{ t('target_language_label', 'Target Language') }}</span>
          <LanguageSelector
            v-model:target-language="targetLanguageModel"
            :provider="providerModel"
            :enable-select-element-integration="false"
            :target-only="true"
            :disabled="isControlBusy"
          />
        </div>
        <div class="live-dubbing-config-field live-dubbing-config-field--provider">
          <label
            class="live-dubbing-config-label"
            for="live-dubbing-provider-select"
          >
            {{ t('provider_label', 'Provider') }}
          </label>
          <BaseSelect
            id="live-dubbing-provider-select"
            v-model="providerModel"
            :options="providerOptions"
            :disabled="isControlBusy || isSetupSaving"
            :title="t('live_dubbing_provider_description', 'Used for new live dubbing sessions.')"
          />
        </div>
      </div>
    </section>

    <section
      class="live-dubbing-card live-dubbing-transcript-preferences"
      :aria-label="t('live_dubbing_transcript_preferences_label', 'Subtitles')"
    >
      <h3 class="live-dubbing-card-title">
        {{ t('live_dubbing_transcript_preferences_label', 'Subtitles') }}
      </h3>
      <div class="live-dubbing-transcript-preferences-list">
        <div class="live-dubbing-transcript-preference">
          <span class="live-dubbing-transcript-preference-label">
            {{ t('live_dubbing_show_translated_transcript', 'Translated subtitles') }}
          </span>
          <BaseToggle
            class="live-dubbing-transcript-preference-toggle"
            :model-value="showTranslatedTranscript"
            :disabled="hasTranslatedPreferenceWritePending"
            :title="t('live_dubbing_show_translated_transcript', 'Translated subtitles')"
            @update:model-value="updateTranscriptPreference('LIVE_DUBBING_SHOW_TRANSLATED_TRANSCRIPT', $event)"
          />
        </div>
        <div class="live-dubbing-transcript-preference">
          <span class="live-dubbing-transcript-preference-label">
            {{ t('live_dubbing_show_original_transcript', 'Original subtitles') }}
          </span>
          <BaseToggle
            class="live-dubbing-transcript-preference-toggle"
            :model-value="showOriginalTranscript"
            :disabled="hasOriginalPreferenceWritePending || (providerModel === LIVE_DUBBING_OPENAI_PROVIDER_ID && (!isControlStatusResolved || isControlBusy))"
            :title="t('live_dubbing_show_original_transcript', 'Original subtitles')"
            @update:model-value="updateTranscriptPreference('LIVE_DUBBING_SHOW_ORIGINAL_TRANSCRIPT', $event)"
          />
        </div>
      </div>
    </section>

    <!-- Credential setup: rendered only while the selected provider has no key -->
    <!-- :key remount clears stale draft/errors on provider switch; the select is
         disabled while the control is busy, so remounts only happen while idle. -->
    <LiveDubbingProviderSetup
      v-if="needsSetup"
      :key="providerModel"
      :provider-id="providerModel"
      @save-pending="isSetupSaving = $event"
      @saved="handleSetupSaved"
    />

    <!-- Session: start/stop, status feedback and volumes (owned by the control) -->
    <section
      v-show="showSessionControl"
      class="live-dubbing-card live-dubbing-session-card"
    >
      <LiveDubbingControl
        v-if="isControlBusy || (!hasTranslatedPreferenceWritePending && !hasOriginalPreferenceWritePending)"
        :key="controlKey"
        :target-language="targetLanguage"
        :provider-id="providerModel"
        @busy-change="handleBusyChange"
        @status-resolved="handleControlStatusResolved"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import LiveDubbingControl from '@/components/popup/LiveDubbingControl.vue'
import LiveDubbingProviderSetup from '@/components/popup/LiveDubbingProviderSetup.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseToggle from '@/components/base/BaseToggle.vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import {
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_PROVIDER_IDS
} from '@/features/live-dubbing/constants.js'

// Import adjacent SCSS
import './LiveDubbingView.scss'

const props = defineProps({
  targetLanguage: {
    type: String,
    default: 'en'
  },
  providerId: {
    type: String,
    default: LIVE_DUBBING_PROVIDER_ID
  }
})

const emit = defineEmits(['busy-change', 'update:targetLanguage'])

const { t, locale } = useUnifiedI18n()
const settingsStore = useSettingsStore()

const isRtlLocale = computed(() => /^fa(?:-|$)/i.test(locale.value || ''))

/** Mirrors LiveDubbingControl's busy state so the config card can lock while a session is active. */
const isControlBusy = ref(false)
const isControlStatusResolved = ref(false)

const showTranslatedTranscript = computed(() =>
  settingsStore.settings?.LIVE_DUBBING_SHOW_TRANSLATED_TRANSCRIPT === true
)
const showOriginalTranscript = computed(() =>
  settingsStore.settings?.LIVE_DUBBING_SHOW_ORIGINAL_TRANSCRIPT === true
)
const hasTranslatedPreferenceWritePending = ref(false)
const hasOriginalPreferenceWritePending = ref(false)

/** Persist one transcript preference and restore its prior value on failure. */
const updateTranscriptPreference = async (key, value) => {
  const pending = key === 'LIVE_DUBBING_SHOW_TRANSLATED_TRANSCRIPT'
    ? hasTranslatedPreferenceWritePending
    : hasOriginalPreferenceWritePending

  if (pending.value) return

  const previousValue = settingsStore.getSetting(key, false) === true
  pending.value = true
  try {
    await settingsStore.updateSettingAndPersist(key, value)
  } catch {
    // Restore local state without starting another persistence write.
    settingsStore.updateSettingLocally(key, previousValue)
  } finally {
    pending.value = false
  }
}

const targetLanguageModel = computed({
  get: () => props.targetLanguage,
  set: (value) => emit('update:targetLanguage', value)
})

/**
 * Normalized provider selection. Reads the parent-owned prop and persists
 * changes immediately under LIVE_DUBBING_PROVIDER only — TRANSLATION_API is
 * a separate concern and is never touched here.
 */
const providerModel = computed({
  get: () => (LIVE_DUBBING_PROVIDER_IDS.includes(props.providerId)
    ? props.providerId
    : LIVE_DUBBING_PROVIDER_ID),
  set: (value) => {
    if (!LIVE_DUBBING_PROVIDER_IDS.includes(value)) return
    // Local store state is applied synchronously; if the storage write fails
    // the selection still sticks for this session and retries on next save.
    settingsStore.updateSettingAndPersist('LIVE_DUBBING_PROVIDER', value)
      .catch(() => { /* selection already applied locally */ })
  }
})

const providerOptions = computed(() => [
  { value: LIVE_DUBBING_PROVIDER_ID, label: t('provider_gemini_title', 'Google Gemini') },
  { value: LIVE_DUBBING_OPENAI_PROVIDER_ID, label: t('provider_openai_title', 'OpenAI GPT') }
])

/**
 * "Configured" = at least one non-empty trimmed line, matching
 * ApiKeyManager.parseKeys semantics. Gemini also honors the legacy single-key
 * API_KEY store as configured (the bootstrap service falls back to it).
 * @param {unknown} value - raw stored credential value
 * @returns {boolean} true when the value holds usable key material
 */
const hasKeyMaterial = (value) => typeof value === 'string'
  && value.split('\n').some((line) => line.trim().length > 0)

/** True while the credential setup card has an in-flight save. */
const isSetupSaving = ref(false)

/**
 * Identity key for LiveDubbingControl. It follows the provider ONLY while
 * idle, so an idle Gemini↔OpenAI switch remounts to fresh presentation state
 * while a busy control is never remounted mid-session. setupEpoch forces a
 * fresh control after successful credential setup (also idle-guarded).
 */
const setupEpoch = ref(0)
const controlKey = ref(`${providerModel.value}:${setupEpoch.value}`)
watch([providerModel, setupEpoch, isControlBusy], ([provider, epoch, busy]) => {
  if (!busy) controlKey.value = `${provider}:${epoch}`
})
watch(controlKey, () => {
  isControlStatusResolved.value = false
})

const needsSetup = computed(() => {
  // A pending save keeps the card mounted even though the store mutates first.
  if (isSetupSaving.value) return true
  const settings = settingsStore.settings || {}
  if (providerModel.value === LIVE_DUBBING_OPENAI_PROVIDER_ID) {
    return !hasKeyMaterial(settings.OPENAI_API_KEY)
  }
  return !hasKeyMaterial(settings.GEMINI_API_KEY) && !hasKeyMaterial(settings.API_KEY)
})

/** Keep an active session visible even if its credentials disappear externally. */
const showSessionControl = computed(() => isControlBusy.value || !needsSetup.value)

/** Track control busy state locally, then keep the parent in sync unchanged. */
const handleBusyChange = (busy) => {
  isControlBusy.value = busy
  emit('busy-change', busy)
}

const handleControlStatusResolved = () => {
  isControlStatusResolved.value = true
}

/**
 * A successful first-time credential setup leaves a fresh control behind so
 * stale bootstrap/setup error presentation cannot block the session. Never
 * remounts while busy — the epoch only takes effect through controlKey.
 */
const handleSetupSaved = () => {
  if (!isControlBusy.value) setupEpoch.value += 1
}
</script>

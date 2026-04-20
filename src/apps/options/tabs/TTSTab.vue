<template>
  <div class="tab-content tts-tab">
    <div class="tab-header">
      <h2>{{ t('tts_tab_title') || 'Text-to-Speech' }}</h2>
      <p>{{ t('tts_tab_desc') || 'Configure voice settings and pronunciation engines.' }}</p>
    </div>

    <!-- Engine Selection -->
    <div class="setting-group">
      <div class="setting-item">
        <label for="tts-engine-select">{{ t('tts_engine_label') || 'TTS Engine' }}</label>
        <div class="setting-control select-wrapper">
          <select
            id="tts-engine-select"
            v-model="ttsEngine"
            class="theme-select"
            @change="updateSettingLocally('TTS_ENGINE', $event.target.value)"
          >
            <option :value="TTS_ENGINES.GOOGLE">
              {{ t('tts_engine_google') || 'Google TTS (Standard)' }}
            </option>
            <option :value="TTS_ENGINES.EDGE">
              {{ t('tts_engine_edge') || 'Microsoft Edge TTS (Neural)' }}
            </option>
          </select>
        </div>
      </div>
      <div class="setting-description">
        {{ t('tts_engine_desc') || 'Choose the default engine for text pronunciation. Edge TTS provides higher quality neural voices.' }}
      </div>
    </div>

    <hr class="section-divider">

    <!-- Fallback Toggle -->
    <div class="setting-group">
      <div class="setting-item">
        <label for="tts-fallback-toggle">
          {{ t('tts_fallback_label') || 'Enable Language Fallback' }}
        </label>
        <div class="setting-control toggle-wrapper">
          <input
            id="tts-fallback-toggle"
            type="checkbox"
            :checked="ttsFallbackEnabled"
            class="toggle-input"
            @change="updateSettingLocally('TTS_FALLBACK_ENABLED', $event.target.checked)"
          >
          <label
            for="tts-fallback-toggle"
            class="toggle-label"
          />
        </div>
      </div>
      <div class="setting-description">
        {{ t('tts_fallback_desc') || 'Automatically switch to a similar language (e.g., Arabic for Persian) if the selected TTS engine does not support the original language natively.' }}
      </div>
    </div>

    <hr class="section-divider">

    <!-- Auto Detect Toggle -->
    <div class="setting-group">
      <div class="setting-item">
        <label for="tts-autodetect-toggle">
          {{ t('tts_autodetect_label') || 'Smart Language Detection' }}
        </label>
        <div class="setting-control toggle-wrapper">
          <input
            id="tts-autodetect-toggle"
            type="checkbox"
            :checked="ttsAutoDetectEnabled"
            class="toggle-input"
            @change="updateSettingLocally('TTS_AUTO_DETECT_ENABLED', $event.target.checked)"
          >
          <label
            for="tts-autodetect-toggle"
            class="toggle-label"
          />
        </div>
      </div>
      <div class="setting-description">
        {{ t('tts_autodetect_desc') || 'Automatically detect the actual language of the text. If the selected engine fails to pronounce the text, it will attempt to identify the correct language and try again.' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { TTS_ENGINES } from '@/shared/config/constants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSTab')

const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()

const ttsEngine = computed({
  get: () => settingsStore.settings.TTS_ENGINE || TTS_ENGINES.GOOGLE,
  set: (value) => updateSettingLocally('TTS_ENGINE', value)
})

const ttsFallbackEnabled = computed({
  get: () => settingsStore.settings.TTS_FALLBACK_ENABLED ?? true,
  set: (value) => updateSettingLocally('TTS_FALLBACK_ENABLED', value)
})

const ttsAutoDetectEnabled = computed({
  get: () => settingsStore.settings.TTS_AUTO_DETECT_ENABLED ?? true,
  set: (value) => updateSettingLocally('TTS_AUTO_DETECT_ENABLED', value)
})

const updateSettingLocally = (key, value) => {
  logger.debug(`Updating ${key} locally to:`, value)
  settingsStore.updateSettingLocally(key, value)
}
</script>
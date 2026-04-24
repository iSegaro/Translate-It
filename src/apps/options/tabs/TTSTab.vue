<template>
  <section class="options-tab-content tts-tab">
    <div class="settings-container">
      <div class="tab-header">
        <h2>{{ t('tts_tab_title') || 'Text-to-Speech' }}</h2>
        <p>{{ t('tts_tab_desc') || 'Configure voice settings and pronunciation engines.' }}</p>
      </div>

      <!-- Engine Selection -->
      <div 
        id="TTS_ENGINE_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('tts_engine_label') || 'TTS Engine' }}</label>
            <p class="setting-description">
              {{ t('tts_engine_desc') || 'Choose the default engine for text pronunciation. Edge TTS provides higher quality neural voices.' }}
            </p>
          </div>
          <div class="setting-control">
            <BaseSelect
              id="TTS_ENGINE"
              v-model="ttsEngine"
              :options="engineOptions"
              class="tts-engine-select"
            />
          </div>
        </div>
      </div>

      <div class="section-separator" />

      <!-- Fallback Toggle -->
      <div 
        id="TTS_SETTINGS_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <BaseCheckbox
              v-model="ttsFallbackEnabled"
              :label="t('tts_fallback_label') || 'Enable Language Fallback'"
            />
            <p class="setting-description">
              {{ t('tts_fallback_desc') || 'Automatically switch to a similar language (e.g., Arabic for Persian) if the selected TTS engine does not support the original language natively.' }}
            </p>
          </div>
        </div>
      </div>

      <div class="section-separator" />

      <!-- Auto Detect Toggle -->
      <div class="setting-group">
        <div class="setting-row">
          <div class="setting-info">
            <BaseCheckbox
              v-model="ttsAutoDetectEnabled"
              :label="t('tts_autodetect_label') || 'Smart Language Detection'"
            />
            <p class="setting-description">
              {{ t('tts_autodetect_desc') || 'Automatically detect the actual language of the text. If the selected engine fails to pronounce the text, it will attempt to identify the correct language and try again.' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import './TTSTab.scss'
import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { TTS_ENGINES } from '@/shared/config/constants.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSTab')
const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { createSetting } = useTabSettings(settingsStore, logger)

// TTS Engine Options
const engineOptions = computed(() => [
  { value: TTS_ENGINES.GOOGLE, label: t('tts_engine_google') || 'Google TTS (Standard)' },
  { value: TTS_ENGINES.EDGE, label: t('tts_engine_edge') || 'Microsoft Edge TTS (Neural)' }
])

// Settings using the new unified composable
const ttsEngine = createSetting('TTS_ENGINE', TTS_ENGINES.GOOGLE)
const ttsFallbackEnabled = createSetting('TTS_FALLBACK_ENABLED', true)
const ttsAutoDetectEnabled = createSetting('TTS_AUTO_DETECT_ENABLED', true)

</script>

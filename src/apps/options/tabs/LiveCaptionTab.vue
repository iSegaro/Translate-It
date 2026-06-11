<template>
  <section class="options-tab-content live-caption-tab">
    <div class="settings-container">
      <div class="tab-header">
        <h2>{{ t('live_caption_tab_title') || 'Live Caption' }}</h2>
        <p>{{ t('live_caption_tab_desc') || 'Capture and translate audio from active tab videos using OpenAI Whisper. Chrome/Edge desktop only.' }}</p>
      </div>

      <!-- Platform Support Notice -->
      <div
        id="LIVE_CAPTION_PLATFORM_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('live_caption_platform_support') || 'Platform Support' }}</label>
            <p class="setting-description">
              {{ t('live_caption_platform_desc') || 'Chrome and Edge desktop only. Not available on Firefox or mobile browsers.' }}
            </p>
          </div>
          <div class="setting-control">
            <div class="platform-badge">
              <span v-if="isSupportedPlatform" class="platform-supported">
                ✓ {{ t('live_caption_supported_platform') || 'Supported' }}
              </span>
              <span v-else class="platform-unsupported">
                ✗ {{ t('live_caption_unsupported_platform') || 'Requires Chrome/Edge Desktop' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="section-separator" />

      <!-- Master Enable Toggle -->
      <div
        v-if="isSupportedPlatform"
        id="LIVE_CAPTION_ENABLED_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <BaseCheckbox
              id="LIVE_CAPTION_ENABLED"
              v-model="liveCaptionEnabled"
              :label="t('live_caption_enable_label') || 'Enable Live Caption'"
            />
            <p class="setting-description">
              {{ t('live_caption_enable_desc') || 'Display Live Caption shortcut button in the extension popup and allow caption translation.' }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="isSupportedPlatform" class="section-separator" />

      <!-- Display Mode Selection -->
      <div
        v-if="isSupportedPlatform"
        id="LIVE_CAPTION_DISPLAY_MODE_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('live_caption_display_mode_label') || 'Caption Display Mode' }}</label>
            <p class="setting-description">
              {{ t('live_caption_display_mode_desc') || 'Choose how captions are displayed in the overlay.' }}
            </p>
          </div>
          <div class="setting-control">
            <BaseSelect
              id="LIVE_CAPTION_DISPLAY_MODE"
              v-model="displayMode"
              :options="displayModeOptions"
              class="live-caption-display-mode-select"
            />
          </div>
        </div>
      </div>

      <!-- STT Provider Selection (Debug Mode Only) -->
      <div
        v-if="isSupportedPlatform && settingsStore.settings?.DEBUG_MODE"
        id="LIVE_CAPTION_STT_PROVIDER_SECTION"
        class="setting-group debug-only-setting"
      >
        <div class="section-separator" />
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('live_caption_stt_provider_label') || '[DEBUG] STT Provider' }}</label>
            <p class="setting-description">
              {{ t('live_caption_stt_provider_desc') || 'Select the Speech-to-Text provider. Mock STT is for development testing.' }}
            </p>
          </div>
          <div class="setting-control">
            <BaseSelect
              id="LIVE_CAPTION_STT_PROVIDER"
              v-model="sttProvider"
              :options="sttProviderOptions"
              class="live-caption-stt-provider-select"
            />
          </div>
        </div>
      </div>

      <div
        v-if="isSupportedPlatform"
        class="section-separator"
      />

      <!-- Cache Clear -->
      <div
        v-if="isSupportedPlatform"
        id="LIVE_CAPTION_CACHE_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('live_caption_cache_clear_button') || 'Clear Live Caption Cache' }}</label>
            <p class="setting-description">
              {{ t('live_caption_cache_clear_desc') || 'Remove all cached transcripts and translations for Live Caption.' }}
            </p>
          </div>
          <div class="setting-control">
            <BaseButton
              id="LIVE_CAPTION_CACHE_CLEAR_BTN"
              class="cache-clear-button"
              :disabled="isClearingCache"
              @click="handleClearCache"
            >
              {{ isClearingCache ? (t('clearing') || 'Clearing...') : (t('clear_cache') || 'Clear Cache') }}
            </BaseButton>
          </div>
        </div>
      </div>

      <div
        v-if="isSupportedPlatform"
        class="section-separator"
      />

      <!-- Privacy Notice -->
      <div
        id="LIVE_CAPTION_PRIVACY_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info full-width">
            <label class="setting-label">{{ t('live_caption_privacy_note_title') || 'Privacy & Platform Support' }}</label>
            <p class="setting-description">
              {{ t('live_caption_privacy_note_desc') || 'Live Caption captures the active tab\'s audio after your consent. Raw audio is never persisted. Transcripts and translated captions may be cached outside incognito mode.' }}
            </p>
            <p v-if="!hasOpenAIKey" class="setting-warning">
              ⚠️ {{ t('live_caption_requires_openai_key') || 'Live Caption requires OpenAI API key to be configured in Providers tab.' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import {
  LIVE_CAPTION_CAPTION_DISPLAY_MODES,
  normalizeLiveCaptionCaptionDisplayMode
} from '@/features/live-caption/core/LiveCaptionCaptionDisplayMode.js'
import {
  STT_PROVIDER_IDS,
  getAvailableSTTProviders
} from '@/features/live-caption/stt/STTProviderManifest.js'
import { LIVE_CAPTION_SETTINGS_KEYS } from '@/features/live-caption/constants/liveCaptionSettings.js'
import { getBrowserInfoSync } from '@/utils/browser/compatibility.js'
import { LiveCaptionCache } from '@/features/live-caption/cache/LiveCaptionCache.js'
import browser from 'webextension-polyfill'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LiveCaptionTab')

// Composables
const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()

// State
const liveCaptionEnabled = ref(false)
const displayMode = ref(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY)
const sttProvider = ref(STT_PROVIDER_IDS.OPENAI_WHISPER)
const isClearingCache = ref(false)
const hasOpenAIKey = ref(false)

// Computed
const isSupportedPlatform = computed(() => {
  const browserInfo = getBrowserInfoSync()
  return !browserInfo.isFirefox && !browserInfo.isMobile
})

const displayModeOptions = computed(() => [
  {
    value: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY,
    label: t('live_caption_display_mode_translated_only') || 'Translated Only'
  },
  {
    value: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY,
    label: t('live_caption_display_mode_transcript_only') || 'Transcript Only'
  },
  {
    value: LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL,
    label: t('live_caption_display_mode_bilingual') || 'Bilingual (Both)'
  }
])

const sttProviderOptions = computed(() => {
  const isDebug = settingsStore.settings?.DEBUG_MODE || false
  return getAvailableSTTProviders(isDebug).map(p => ({
    value: p.id,
    label: p.displayName
  }))
})

// Methods
const handleClearCache = async () => {
  try {
    isClearingCache.value = true

    // Clear Live Caption IndexedDB cache
    const cache = new LiveCaptionCache()
    await cache.clearAll()

    logger.info('Live Caption cache cleared successfully')

    // Show success message (could integrate with toast/notification system)
    const successMessage = t('live_caption_cache_clear_success') || 'Live Caption cache cleared successfully.'
    // For now, just log - could emit to a toast system in future
    logger.debug('Cache cleared:', successMessage)
  } catch (error) {
    logger.error('Failed to clear Live Caption cache:', error)
  } finally {
    isClearingCache.value = false
  }
}

const checkOpenAIKey = async () => {
  try {
    const settings = await browser.storage.local.get('OPENAI_API_KEY')
    hasOpenAIKey.value = !!(settings && settings.OPENAI_API_KEY && settings.OPENAI_API_KEY.trim())
  } catch (error) {
    logger.warn('Failed to check OpenAI API key:', error)
    hasOpenAIKey.value = false
  }
}

let isHydrating = true

const loadSettings = () => {
  // Load enabled status from settings if available
  if (settingsStore.settings && settingsStore.settings[LIVE_CAPTION_SETTINGS_KEYS.ENABLED] !== undefined) {
    liveCaptionEnabled.value = !!settingsStore.settings[LIVE_CAPTION_SETTINGS_KEYS.ENABLED]
  }

  // Load display mode from settings if available
  if (settingsStore.settings && settingsStore.settings[LIVE_CAPTION_SETTINGS_KEYS.DISPLAY_MODE]) {
    displayMode.value = normalizeLiveCaptionCaptionDisplayMode(settingsStore.settings[LIVE_CAPTION_SETTINGS_KEYS.DISPLAY_MODE])
  }

  // Load STT provider from settings if available
  if (settingsStore.settings && settingsStore.settings[LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER]) {
    sttProvider.value = settingsStore.settings[LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER]
  }

  isHydrating = false
}

// Watch for enable changes and save to settings
const saveEnabled = async (newVal) => {
  try {
    await settingsStore.updateSettingAndPersist(LIVE_CAPTION_SETTINGS_KEYS.ENABLED, newVal)
    logger.debug('Live Caption enabled state saved', { enabled: newVal })
  } catch (error) {
    logger.error('Failed to save Live Caption enabled state', { error })
  }
}

// Watch for display mode changes and save to settings
const saveDisplayMode = async (newMode) => {
  try {
    await settingsStore.updateSettingAndPersist(LIVE_CAPTION_SETTINGS_KEYS.DISPLAY_MODE, newMode)
    logger.debug('Live Caption display mode saved:', newMode)
  } catch (error) {
    logger.error('Failed to save Live Caption display mode:', error)
  }
}

// Watch for STT provider changes and save to settings
const saveSTTProvider = async (newProvider) => {
  try {
    await settingsStore.updateSettingAndPersist(LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER, newProvider)
    logger.debug('Live Caption STT provider saved:', newProvider)
  } catch (error) {
    logger.error('Failed to save Live Caption STT provider:', error)
  }
}

// Lifecycle
onMounted(() => {
  loadSettings()
  checkOpenAIKey()
})

// Watch enable changes
watch(liveCaptionEnabled, (newVal) => {
  if (isHydrating) return
  saveEnabled(newVal)
})

// Watch display mode changes
watch(displayMode, (newMode) => {
  if (isHydrating) return
  saveDisplayMode(newMode)
})

// Watch STT provider changes
watch(sttProvider, (newProvider) => {
  if (isHydrating) return
  saveSTTProvider(newProvider)
})
</script>

<style scoped lang="scss">
.live-caption-tab {
  max-width: 800px;
  margin: 0 auto;
}

.tab-header {
  margin-bottom: 2rem;
}

.tab-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary);
}

.tab-header p {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 1rem 0;

  &.full-width {
    flex-direction: column;
    gap: 0.75rem;
  }
}

.setting-info {
  flex: 1;

  &.full-width {
    width: 100%;
  }
}

.setting-label {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
  display: block;
}

.setting-description {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  line-height: 1.4;
  margin: 0;
}

.setting-warning {
  color: var(--color-warning);
  font-size: 0.85rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: var(--color-warning-bg);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.setting-control {
  display: flex;
  align-items: center;
  min-width: 200px;
  justify-content: flex-end;
}

.platform-badge {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.9rem;
}

.platform-supported {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.platform-unsupported {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.live-caption-display-mode-select {
  min-width: 180px;
}

.cache-clear-button {
  min-width: 120px;
}

.section-separator {
  height: 1px;
  background: var(--color-border);
  margin: 0.5rem 0;
}

[dir="rtl"] .setting-row {
  gap: 1.5rem;
}
</style>

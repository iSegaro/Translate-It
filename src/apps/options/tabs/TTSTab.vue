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

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.tts-tab {
  padding: $spacing-md;
  box-sizing: border-box;
  max-width: 100%;
}

.tab-header {
  margin-bottom: $spacing-xl;
  
  h2 {
    margin: 0 0 $spacing-sm 0;
    font-size: $font-size-xl;
    font-weight: $font-weight-medium;
    color: var(--color-text);
  }
  
  p {
    margin: 0;
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
  }
}

.setting-group {
  margin-bottom: $spacing-lg;
  max-width: 100%;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-xs;
  gap: $spacing-md;
  flex-wrap: wrap;
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    flex: 1;
    min-width: 200px;
  }
}

.setting-control {
  flex-shrink: 0;
}

.setting-description {
  font-size: $font-size-xs;
  color: var(--color-text-secondary);
  margin-top: $spacing-xs;
  line-height: 1.4;
}

.section-divider {
  border: 0;
  border-top: $border-width $border-style var(--color-border);
  margin: $spacing-xl 0;
}

.select-wrapper {
  position: relative;
  width: 100%;
  max-width: 250px;
  
  &::after {
    content: '';
    position: absolute;
    right: $spacing-sm;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid var(--color-text-secondary);
    pointer-events: none;
  }
  
  .theme-select {
    width: 100%;
    padding: $spacing-sm $spacing-md;
    padding-right: $spacing-xl;
    font-size: $font-size-sm;
    font-family: inherit;
    color: var(--color-text);
    background-color: var(--color-surface);
    border: $border-width $border-style var(--color-border);
    border-radius: $border-radius-base;
    appearance: none;
    cursor: pointer;
    transition: border-color $transition-base, box-shadow $transition-base;
    
    &:hover {
      border-color: var(--color-primary);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
    }
  }
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  
  .toggle-input {
    display: none;
    
    &:checked + .toggle-label {
      background-color: var(--color-primary);
      
      &::after {
        transform: translateX(20px);
      }
    }
    
    &:disabled + .toggle-label {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  
  .toggle-label {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    background-color: var(--color-border);
    border-radius: 12px;
    cursor: pointer;
    transition: background-color $transition-base;
    
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background-color: white;
      border-radius: 50%;
      transition: transform $transition-base;
      box-shadow: $shadow-sm;
    }
  }
}

// Tablet responsive
@media (max-width: #{$breakpoint-lg}) {
  .setting-item {
    align-items: flex-start;
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: $spacing-sm;
    
    label {
      min-width: 100%;
    }
  }
  
  .select-wrapper {
    max-width: 100%;
  }
}
</style>
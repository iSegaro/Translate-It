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
  margin-bottom: $spacing-xl;
  max-width: 100%;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-xs;
  gap: $spacing-md;
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    flex: 1;
    cursor: pointer;
  }
}

.setting-control {
  flex-shrink: 0;
}

.setting-description {
  font-size: $font-size-sm;
  color: var(--color-text-secondary);
  margin-top: $spacing-xs;
  line-height: 1.5;
  max-width: 90%;
}

.section-divider {
  border: 0;
  border-top: $border-width $border-style var(--color-border);
  margin: $spacing-xl 0;
  opacity: 0.6;
}

.select-wrapper {
  position: relative;
  width: 100%;
  min-width: 200px;
  max-width: 250px;
  
  &::after {
    content: '▾';
    position: absolute;
    right: $spacing-md;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-secondary);
    pointer-events: none;
    font-size: 1.2em;
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
    transition: all $transition-base;
    
    &:hover {
      border-color: var(--color-primary);
      background-color: var(--color-background);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px var(--color-primary-alpha);
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
        transform: translateX(18px);
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
    width: 38px;
    height: 20px;
    background-color: var(--color-border);
    border-radius: 10px;
    cursor: pointer;
    transition: all $transition-base;
    
    &:hover {
      filter: brightness(0.95);
    }
    
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
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
    gap: $spacing-sm;
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-item {
    flex-wrap: wrap;
    
    label {
      min-width: 150px;
    }
  }
  
  .select-wrapper {
    max-width: 100%;
  }
  
  .setting-description {
    max-width: 100%;
  }
}
</style>
<template>
  <section class="api-tab">
    <h2>{{ $i18n('api_section_title') || 'Translation API' }}</h2>
    
    <div class="setting-group">
      <label>{{ $i18n('translation_api_label') || 'API Choice' }}</label>
      <ProviderSelector v-model="selectedProvider" />
    </div>
    
    <!-- Dynamic provider settings component would go here -->
    <div class="provider-settings">
      <div v-if="selectedProvider === 'google'" class="api-info">
        <h3>{{ $i18n('google_translate_settings_title') || 'Google Translate' }}</h3>
        <p class="setting-description">
          {{ $i18n('google_translate_description') || 'Uses the free, public Google Translate endpoint. No API key is required.' }}
        </p>
      </div>
      
      <div v-else-if="selectedProvider === 'bing'" class="api-info">
        <h3>{{ $i18n('bing_translate_settings_title') || 'Microsoft Bing Translate' }}</h3>
        <p class="setting-description">
          {{ $i18n('bing_translate_description') || 'Uses the free, public Microsoft Bing Translate endpoint. No API key is required.' }}
        </p>
      </div>
      
      <div v-else-if="selectedProvider === 'gemini'" class="api-settings">
        <h3>{{ $i18n('gemini_api_settings_title') || 'Gemini API Settings' }}</h3>
        <p class="setting-description">
          {{ $i18n('gemini_api_key_info') || 'You can get your Gemini API key from' }}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            class="api-link"
          >
            {{ $i18n('gemini_api_key_link') || 'Get Your Free API Key' }}
          </a>
        </p>
        
        <div class="setting-group">
          <label>{{ $i18n('custom_api_settings_api_key_label') || 'API Key' }}</label>
          <BaseInput
            v-model="geminiApiKey"
            type="password"
            :placeholder="$i18n('gemini_api_key_placeholder') || 'Paste your API key here'"
            class="api-key-input"
          />
        </div>
        
        <div class="setting-group">
          <label>{{ $i18n('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
          <BaseDropdown
            v-model="geminiModel"
            :options="geminiModelOptions"
            class="model-select"
          />
        </div>
      </div>
      
      <!-- Add other provider settings as needed -->
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import ProviderSelector from '@/components/feature/ProviderSelector.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDropdown from '@/components/base/BaseDropdown.vue'

const settingsStore = useSettingsStore()

// Selected provider
const selectedProvider = computed({
  get: () => settingsStore.selectedProvider,
  set: (value) => settingsStore.updateSetting('selectedProvider', value)
})

// Gemini settings
const geminiApiKey = computed({
  get: () => settingsStore.settings?.API_KEY || '',
  set: (value) => settingsStore.updateSetting('API_KEY', value)
})

const geminiModel = computed({
  get: () => settingsStore.settings?.GEMINI_MODEL || 'gemini-2.5-flash',
  set: (value) => settingsStore.updateSetting('GEMINI_MODEL', value)
})

const geminiModelOptions = ref([
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite-preview', label: 'Gemini 2.5 Flash-Lite Preview' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' }
])
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables.scss';

.api-tab {
  max-width: 800px;
}

h2 {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.setting-group {
  margin-bottom: $spacing-lg;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: 0;
    flex-grow: 1;
    min-width: 200px;
  }
}

.provider-settings {
  margin-top: $spacing-xl;
  
  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    margin: 0 0 $spacing-base 0;
    color: var(--color-text);
  }
  
  .setting-description {
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
    margin-bottom: $spacing-md;
    line-height: 1.5;
  }
  
  .api-link {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: $font-weight-medium;
    
    &:hover {
      text-decoration: underline;
    }
  }
}

.api-key-input {
  min-width: 300px;
  flex-shrink: 0;
  
  :deep(input) {
    font-family: monospace;
    letter-spacing: 0.1em;
    
    // API key masking styles
    &:not(:hover):not(:focus) {
      color: transparent;
      text-shadow: 0 0 0 #666;
      background-image: repeating-linear-gradient(
        90deg,
        transparent,
        transparent 0.8ch,
        #666 0.8ch,
        #666 1ch
      );
      background-size: 1ch 1em;
      background-repeat: repeat;
      background-position: 0 center;
    }
    
    &:not(:hover):not(:focus)::placeholder {
      color: transparent;
    }
    
    &:hover,
    &:focus {
      color: var(--input-text-color, var(--color-text));
      text-shadow: none;
      background-image: none;
    }
  }
}

.model-select {
  min-width: 250px;
  flex-shrink: 0;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    
    label {
      min-width: auto;
    }
    
    .api-key-input,
    .model-select {
      min-width: auto;
      width: 100%;
    }
  }
}
</style>
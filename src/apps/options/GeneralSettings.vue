<template>
  <div class="general-settings">
    <h2 class="page-title">
      General Settings
    </h2>
    
    <div class="settings-section">
      <h3 class="section-title">
        Extension
      </h3>
      
      <div class="setting-item">
        <label class="setting-label">
          <input 
            v-model="settings.extensionEnabled"
            type="checkbox"
            class="setting-checkbox"
            @change="handleSettingChange('extensionEnabled', $event.target.checked)"
          >
          <span class="setting-text">Enable Extension</span>
        </label>
        <p class="setting-description">
          Toggle the entire extension on or off
        </p>
      </div>
    </div>
    
    <div class="settings-section">
      <h3 class="section-title">
        Translation
      </h3>
      
      <div class="setting-item">
        <label class="setting-label-text">Default Source Language</label>
        <select 
          v-model="settings.sourceLanguage"
          class="setting-select"
          @change="handleSettingChange('sourceLanguage', $event.target.value)"
        >
          <option value="auto">
            Auto Detect
          </option>
          <option value="en">
            English
          </option>
          <option value="fa">
            Persian
          </option>
          <option value="ar">
            Arabic
          </option>
        </select>
      </div>
      
      <div class="setting-item">
        <label class="setting-label-text">Default Target Language</label>
        <select 
          v-model="settings.targetLanguage"
          class="setting-select"
          @change="handleSettingChange('targetLanguage', $event.target.value)"
        >
          <option value="en">
            English
          </option>
          <option value="fa">
            Persian
          </option>
          <option value="ar">
            Arabic
          </option>
        </select>
      </div>
    </div>
    
    <div class="settings-section">
      <h3 class="section-title">
        Appearance
      </h3>
      
      <div class="setting-item">
        <label class="setting-label-text">Theme</label>
        <select 
          v-model="settings.theme"
          class="setting-select"
          @change="handleSettingChange('theme', $event.target.value)"
        >
          <option value="auto">
            Auto (System)
          </option>
          <option value="light">
            Light
          </option>
          <option value="dark">
            Dark
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'

const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()

const settings = ref({
  extensionEnabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'en',
  theme: 'auto'
})

const handleSettingChange = async (key, value) => {
  try {
    await settingsStore.updateSetting(key, value)
  } catch (error) {
    await handleError(error, `general-settings-update-${key}`)
  }
}

onMounted(async () => {
  await settingsStore.loadSettings()
  
  // Sync with store
  settings.value = {
    extensionEnabled: settingsStore.extensionEnabled,
    sourceLanguage: settingsStore.sourceLanguage,
    targetLanguage: settingsStore.targetLanguage,
    theme: settingsStore.theme
  }
})
</script>

<style scoped>
.general-settings {
  max-width: 800px;
}

.page-title {
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0 0 24px 0;
}

.settings-section {
  margin-bottom: 32px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background-color: var(--color-background);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0 0 16px 0;
}

.setting-item {
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.setting-label-text {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: 4px;
}

.setting-checkbox {
  width: 16px;
  height: 16px;
}

.setting-text {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.setting-select {
  width: 100%;
  max-width: 300px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  font-size: var(--font-size-base);
  background-color: var(--color-background);
  color: var(--color-text);
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.setting-description {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 4px 0 0 0;
}
</style>
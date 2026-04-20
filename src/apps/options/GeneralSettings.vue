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

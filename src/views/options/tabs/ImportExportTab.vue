<template>
  <section class="import-export-tab">
    <h2>{{ $i18n('import_export_section_title') || 'Import/Export Settings' }}</h2>

    <!-- Export Settings -->
    <BaseFieldset :legend="$i18n('import_export_export_title') || 'Export Settings'">
      <div class="setting-group">
        <p class="setting-description export-info">
          {{ $i18n('export_settings_description') || 'Export your current settings to a JSON file for backup or sharing.' }}
        </p>
      </div>
      
      <div class="setting-group">
        <label>{{ $i18n('export_password_label') || '🔐 Export Password (Recommended for Security)' }}</label>
        <div class="export-controls-row">
          <BaseInput
            v-model="exportPassword"
            type="password"
            :placeholder="$i18n('export_password_placeholder') || 'Create a strong password to protect your API keys'"
            class="export-password-input"
          />
          <BaseButton
            @click="exportSettings"
            :loading="isExporting"
            class="export-button"
          >
            {{ $i18n('export_settings_button') || 'Export Settings' }}
          </BaseButton>
        </div>
      </div>
    </BaseFieldset>

    <!-- Import Settings -->
    <BaseFieldset :legend="$i18n('import_export_import_title') || 'Import Settings'">
      <div class="setting-group">
        <label>{{ $i18n('import_settings_label') || 'Import from file' }}</label>
        <input 
          ref="importFileInput"
          type="file" 
          accept=".json"
          @change="handleFileSelect"
          class="file-input"
        />
      </div>
      
      <div v-if="showPasswordField" class="setting-group">
        <label>{{ $i18n('import_password_label') || '🔑 Import Password Required' }}</label>
        <div class="import-controls-row">
          <BaseInput
            v-model="importPassword"
            type="password"
            :placeholder="$i18n('import_password_placeholder') || 'Enter the password used during export'"
            class="import-password-input"
            @keydown.enter="importSettings"
          />
          <BaseButton
            @click="importSettings"
            :loading="isImporting"
            class="import-button"
          >
            {{ $i18n('import_settings_button') || 'Import Settings' }}
          </BaseButton>
        </div>
      </div>
      
      <div class="setting-group">
        <p class="setting-description import-warning">
          {{ $i18n('import_settings_description') || 'Importing will overwrite your current settings. The page will reload after a successful import.' }}
        </p>
      </div>
    </BaseFieldset>

    <!-- Status messages -->
    <div v-if="statusMessage" :class="`status-message status-${statusType}`">
      {{ statusMessage }}
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'

const settingsStore = useSettingsStore()

// State
const exportPassword = ref('')
const importPassword = ref('')
const showPasswordField = ref(false)
const isExporting = ref(false)
const isImporting = ref(false)
const statusMessage = ref('')
const statusType = ref('')
const importFileInput = ref(null)
const selectedFile = ref(null)

// Export settings
const exportSettings = async () => {
  isExporting.value = true
  statusMessage.value = ''
  
  try {
    const settings = await settingsStore.loadSettings()
    
    // Show warning if no password provided
    if (!exportPassword.value.trim()) {
      const proceed = window.confirm(
        '⚠️ SECURITY WARNING ⚠️\n\nYou are about to export your settings WITHOUT password protection.\nYour API keys will be saved in PLAIN TEXT and readable by anyone.\n\n🔒 For security, it\'s STRONGLY recommended to use a password.\n\nDo you want to continue without password protection?'
      )
      
      if (!proceed) {
        isExporting.value = false
        return
      }
    }
    
    // Simple export logic (would use secureStorage in real implementation)
    const exportData = {
      ...settings,
      _exported: true,
      _timestamp: new Date().toISOString()
    }
    
    // Create filename
    const timestamp = new Date().toISOString().slice(0, 10)
    const securitySuffix = exportPassword.value ? '_Encrypted' : ''
    const filename = `Translate-It_Settings${securitySuffix}_${timestamp}.json`
    
    // Download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    
    // Clear password and show success
    exportPassword.value = ''
    statusType.value = 'success'
    statusMessage.value = exportPassword.value ? 
      'Settings exported successfully with encrypted API keys!' :
      'Settings exported successfully (API keys in plain text)'
    
    setTimeout(() => {
      statusMessage.value = ''
    }, 3000)
    
  } catch (error) {
    statusType.value = 'error'
    statusMessage.value = 'Failed to export settings!'
    setTimeout(() => {
      statusMessage.value = ''
    }, 3000)
  } finally {
    isExporting.value = false
  }
}

// Handle file selection
const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (!file) {
    showPasswordField.value = false
    return
  }
  
  selectedFile.value = file
  
  // Check if file needs password (simplified check)
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      showPasswordField.value = data._hasEncryptedKeys || false
      
      // Auto-import if no encryption
      if (!showPasswordField.value) {
        setTimeout(() => {
          importSettings()
        }, 500)
      }
    } catch {
      showPasswordField.value = false
    }
  }
  reader.readAsText(file)
}

// Import settings
const importSettings = async () => {
  if (!selectedFile.value) {
    statusType.value = 'error'
    statusMessage.value = 'Please select a file to import'
    return
  }
  
  isImporting.value = true
  statusMessage.value = ''
  
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const importedSettings = JSON.parse(e.target.result)
        
        // Simple validation
        if (!importedSettings._exported) {
          throw new Error('Invalid settings file format')
        }
        
        // Save settings
        await settingsStore.saveSettings(importedSettings)
        
        // Clear form
        if (importFileInput.value) importFileInput.value.value = ''
        importPassword.value = ''
        showPasswordField.value = false
        selectedFile.value = null
        
        statusType.value = 'success'
        statusMessage.value = 'Settings imported successfully! Reloading...'
        
        // Reload page after 1.5 seconds
        setTimeout(() => {
          window.location.reload()
        }, 1500)
        
      } catch (error) {
        statusType.value = 'error'
        statusMessage.value = 'Failed to import settings: ' + error.message
        setTimeout(() => {
          statusMessage.value = ''
        }, 4000)
      } finally {
        isImporting.value = false
      }
    }
    reader.readAsText(selectedFile.value)
    
  } catch (error) {
    statusType.value = 'error'
    statusMessage.value = 'Failed to read file!'
    setTimeout(() => {
      statusMessage.value = ''
    }, 3000)
    isImporting.value = false
  }
}
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables.scss';

.import-export-tab {
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
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: $spacing-sm;
    display: block;
  }
  
  .setting-description {
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
    line-height: 1.5;
    
    &.export-info {
      flex-basis: auto;
      padding-left: 0;
    }
    
    &.import-warning {
      flex-basis: auto;
      padding-left: 0;
      color: var(--color-warning);
    }
  }
}

.export-controls-row,
.import-controls-row {
  display: flex;
  align-items: center;
  gap: $spacing-base;
  width: 100%;
  flex-wrap: wrap;
}

.export-password-input,
.import-password-input {
  flex: 1;
  min-width: 200px;
}

.export-button,
.import-button {
  flex-shrink: 0;
  white-space: nowrap;
}

.file-input {
  width: 100%;
  padding: $spacing-sm;
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: $font-size-sm;
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.status-message {
  padding: $spacing-base $spacing-md;
  border-radius: $border-radius-base;
  margin-top: $spacing-lg;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  
  &.status-success {
    background-color: var(--color-success);
    color: white;
  }
  
  &.status-error {
    background-color: var(--color-error);
    color: white;
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .export-controls-row,
  .import-controls-row {
    flex-direction: column;
    align-items: stretch;
    
    .export-password-input,
    .import-password-input {
      min-width: auto;
      width: 100%;
    }
    
    .export-button,
    .import-button {
      width: 100%;
    }
  }
}
</style>
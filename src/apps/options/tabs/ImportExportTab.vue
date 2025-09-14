<template>
  <section class="import-export-tab">
    <h2>{{ t('import_export_section_title') || 'Import/Export Settings' }}</h2>

    <!-- Export Settings -->
    <BaseFieldset :legend="t('import_export_export_title') || 'Export Settings'">
      <div class="setting-group">
        <p class="setting-description export-info">
          {{ t('export_settings_description') || 'Export your current settings to a JSON file for backup or sharing.' }}
        </p>
      </div>
      
      <div class="setting-group">
        <label>{{ t('export_password_label') || '🔐 Export Password (Recommended for Security)' }}</label>
        <div class="export-controls-row">
          <BaseInput
            v-model="exportPassword"
            type="password"
            :placeholder="t('export_password_placeholder') || 'Create a strong password to protect your API keys'"
            class="export-password-input"
          />
          <BaseButton
            :loading="isExporting"
            class="export-button"
            @click="exportSettings"
          >
            {{ t('export_settings_button') || 'Export Settings' }}
          </BaseButton>
        </div>
      </div>
    </BaseFieldset>

    <!-- Import Settings -->
    <BaseFieldset :legend="t('import_export_import_title') || 'Import Settings'">
      <div class="setting-group">
        <label>{{ t('import_settings_label') || 'Import from file' }}</label>
        <input 
          ref="importFileInput"
          type="file" 
          accept=".json"
          class="file-input"
          @change="handleFileSelect"
        >
      </div>
      
      <div
        v-if="showPasswordField"
        class="setting-group"
      >
        <label>{{ t('import_password_label') || '🔑 Import Password Required' }}</label>
        <div class="import-controls-row">
          <BaseInput
            v-model="importPassword"
            type="password"
            :placeholder="t('import_password_placeholder') || 'Enter the password used during export'"
            class="import-password-input"
            @keydown.enter="importSettings"
          />
          <BaseButton
            :loading="isImporting"
            class="import-button"
            @click="importSettings"
          >
            {{ t('import_settings_button') || 'Import Settings' }}
          </BaseButton>
        </div>
      </div>
      
      <div class="setting-group">
        <p class="setting-description import-warning">
          {{ t('import_settings_description') || 'Importing will overwrite your current settings. The page will reload after a successful import.' }}
        </p>
      </div>
    </BaseFieldset>

    <!-- Status messages -->
    <div
      v-if="statusMessage"
      :class="`status-message status-${statusType}`"
    >
      {{ statusMessage }}
    </div>
  </section>
</template>

<script setup>
import { ref, getCurrentInstance } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import secureStorage from '@/shared/storage/core/SecureStorage.js'

import { useI18n } from 'vue-i18n'


const { t } = useI18n()

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
      const warningTitle = t('security_warning_title') || '⚠️ SECURITY WARNING ⚠️'
      const warningMessage = t('security_warning_message') || 
        'You are about to export your settings WITHOUT password protection.\nYour API keys will be saved in PLAIN TEXT and readable by anyone.\n\n🔒 For security, it\'s STRONGLY recommended to use a password.'
      const warningQuestion = t('security_warning_question') || 
        'Do you want to continue without password protection?'
      
      const proceed = window.confirm(
        `${warningTitle}\n\n${warningMessage}\n\n${warningQuestion}`
      )
      
      if (!proceed) {
        isExporting.value = false
        return
      }
    }
    
    // Use secureStorage for proper export handling
    const exportData = await secureStorage.prepareForExport(
      settings,
      exportPassword.value.trim() || null
    )
    
    // Create filename with security indicator
    const timestamp = new Date().toISOString().slice(0, 10)
    const securitySuffix = exportPassword.value.trim() ? '_Encrypted' : ''
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
      (t('export_success_encrypted') || 'Settings exported successfully with encrypted API keys!') :
      (t('export_success_plaintext') || 'Settings exported successfully (API keys in plain text)')
    
    setTimeout(() => {
      statusMessage.value = ''
    }, 3000)
    
  } catch (error) {
    statusType.value = 'error'
    let errorMessage = t('export_error_generic') || 'Failed to export settings'
    
    if (error.message.includes('Password')) {
      errorMessage = `${t('export_error_password') || 'Export failed'}: ${error.message}`
    }
    
    statusMessage.value = errorMessage
    setTimeout(() => {
      statusMessage.value = ''
    }, 3000)
  } finally {
    isExporting.value = false
  }
}

// Check file encryption status
const checkFileEncryption = async (file) => {
  try {
    const content = await file.text()
    const data = JSON.parse(content)
    
    if (data._hasEncryptedKeys && data._secureKeys) {
      // File has encrypted keys - show password field
      return true
    } else {
      // No encryption - hide password field
      return false
    }
  } catch {
    // Invalid JSON or other error
    return false
  }
}

// Handle file selection
const handleFileSelect = async (event) => {
  const file = event.target.files[0]
  if (!file) {
    showPasswordField.value = false
    selectedFile.value = null
    return
  }
  
  selectedFile.value = file
  
  // Check if file needs password
  const hasEncryption = await checkFileEncryption(file)
  showPasswordField.value = hasEncryption
  
  // Auto-import if no encryption detected
  if (!hasEncryption) {
    setTimeout(() => {
      importSettings()
    }, 500)
  }
}

// Import settings
const importSettings = async () => {
  if (!selectedFile.value) {
    statusType.value = 'error'
    statusMessage.value = t('import_error_no_file') || 'Please select a file to import'
    return
  }
  
  isImporting.value = true
  statusMessage.value = ''
  
  try {
    const fileContent = await selectedFile.value.text()
    const importedSettings = JSON.parse(fileContent)
    const importPasswordValue = importPassword.value.trim() || null
    
    // Process imported settings using secureStorage (handles both encrypted and plain)
    const processedSettings = await secureStorage.processImportedSettings(
      importedSettings,
      importPasswordValue
    )
    
    // Save to storage using settings store
    await settingsStore.importSettings(processedSettings, importPasswordValue) // Call the store action
    
    // Clear form only on successful import
    if (importFileInput.value) importFileInput.value.value = ''
    importPassword.value = ''
    showPasswordField.value = false
    selectedFile.value = null
    
    statusType.value = 'success'
    statusMessage.value = t('import_success') || 'Settings imported successfully! Reloading...'
    
    // Reload page after 1.5 seconds
    setTimeout(() => {
      window.location.reload()
    }, 1500)
    
  } catch (error) {
    statusType.value = 'error'
    let errorMessage = t('import_error_generic') || 'Failed to import settings'
    
    // Handle specific error types
    if (error.message.includes('Password') || error.message.includes('password')) {
      errorMessage = `${t('import_error_password') || 'Import failed'}: ${error.message}`
      
      // Only clear password input on password errors, keep file selected
      importPassword.value = ''
      
      // Focus password input for immediate retry
      setTimeout(() => {
        const passwordInput = document.querySelector('.import-password-input input')
        if (passwordInput) passwordInput.focus()
      }, 100)
    } else if (error.message.includes('JSON')) {
      errorMessage = t('import_error_invalid_format') || 'Import failed: Invalid file format'
      
      // Clear file input for non-password errors
      if (importFileInput.value) importFileInput.value.value = ''
      selectedFile.value = null
      showPasswordField.value = false
    } else {
      // Clear file input for other errors
      if (importFileInput.value) importFileInput.value.value = ''
      selectedFile.value = null
      showPasswordField.value = false
    }
    
    statusMessage.value = errorMessage
    setTimeout(() => {
      statusMessage.value = ''
    }, 4000)
  } finally {
    isImporting.value = false
  }
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

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
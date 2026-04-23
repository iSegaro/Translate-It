<template>
  <section class="options-tab-content import-export-tab">
    <div class="settings-container">
      <h2>{{ t('import_export_section_title') || 'Import/Export Settings' }}</h2>

      <!-- Export Settings -->
      <BaseFieldset :legend="t('import_export_export_title') || 'Export Settings'">
        <div class="setting-group vertical">
          <p class="setting-description export-info">
            {{ t('export_settings_description') || 'Export your current settings to a JSON file for backup or sharing.' }}
          </p>
        </div>
        
        <div class="setting-group vertical">
          <label class="setting-label">{{ t('export_password_label') || '🔐 Export Password (Recommended for Security)' }}</label>
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
        <div class="setting-group vertical">
          <label class="setting-label">{{ t('import_settings_label') || 'Import from file' }}</label>
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
          class="setting-group vertical"
        >
          <label class="setting-label">{{ t('import_password_label') || '🔑 Import Password Required' }}</label>
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
        
        <div class="setting-group vertical">
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
    </div>
  </section>
</template>

<script setup>
import './ImportExportTab.scss'
import { ref } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import BaseFieldset from '@/components/base/BaseFieldset.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import secureStorage from '@/shared/storage/core/SecureStorage.js'

const { t } = useUnifiedI18n()
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
    
    const exportData = await secureStorage.prepareForExport(
      settings,
      exportPassword.value.trim() || null
    )
    
    const timestamp = new Date().toISOString().slice(0, 10)
    const securitySuffix = exportPassword.value.trim() ? '_Encrypted' : ''
    const filename = `Translate-It_Settings${securitySuffix}_${timestamp}.json`
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    
    exportPassword.value = ''
    statusType.value = 'success'
    statusMessage.value = t('export_success') || 'Settings exported successfully!'
    
    setTimeout(() => { statusMessage.value = '' }, 3000)
    
  } catch {
    statusType.value = 'error'
    statusMessage.value = t('export_error_generic') || 'Failed to export settings'
    setTimeout(() => { statusMessage.value = '' }, 3000)
  } finally {
    isExporting.value = false
  }
}

// Check file encryption status
const checkFileEncryption = async (file) => {
  try {
    const content = await file.text()
    const data = JSON.parse(content)
    return !!(data._hasEncryptedKeys && data._secureKeys)
  } catch {
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
  const hasEncryption = await checkFileEncryption(file)
  showPasswordField.value = hasEncryption
  if (!hasEncryption) setTimeout(() => importSettings(), 500)
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
    await settingsStore.importSettings(importedSettings, importPassword.value.trim() || null)
    
    if (importFileInput.value) importFileInput.value.value = ''
    importPassword.value = ''
    showPasswordField.value = false
    selectedFile.value = null
    
    statusType.value = 'success'
    statusMessage.value = t('import_success') || 'Settings imported successfully!'
    
  } catch (error) {
    statusType.value = 'error'
    statusMessage.value = error.message.includes('password') ? t('import_error_password') : (t('import_error_generic') || 'Import failed')
    importPassword.value = ''
    setTimeout(() => { statusMessage.value = '' }, 4000)
  } finally {
    isImporting.value = false
  }
}
</script>

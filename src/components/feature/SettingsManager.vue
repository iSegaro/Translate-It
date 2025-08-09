<template>
  <div class="settings-manager">
    <!-- Backup & Restore Section -->
    <div class="manager-section">
      <div class="section-header">
        <h4>Backup & Restore</h4>
        <p>Create backups of your settings and translation history</p>
      </div>
      
      <div class="backup-actions">
        <button
          class="action-btn primary"
          :disabled="isCreatingBackup"
          @click="createFullBackup"
        >
          <span
            v-if="isCreatingBackup"
            class="loading-spinner"
          />
          <span
            v-else
            class="btn-icon"
          >💾</span>
          <span class="btn-text">Create Full Backup</span>
        </button>
        
        <button
          class="action-btn secondary"
          :disabled="isCreatingBackup"
          @click="createSettingsBackup"
        >
          <span class="btn-icon">⚙️</span>
          <span class="btn-text">Backup Settings Only</span>
        </button>
        
        <button
          class="action-btn secondary"
          :disabled="isCreatingBackup"
          @click="createHistoryBackup"
        >
          <span class="btn-icon">📝</span>
          <span class="btn-text">Backup History Only</span>
        </button>
      </div>
    </div>

    <!-- Import/Export Section -->
    <div class="manager-section">
      <div class="section-header">
        <h4>Import & Export</h4>
        <p>Import settings from file or export current configuration</p>
      </div>
      
      <div class="import-export-actions">
        <div class="import-area">
          <button
            class="action-btn outline"
            :disabled="isImporting"
            @click="triggerImport"
          >
            <span
              v-if="isImporting"
              class="loading-spinner"
            />
            <span
              v-else
              class="btn-icon"
            >📥</span>
            <span class="btn-text">Import Settings</span>
          </button>
          
          <input
            ref="fileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleFileImport"
          >
          
          <div class="import-info">
            <small>Supports JSON files from previous backups</small>
          </div>
        </div>
        
        <div class="export-area">
          <BaseDropdown position="bottom-start">
            <template #trigger="{ toggle, open }">
              <button
                class="action-btn outline"
                :class="{ active: open }"
                :disabled="isExporting"
                @click="toggle"
              >
                <span
                  v-if="isExporting"
                  class="loading-spinner"
                />
                <span
                  v-else
                  class="btn-icon"
                >📤</span>
                <span class="btn-text">Export Options</span>
                <span class="dropdown-arrow">▼</span>
              </button>
            </template>
            
            <div class="export-dropdown">
              <button
                class="export-option"
                @click="exportSettings"
              >
                <span class="option-icon">⚙️</span>
                <div class="option-content">
                  <div class="option-title">
                    Export Settings
                  </div>
                  <div class="option-desc">
                    Extension configuration only
                  </div>
                </div>
              </button>
              
              <button
                class="export-option"
                @click="exportHistory"
              >
                <span class="option-icon">📝</span>
                <div class="option-content">
                  <div class="option-title">
                    Export History
                  </div>
                  <div class="option-desc">
                    Translation history only
                  </div>
                </div>
              </button>
              
              <button
                class="export-option"
                @click="exportAll"
              >
                <span class="option-icon">📦</span>
                <div class="option-content">
                  <div class="option-title">
                    Export Everything
                  </div>
                  <div class="option-desc">
                    Complete backup file
                  </div>
                </div>
              </button>
              
              <div class="export-divider" />
              
              <button
                class="export-option"
                @click="exportAsCSV"
              >
                <span class="option-icon">📊</span>
                <div class="option-content">
                  <div class="option-title">
                    Export as CSV
                  </div>
                  <div class="option-desc">
                    History in spreadsheet format
                  </div>
                </div>
              </button>
              
              <button
                class="export-option"
                @click="exportAsText"
              >
                <span class="option-icon">📄</span>
                <div class="option-content">
                  <div class="option-title">
                    Export as Text
                  </div>
                  <div class="option-desc">
                    Plain text format
                  </div>
                </div>
              </button>
            </div>
          </BaseDropdown>
        </div>
      </div>
    </div>

    <!-- Recent Backups Section -->
    <div class="manager-section">
      <div class="section-header">
        <h4>Recent Backups</h4>
        <p>Manage your local backups</p>
      </div>
      
      <div class="backups-list">
        <div
          v-if="recentBackups.length === 0"
          class="empty-backups"
        >
          <div class="empty-icon">
            📦
          </div>
          <p>No backups found</p>
          <small>Create your first backup above</small>
        </div>
        
        <div
          v-else
          class="backup-items"
        >
          <div
            v-for="backup in recentBackups"
            :key="backup.id"
            class="backup-item"
            :class="{ restoring: restoringBackup === backup.id }"
          >
            <div class="backup-info">
              <div class="backup-header">
                <div class="backup-name">
                  {{ backup.name }}
                </div>
                <div
                  class="backup-type"
                  :class="`type-${backup.type}`"
                >
                  {{ getBackupTypeName(backup.type) }}
                </div>
              </div>
              
              <div class="backup-details">
                <span class="backup-date">{{ formatDate(backup.timestamp) }}</span>
                <span class="backup-size">{{ formatFileSize(backup.size) }}</span>
                <span class="backup-items">{{ backup.itemCount }} items</span>
              </div>
              
              <div
                v-if="backup.description"
                class="backup-description"
              >
                {{ backup.description }}
              </div>
            </div>
            
            <div class="backup-actions">
              <button
                class="backup-btn restore-btn"
                :disabled="restoringBackup === backup.id"
                @click="showRestoreOptions(backup)"
              >
                <span
                  v-if="restoringBackup === backup.id"
                  class="loading-spinner small"
                />
                <span
                  v-else
                  class="btn-icon"
                >↩️</span>
                <span class="btn-text">Restore</span>
              </button>
              
              <button
                class="backup-btn download-btn"
                title="Download backup file"
                @click="downloadBackup(backup)"
              >
                <span class="btn-icon">⬇️</span>
              </button>
              
              <button
                class="backup-btn delete-btn"
                title="Delete backup"
                @click="deleteBackup(backup)"
              >
                <span class="btn-icon">🗑️</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sync Settings Section -->
    <div class="manager-section">
      <div class="section-header">
        <h4>Sync Settings</h4>
        <p>Configure automatic backup and sync preferences</p>
      </div>
      
      <div class="sync-settings">
        <div class="setting-row">
          <label class="setting-label">
            <input
              v-model="syncSettings.autoBackup"
              type="checkbox"
              @change="updateSyncSetting('autoBackup', $event.target.checked)"
            >
            <span class="checkmark" />
            <span class="label-text">Enable automatic backups</span>
          </label>
          
          <div
            v-if="syncSettings.autoBackup"
            class="setting-details"
          >
            <select
              v-model="syncSettings.backupFrequency"
              class="frequency-select"
              @change="updateSyncSetting('backupFrequency', $event.target.value)"
            >
              <option value="hourly">
                Every hour
              </option>
              <option value="daily">
                Daily
              </option>
              <option value="weekly">
                Weekly
              </option>
            </select>
          </div>
        </div>
        
        <div class="setting-row">
          <label class="setting-label">
            <input
              v-model="syncSettings.cloudSync"
              type="checkbox"
              @change="updateSyncSetting('cloudSync', $event.target.checked)"
            >
            <span class="checkmark" />
            <span class="label-text">Enable cloud sync (experimental)</span>
          </label>
        </div>
        
        <div class="setting-row">
          <label class="setting-label">
            <input
              v-model="syncSettings.encryptBackups"
              type="checkbox"
              @change="updateSyncSetting('encryptBackups', $event.target.checked)"
            >
            <span class="checkmark" />
            <span class="label-text">Encrypt backup files</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Restore Options Modal -->
    <BaseModal
      v-model="showRestoreModal"
      title="Restore Options"
      size="md"
    >
      <div
        v-if="selectedBackup"
        class="restore-options"
      >
        <div class="restore-info">
          <h4>{{ selectedBackup.name }}</h4>
          <p>Choose what to restore from this backup:</p>
        </div>
        
        <div class="restore-choices">
          <label class="restore-choice">
            <input
              v-model="restoreOptions.settings"
              type="checkbox"
            >
            <span class="checkmark" />
            <div class="choice-content">
              <div class="choice-title">Extension Settings</div>
              <div class="choice-desc">Provider configurations, preferences, etc.</div>
            </div>
          </label>
          
          <label class="restore-choice">
            <input
              v-model="restoreOptions.history"
              type="checkbox"
            >
            <span class="checkmark" />
            <div class="choice-content">
              <div class="choice-title">Translation History</div>
              <div class="choice-desc">All previous translations</div>
            </div>
          </label>
          
          <label class="restore-choice">
            <input
              v-model="restoreOptions.favorites"
              type="checkbox"
            >
            <span class="checkmark" />
            <div class="choice-content">
              <div class="choice-title">Favorites & Bookmarks</div>
              <div class="choice-desc">Saved translations and bookmarks</div>
            </div>
          </label>
        </div>
        
        <div class="restore-warning">
          <span class="warning-icon">⚠️</span>
          <span class="warning-text">
            This will overwrite your current data. Consider creating a backup first.
          </span>
        </div>
      </div>
      
      <template #footer>
        <button
          class="modal-btn secondary"
          @click="showRestoreModal = false"
        >
          Cancel
        </button>
        <button
          class="modal-btn primary"
          :disabled="!hasRestoreSelection"
          @click="confirmRestore"
        >
          Restore Selected
        </button>
      </template>
    </BaseModal>

    <!-- Progress Modal -->
    <BaseModal
      v-model="showProgressModal"
      title="Processing..."
      size="sm"
      :closable="false"
    >
      <div class="progress-content">
        <div class="progress-spinner" />
        <div class="progress-text">
          {{ progressMessage }}
        </div>
        <div
          v-if="progressDetails"
          class="progress-details"
        >
          {{ progressDetails }}
        </div>
      </div>
    </BaseModal>

    <!-- Status Messages -->
    <div
      v-if="statusMessage"
      class="status-message"
      :class="`status-${statusType}`"
    >
      <span class="status-icon">
        {{ statusType === 'success' ? '✅' : statusType === 'error' ? '❌' : 'ℹ️' }}
      </span>
      <span class="status-text">{{ statusMessage }}</span>
      <button
        class="status-close"
        @click="clearStatus"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useExtensionAPI } from '@/composables/useExtensionAPI.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import BaseDropdown from '@/components/base/BaseDropdown.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import { storageManager } from '@/storage/core/StorageCore.js'

const { getStorageData, setStorageData } = useExtensionAPI()
const { handleError } = useErrorHandler()

// State
const isCreatingBackup = ref(false)
const isImporting = ref(false)
const isExporting = ref(false)
const restoringBackup = ref(null)
const showRestoreModal = ref(false)
const showProgressModal = ref(false)
const selectedBackup = ref(null)
const fileInput = ref(null)
const recentBackups = ref([])
const progressMessage = ref('')
const progressDetails = ref('')
const statusMessage = ref('')
const statusType = ref('info')

// Settings
const syncSettings = ref({
  autoBackup: false,
  backupFrequency: 'daily',
  cloudSync: false,
  encryptBackups: false
})

// Restore options
const restoreOptions = ref({
  settings: true,
  history: true,
  favorites: true
})

// Computed
const hasRestoreSelection = computed(() => {
  return Object.values(restoreOptions.value).some(Boolean)
})

// Methods
const createFullBackup = async () => {
  if (isCreatingBackup.value) return

  isCreatingBackup.value = true
  showProgressModal.value = true
  progressMessage.value = 'Creating full backup...'

  try {
    // Get all data
    const allData = await getStorageData(null) // Get all storage
    
    const backup = {
      id: generateBackupId(),
      name: `Full Backup - ${new Date().toLocaleDateString()}`,
      type: 'full',
      timestamp: Date.now(),
      data: allData,
      size: JSON.stringify(allData).length,
      itemCount: Object.keys(allData).length,
      description: 'Complete backup including settings and history'
    }

    await saveBackup(backup)
    recentBackups.value.unshift(backup)

    showStatus('Full backup created successfully', 'success')
  } catch (error) {
    await handleError(error, 'settings-manager-full-backup')
    showStatus('Failed to create backup: ' + error.message, 'error')
  } finally {
    isCreatingBackup.value = false
    showProgressModal.value = false
  }
}

const createSettingsBackup = async () => {
  if (isCreatingBackup.value) return

  isCreatingBackup.value = true
  progressMessage.value = 'Creating settings backup...'

  try {
    // Get only settings-related data
    const settingsKeys = [
      'provider_settings',
      'tts_settings',
      'ui_preferences',
      'language_preferences'
    ]
    
    const settingsData = await getStorageData(settingsKeys)
    
    const backup = {
      id: generateBackupId(),
      name: `Settings Backup - ${new Date().toLocaleDateString()}`,
      type: 'settings',
      timestamp: Date.now(),
      data: settingsData,
      size: JSON.stringify(settingsData).length,
      itemCount: Object.keys(settingsData).length,
      description: 'Extension settings and preferences only'
    }

    await saveBackup(backup)
    recentBackups.value.unshift(backup)

    showStatus('Settings backup created successfully', 'success')
  } catch (error) {
    await handleError(error, 'settings-manager-settings-backup')
    showStatus('Failed to create settings backup: ' + error.message, 'error')
  } finally {
    isCreatingBackup.value = false
  }
}

const createHistoryBackup = async () => {
  if (isCreatingBackup.value) return

  isCreatingBackup.value = true
  progressMessage.value = 'Creating history backup...'

  try {
    // Get only history data
    const historyData = await getStorageData(['translation_history', 'favorites'])
    
    const backup = {
      id: generateBackupId(),
      name: `History Backup - ${new Date().toLocaleDateString()}`,
      type: 'history',
      timestamp: Date.now(),
      data: historyData,
      size: JSON.stringify(historyData).length,
      itemCount: (historyData.translation_history?.length || 0) + (historyData.favorites?.length || 0),
      description: 'Translation history and favorites only'
    }

    await saveBackup(backup)
    recentBackups.value.unshift(backup)

    showStatus('History backup created successfully', 'success')
  } catch (error) {
    await handleError(error, 'settings-manager-history-backup')
    showStatus('Failed to create history backup: ' + error.message, 'error')
  } finally {
    isCreatingBackup.value = false
  }
}

const triggerImport = () => {
  fileInput.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  isImporting.value = true
  showProgressModal.value = true
  progressMessage.value = 'Importing settings...'

  try {
    const text = await file.text()
    const importData = JSON.parse(text)

    // Validate import data
    if (!validateImportData(importData)) {
      throw new Error('Invalid backup file format')
    }

    // Import the data
    await setStorageData(importData.data || importData)
    
    showStatus('Settings imported successfully', 'success')
  } catch (error) {
    await handleError(error, 'settings-manager-import')
    showStatus('Failed to import settings: ' + error.message, 'error')
  } finally {
    isImporting.value = false
    showProgressModal.value = false
    event.target.value = '' // Reset file input
  }
}

const exportSettings = async () => {
  await performExport('settings', 'Settings Export')
}

const exportHistory = async () => {
  await performExport('history', 'History Export')
}

const exportAll = async () => {
  await performExport('full', 'Complete Export')
}

const exportAsCSV = async () => {
  try {
    const historyData = await getStorageData(['translation_history'])
    const history = historyData.translation_history || []

    const csvContent = generateCSV(history)
    downloadFile(csvContent, `translation-history-${Date.now()}.csv`, 'text/csv')
    
    showStatus('History exported as CSV', 'success')
  } catch (error) {
    showStatus('Failed to export CSV: ' + error.message, 'error')
  }
}

const exportAsText = async () => {
  try {
    const historyData = await getStorageData(['translation_history'])
    const history = historyData.translation_history || []

    const textContent = generateTextExport(history)
    downloadFile(textContent, `translation-history-${Date.now()}.txt`, 'text/plain')
    
    showStatus('History exported as text', 'success')
  } catch (error) {
    showStatus('Failed to export text: ' + error.message, 'error')
  }
}

const performExport = async (type, name) => {
  if (isExporting.value) return

  isExporting.value = true
  progressMessage.value = `Exporting ${name.toLowerCase()}...`

  try {
    let exportData
    
    switch (type) {
      case 'settings':
        exportData = await getStorageData([
          'provider_settings',
          'tts_settings',
          'ui_preferences'
        ])
        break
      case 'history':
        exportData = await getStorageData(['translation_history', 'favorites'])
        break
      case 'full':
      default:
        exportData = await getStorageData(null)
        break
    }

    const exportObject = {
      type,
      name,
      timestamp: Date.now(),
      version: '1.0',
      data: exportData
    }

    const jsonContent = JSON.stringify(exportObject, null, 2)
    const filename = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`
    
    downloadFile(jsonContent, filename, 'application/json')
    showStatus(`${name} exported successfully`, 'success')
  } catch (error) {
    await handleError(error, 'settings-manager-export')
    showStatus(`Failed to export ${name.toLowerCase()}: ` + error.message, 'error')
  } finally {
    isExporting.value = false
  }
}

const showRestoreOptions = (backup) => {
  selectedBackup.value = backup
  showRestoreModal.value = true
}

const confirmRestore = async () => {
  if (!selectedBackup.value || !hasRestoreSelection.value) return

  showRestoreModal.value = false
  restoringBackup.value = selectedBackup.value.id
  showProgressModal.value = true
  progressMessage.value = 'Restoring from backup...'

  try {
    const backup = selectedBackup.value
    const dataToRestore = {}

    // Filter data based on restore options
    if (restoreOptions.value.settings) {
      const settingsKeys = ['provider_settings', 'tts_settings', 'ui_preferences']
      settingsKeys.forEach(key => {
        if (backup.data[key]) {
          dataToRestore[key] = backup.data[key]
        }
      })
    }

    if (restoreOptions.value.history) {
      if (backup.data.translation_history) {
        dataToRestore.translation_history = backup.data.translation_history
      }
    }

    if (restoreOptions.value.favorites) {
      if (backup.data.favorites) {
        dataToRestore.favorites = backup.data.favorites
      }
    }

    await setStorageData(dataToRestore)
    showStatus('Backup restored successfully', 'success')
  } catch (error) {
    await handleError(error, 'settings-manager-restore')
    showStatus('Failed to restore backup: ' + error.message, 'error')
  } finally {
    restoringBackup.value = null
    showProgressModal.value = false
  }
}

const downloadBackup = (backup) => {
  const exportObject = {
    ...backup,
    exportedAt: Date.now()
  }

  const jsonContent = JSON.stringify(exportObject, null, 2)
  const filename = `${backup.name.toLowerCase().replace(/\s+/g, '-')}.json`
  
  downloadFile(jsonContent, filename, 'application/json')
}

const deleteBackup = (backup) => {
  if (confirm(`Are you sure you want to delete "${backup.name}"?`)) {
    const index = recentBackups.value.findIndex(b => b.id === backup.id)
    if (index !== -1) {
      recentBackups.value.splice(index, 1)
      removeBackupFromStorage(backup.id)
      showStatus('Backup deleted', 'success')
    }
  }
}

const updateSyncSetting = async (key, value) => {
  syncSettings.value[key] = value
  await setStorageData({ sync_settings: syncSettings.value })
}

// Utility functions
const generateBackupId = () => {
  return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const validateImportData = (data) => {
  // Basic validation - check if it's a valid backup format
  return data && (data.data || typeof data === 'object')
}

const generateCSV = (history) => {
  const headers = ['Date', 'Source Text', 'Translated Text', 'From Language', 'To Language', 'Provider', 'Confidence']
  const rows = [headers.join(',')]

  history.forEach(item => {
    const row = [
      new Date(item.timestamp).toISOString(),
      `"${item.sourceText.replace(/"/g, '""')}"`,
      `"${item.text.replace(/"/g, '""')}"`,
      item.fromLanguage,
      item.toLanguage,
      item.provider,
      item.confidence || ''
    ]
    rows.push(row.join(','))
  })

  return rows.join('\n')
}

const generateTextExport = (history) => {
  const lines = [`Translation History Export - ${new Date().toLocaleString()}`, '']

  history.forEach((item, index) => {
    lines.push(`${index + 1}. Translation`)
    lines.push(`Date: ${new Date(item.timestamp).toLocaleString()}`)
    lines.push(`Source (${item.fromLanguage}): ${item.sourceText}`)
    lines.push(`Translation (${item.toLanguage}): ${item.text}`)
    lines.push(`Provider: ${item.provider}`)
    if (item.confidence) {
      lines.push(`Confidence: ${Math.round(item.confidence * 100)}%`)
    }
    lines.push('')
  })

  return lines.join('\n')
}

const downloadFile = (content, filename, contentType) => {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const saveBackup = async (backup) => {
  try {
    const backupKey = `backup_${backup.id}`
    await setStorageData({ [backupKey]: backup })
    
    // Update backup list
    const backupList = await getStorageData(['backup_list'])
    const currentList = backupList.backup_list || []
    currentList.unshift(backup.id)
    
    // Keep only recent 10 backups
    const recentList = currentList.slice(0, 10)
    await setStorageData({ backup_list: recentList })
  } catch (error) {
    await handleError(error, 'settings-manager-save-backup')
    throw error
  }
}

const removeBackupFromStorage = async (backupId) => {
  try {
    const backupKey = `backup_${backupId}`
    await storageManager.remove([backupKey])
    
    // Update backup list
    const backupList = await getStorageData(['backup_list'])
    const currentList = backupList.backup_list || []
    const updatedList = currentList.filter(id => id !== backupId)
    await setStorageData({ backup_list: updatedList })
  } catch (error) {
    await handleError(error, 'settings-manager-remove-backup')
  }
}

const loadRecentBackups = async () => {
  try {
    const backupList = await getStorageData(['backup_list'])
    const backupIds = backupList.backup_list || []
    
    const backups = []
    for (const id of backupIds) {
      const backupData = await getStorageData([`backup_${id}`])
      const backup = backupData[`backup_${id}`]
      if (backup) {
        backups.push(backup)
      }
    }
    
    recentBackups.value = backups
  } catch (error) {
    await handleError(error, 'settings-manager-load-backups')
  }
}

const loadSyncSettings = async () => {
  try {
    const data = await getStorageData(['sync_settings'])
    if (data.sync_settings) {
      syncSettings.value = { ...syncSettings.value, ...data.sync_settings }
    }
  } catch (error) {
    await handleError(error, 'settings-manager-load-sync')
  }
}

const getBackupTypeName = (type) => {
  const names = {
    full: 'Complete',
    settings: 'Settings',
    history: 'History'
  }
  return names[type] || type
}

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const showStatus = (message, type = 'info') => {
  statusMessage.value = message
  statusType.value = type
  
  // Auto-clear after 5 seconds
  setTimeout(clearStatus, 5000)
}

const clearStatus = () => {
  statusMessage.value = ''
  statusType.value = 'info'
}

// Lifecycle
onMounted(() => {
  loadRecentBackups()
  loadSyncSettings()
})
</script>

<style scoped>
.settings-manager {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px;
  max-height: 70vh;
  overflow-y: auto;
}

/* Section styles */
.manager-section {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 20px;
}

.section-header {
  margin-bottom: 16px;
}

.section-header h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.section-header p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

/* Action buttons */
.backup-actions,
.import-export-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--color-primary-dark);
      border-color: var(--color-primary-dark);
    }
  }
  
  &.secondary {
    border-color: var(--color-secondary);
    color: var(--color-secondary);
    
    &:hover:not(:disabled) {
      background: rgba(108, 117, 125, 0.1);
    }
  }
  
  &.outline {
    border-color: var(--color-primary);
    color: var(--color-primary);
    
    &:hover:not(:disabled) {
      background: rgba(33, 150, 243, 0.1);
    }
    
    &.active {
      background: var(--color-primary);
      color: white;
    }
  }
}

.btn-icon {
  font-size: 16px;
}

.dropdown-arrow {
  font-size: 10px;
  margin-left: 4px;
}

/* Export dropdown */
.export-dropdown {
  padding: 8px;
  min-width: 280px;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease;
  
  &:hover {
    background: var(--color-surface);
  }
}

.option-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.option-content {
  text-align: left;
}

.option-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 2px;
}

.option-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

.export-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 0;
}

/* Import/Export areas */
.import-export-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.import-area,
.export-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.import-info {
  margin-top: 4px;
}

.import-info small {
  color: var(--color-text-muted);
  font-size: 12px;
}

/* Backups list */
.backups-list {
  max-height: 300px;
  overflow-y: auto;
}

.empty-backups {
  text-align: center;
  padding: 32px;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: 12px;
}

.backup-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.backup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  transition: all 0.2s ease;
  
  &:hover {
    border-color: var(--color-primary);
    transform: translateY(-1px);
  }
  
  &.restoring {
    opacity: 0.7;
    pointer-events: none;
  }
}

.backup-info {
  flex: 1;
}

.backup-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.backup-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.backup-type {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  
  &.type-full {
    background: rgba(33, 150, 243, 0.1);
    color: var(--color-primary);
  }
  
  &.type-settings {
    background: rgba(255, 152, 0, 0.1);
    color: #ff9800;
  }
  
  &.type-history {
    background: rgba(76, 175, 80, 0.1);
    color: #4caf50;
  }
}

.backup-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}

.backup-description {
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
}

.backup-actions {
  display: flex;
  gap: 6px;
}

.backup-btn {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.restore-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.download-btn:hover:not(:disabled) {
  border-color: #4caf50;
  color: #4caf50;
}

.delete-btn:hover:not(:disabled) {
  border-color: #f44336;
  color: #f44336;
}

/* Sync settings */
.sync-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
}

.checkmark {
  width: 16px;
  height: 16px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

.setting-details {
  margin-left: 24px;
}

.frequency-select {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
}

/* Modal content */
.restore-options {
  padding: 16px;
}

.restore-info h4 {
  margin: 0 0 8px 0;
  color: var(--color-text);
}

.restore-choices {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
}

.restore-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
}

.choice-content {
  flex: 1;
}

.choice-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 2px;
}

.choice-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

.restore-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid #ff9800;
  border-radius: 6px;
  font-size: 13px;
  color: #f57c00;
}

.warning-icon {
  font-size: 16px;
}

/* Progress modal */
.progress-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  text-align: center;
}

.progress-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-surface);
  border-radius: 50%;
  border-top: 3px solid var(--color-primary);
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.progress-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 8px;
}

.progress-details {
  font-size: 13px;
  color: var(--color-text-muted);
}

/* Status message */
.status-message {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 1000;
  animation: slideInRight 0.3s ease;
  
  &.status-success {
    background: #4caf50;
    color: white;
  }
  
  &.status-error {
    background: #f44336;
    color: white;
  }
  
  &.status-info {
    background: var(--color-primary);
    color: white;
  }
}

.status-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  margin-left: 8px;
  
  &:hover {
    opacity: 0.8;
  }
}

/* Modal buttons */
.modal-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  margin: 0 4px;
  
  &.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--color-primary-dark);
    }
  }
  
  &.secondary:hover {
    background: var(--color-surface);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* Loading spinner */
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-radius: 50%;
  border-top: 2px solid currentColor;
  animation: spin 1s linear infinite;
  
  &.small {
    width: 12px;
    height: 12px;
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .import-export-actions {
    grid-template-columns: 1fr;
  }
  
  .backup-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .backup-actions {
    width: 100%;
    justify-content: flex-end;
  }
  
  .restore-choice {
    align-items: flex-start;
  }
}
</style>
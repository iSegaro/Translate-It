import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { runSettingsMigrations } from '@/shared/config/settingsMigrations.js';
import { CONFIG } from '@/shared/config/config.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'import-export');

// Version of the export format
const EXPORT_FORMAT_VERSION = '1.0.0';

/**
 * Import/Export Settings Store
 * Handles exporting user settings to file and importing settings from file with migration support
 */
export const useImportExportStore = defineStore('import-export', () => {
  // State
  const isExporting = ref(false)
  const isImporting = ref(false)
  const lastImportResult = ref(null)

  /**
   * Export all settings to a JSON file
   * @param {Object} options - Export options
   * @param {boolean} options.includeHistory - Include translation history (default: true)
   * @param {boolean} options.includeApiKeys - Include API keys (default: true)
   * @returns {Promise<Object>} Export result
   */
  const exportSettings = async (options = {}) => {
    const { includeHistory = true, includeApiKeys = true } = options
    isExporting.value = true

    try {
      // Get all settings from storage
      const allSettings = await storageManager.get({})

      // Filter settings based on options
      const exportedSettings = {}

      // Settings to exclude from export
      const excludeFromExport = []

      if (!includeHistory) {
        excludeFromExport.push('translationHistory')
      }

      if (!includeApiKeys) {
        excludeFromExport.push(
          'GEMINI_API_KEY',
          'OPENAI_API_KEY',
          'OPENROUTER_API_KEY',
          'DEEPSEEK_API_KEY',
          'DEEPL_API_KEY',
          'CUSTOM_API_KEY',
          'API_KEY' // Legacy Gemini Key
        )
      }

      // Copy all settings except excluded ones
      Object.keys(allSettings).forEach(key => {
        if (!excludeFromExport.includes(key)) {
          exportedSettings[key] = allSettings[key]
        }
      })

      // Create export file with metadata
      const exportData = {
        _meta: {
          version: EXPORT_FORMAT_VERSION,
          timestamp: Date.now(),
          date: new Date().toISOString(),
          exportedFrom: chrome?.runtime?.id || 'translate-it-extension'
        },
        settings: exportedSettings
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      // Format filename with date
      const date = new Date().toISOString().split('T')[0]
      a.download = `Translate-It_Settings_${date}.json`

      a.click()
      URL.revokeObjectURL(url)

      logger.info('Settings exported successfully', {
        settingsCount: Object.keys(exportedSettings).length,
        includeHistory,
        includeApiKeys
      })

      return { success: true, count: Object.keys(exportedSettings).length }
    } catch (error) {
      logger.error('Export error:', error)
      throw error
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Import settings from a JSON file with migration support
   * @param {File} file - The file to import
   * @param {Object} options - Import options
   * @param {boolean} options.merge - Merge with existing settings (default: false = replace)
   * @param {boolean} options.skipMigration - Skip settings migration (default: false)
   * @returns {Promise<Object>} Import result with migration info
   */
  const importSettings = async (file, options = {}) => {
    const { merge = false, skipMigration = false } = options
    isImporting.value = true
    lastImportResult.value = null

    try {
      const text = await file.text()
      const importData = JSON.parse(text)

      logger.debug('Importing settings from file:', {
        fileName: file.name,
        fileSize: file.size,
        hasMetadata: !!importData._meta
      })

      // Support both old format (direct settings) and new format (with _meta)
      let settingsToImport = importData._meta ? importData.settings : importData
      const metadata = importData._meta || { version: 'unknown' }

      // Get current settings for merge or migration
      const currentSettings = merge ? await storageManager.get({}) : {}

      // Merge settings if requested
      let finalSettings = merge ? { ...currentSettings, ...settingsToImport } : settingsToImport

      // Handle legacy API_KEY → GEMINI_API_KEY migration specifically for import
      // IMPORTANT: This must run BEFORE runSettingsMigrations because that sets API_KEY to ''
      const importMigrationLog = []

      // Check for API_KEY migration BEFORE running other migrations
      if ('API_KEY' in finalSettings && finalSettings.API_KEY && finalSettings.API_KEY.trim() !== '') {
        // Only migrate if GEMINI_API_KEY doesn't exist or is empty
        if (!finalSettings.GEMINI_API_KEY || finalSettings.GEMINI_API_KEY.trim() === '') {
          finalSettings.GEMINI_API_KEY = finalSettings.API_KEY
          importMigrationLog.push('Migrated legacy API_KEY to GEMINI_API_KEY')
          logger.info('Migrated legacy API_KEY to GEMINI_API_KEY during import')
        }

        // Always remove the old API_KEY from imported settings
        delete finalSettings.API_KEY
        importMigrationLog.push('Removed deprecated API_KEY setting')
      }

      // Run migrations unless explicitly skipped
      let migrationResult = null
      if (!skipMigration) {
        const result = await runSettingsMigrations(finalSettings)
        migrationResult = result

        // Apply migration updates
        if (Object.keys(result.updates).length > 0) {
          Object.assign(finalSettings, result.updates)
          logger.info('Settings migrations applied during import', {
            updatesCount: Object.keys(result.updates).length,
            logs: result.logs
          })
        }
      }

      // Ensure all CONFIG defaults are present (but preserve imported values)
      // Important: Don't overwrite API keys or sensitive data that was imported
      const PRESERVE_ON_IMPORT = [
        'GEMINI_API_KEY',
        'OPENAI_API_KEY',
        'OPENROUTER_API_KEY',
        'DEEPSEEK_API_KEY',
        'DEEPL_API_KEY',
        'CUSTOM_API_KEY',
        'translationHistory',
        'EXCLUDED_SITES'
      ]

      Object.keys(CONFIG).forEach(key => {
        // Only add missing keys if they weren't imported
        if (!(key in finalSettings)) {
          finalSettings[key] = CONFIG[key]
          importMigrationLog.push(`Added missing setting: ${key}`)
        } else if (PRESERVE_ON_IMPORT.includes(key) && finalSettings[key] && finalSettings[key].trim() !== '') {
          logger.debug(`Preserving imported value for ${key}`)
        }
      })

      // Save to storage
      await storageManager.set(finalSettings)

      // Compile result
      const result = {
        success: true,
        settingsImported: Object.keys(settingsToImport).length,
        settingsFinal: Object.keys(finalSettings).length,
        migrationApplied: !!migrationResult && Object.keys(migrationResult.updates).length > 0,
        migrationLogs: [...(migrationResult?.logs || []), ...importMigrationLog],
        mergeMode: merge,
        sourceVersion: metadata.version
      }

      lastImportResult.value = result

      logger.info('Settings imported successfully', result)

      // Trigger settings refresh across all contexts
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'SETTINGS_UPDATED'
        }).catch(() => {
          // Ignore errors from sendMessage
          logger.debug('Settings update message sent (some contexts may not be active)')
        })
      }

      return result
    } catch (error) {
      logger.error('Import error:', error)

      const errorResult = {
        success: false,
        error: error.message,
        fileName: file.name
      }

      lastImportResult.value = errorResult
      throw error
    } finally {
      isImporting.value = false
    }
  }

  /**
   * Validate a settings file before importing
   * @param {File} file - The file to validate
   * @returns {Promise<Object>} Validation result
   */
  const validateImportFile = async (file) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      // Check if it looks like a settings file
      const settings = data._meta ? data.settings : data

      const validation = {
        valid: true,
        settingsCount: Object.keys(settings).length,
        hasMetadata: !!data._meta,
        version: data._meta?.version || 'unknown',
        hasApiKeys: !!(
          settings.GEMINI_API_KEY ||
          settings.OPENAI_API_KEY ||
          settings.OPENROUTER_API_KEY ||
          settings.DEEPSEEK_API_KEY ||
          settings.DEEPL_API_KEY ||
          settings.CUSTOM_API_KEY ||
          settings.API_KEY // Legacy
        ),
        hasHistory: !!settings.translationHistory,
        warnings: []
      }

      // Check for legacy API_KEY
      if (settings.API_KEY) {
        validation.warnings.push('Contains legacy API_KEY setting (will be migrated to GEMINI_API_KEY)')
      }

      return validation
    } catch (error) {
      return {
        valid: false,
        error: error.message
      }
    }
  }

  return {
    // State
    isExporting,
    isImporting,
    lastImportResult,

    // Actions
    exportSettings,
    importSettings,
    validateImportFile
  }
})
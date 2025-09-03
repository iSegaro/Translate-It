import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'backup');

export const useBackupStore = defineStore('backup', () => {
  // State
  const backups = ref([])
  const isCreatingBackup = ref(false)
  const isRestoringBackup = ref(false)
  
  // Actions
  const createBackup = async (name = '') => {
    isCreatingBackup.value = true
    try {
      const backup = {
        id: crypto.randomUUID(),
        name: name || `Backup ${new Date().toLocaleString()}`,
        timestamp: Date.now(),
        data: {
          settings: {},
          history: [],
          apiKeys: {}
        }
      }
      
      backups.value.unshift(backup)
      
      return { success: true, backup }
    } catch (error) {
      logger.error('Backup creation error:', error)
      throw error
    } finally {
      isCreatingBackup.value = false
    }
  }
  
  const restoreBackup = async (backupId) => {
    isRestoringBackup.value = true
    try {
      const backup = backups.value.find(b => b.id === backupId)
      if (!backup) {
        throw new Error('Backup not found')
      }
      
      // Mock restore functionality
      logger.debug('Restoring backup:', backup)
      
      return { success: true, backup }
    } catch (error) {
      logger.error('Backup restore error:', error)
      throw error
    } finally {
      isRestoringBackup.value = false
    }
  }
  
  const deleteBackup = (backupId) => {
    const index = backups.value.findIndex(b => b.id === backupId)
    if (index !== -1) {
      backups.value.splice(index, 1)
    }
  }
  
  return {
    // State
    backups,
    isCreatingBackup,
    isRestoringBackup,
    
    // Actions
    createBackup,
    restoreBackup,
    deleteBackup
  }
})
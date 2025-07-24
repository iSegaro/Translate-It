// Core stores that are always loaded
export { useSettingsStore } from './settings.js'

// Export all core stores for easy importing
export const coreStores = {
  settings: () => import('./settings.js').then(m => m.useSettingsStore)
}
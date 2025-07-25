// Utility for loading settings modules
// Separated from main options.js to avoid circular imports

export const loadSettingsModules = async () => {
  try {
    console.log('🔧 Loading settings modules...')
    
    const [providers, importExport, backup] = await Promise.all([
      import('@/store/modules/providers.js').catch(e => {
        console.warn('Failed to load providers module:', e.message)
        return null
      }),
      import('@/store/modules/import-export.js').catch(e => {
        console.warn('Failed to load import-export module:', e.message)
        return null
      }),
      import('@/store/modules/backup.js').catch(e => {
        console.warn('Failed to load backup module:', e.message)
        return null
      })
    ])
    
    console.log('✅ Settings modules loaded:', {
      providers: !!providers,
      importExport: !!importExport,
      backup: !!backup
    })
    
    return { providers, importExport, backup }
  } catch (error) {
    console.error('❌ Failed to load settings modules:', error)
    throw error
  }
}
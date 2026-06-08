import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, nextTick, reactive } from 'vue'
import { useLanguageDefaults } from './useLanguageDefaults.js'

let mockSettingsStore

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}))

describe('useLanguageDefaults', () => {
  beforeEach(() => {
    mockSettingsStore = reactive({
      settings: {
        SOURCE_LANGUAGE: 'auto',
        TARGET_LANGUAGE: 'en'
      },
      isInitialized: false,
      updateSettingAndPersist: vi.fn(async (key, value) => {
        mockSettingsStore.settings[key] = value
        return true
      }),
      updateSettingLocally: vi.fn((key, value) => {
        mockSettingsStore.settings[key] = value
      })
    })
  })

  const useDeferredPersistence = () => {
    const persistCalls = []

    mockSettingsStore.updateSettingAndPersist = vi.fn((key, value) => {
      mockSettingsStore.settings[key] = value
      let resolve
      let reject

      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })

      persistCalls.push({ key, value, resolve, reject })
      return promise
    })

    return persistCalls
  }

  const withSetup = () => {
    let result
    const app = createApp({
      setup() {
        result = useLanguageDefaults()
        return () => null
      }
    })
    const host = document.createElement('div')
    app.mount(host)
    return result
  }

  it('exposes saved defaults from settings store', async () => {
    const composable = withSetup()
    await nextTick()

    expect(composable.savedSourceLanguage.value).toBe('auto')
    expect(composable.savedTargetLanguage.value).toBe('en')
  })

  it('persists SOURCE_LANGUAGE', async () => {
    const composable = withSetup()
    await composable.setSourceLanguageAsDefault('fr')

    expect(mockSettingsStore.updateSettingAndPersist).toHaveBeenCalledWith('SOURCE_LANGUAGE', 'fr')
    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('fr')
    expect(composable.savedSourceLanguage.value).toBe('fr')
  })

  it('persists TARGET_LANGUAGE', async () => {
    const composable = withSetup()
    await composable.setTargetLanguageAsDefault('de')

    expect(mockSettingsStore.updateSettingAndPersist).toHaveBeenCalledWith('TARGET_LANGUAGE', 'de')
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('de')
    expect(composable.savedTargetLanguage.value).toBe('de')
  })

  it('rolls back a failed single request to the previous value', async () => {
    const composable = withSetup()
    const persistCalls = useDeferredPersistence()
    const request = composable.setSourceLanguageAsDefault('fr')

    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('fr')
    expect(persistCalls).toHaveLength(1)

    persistCalls[0].reject(new Error('save failed'))

    await expect(request).rejects.toThrow('save failed')
    await nextTick()

    expect(mockSettingsStore.updateSettingLocally).toHaveBeenCalledWith('SOURCE_LANGUAGE', 'auto')
    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('auto')
  })

  it('does not roll back an older failed SOURCE_LANGUAGE request over a newer success', async () => {
    const composable = withSetup()
    const persistCalls = useDeferredPersistence()
    const olderRequest = composable.setSourceLanguageAsDefault('fr')
    const newerRequest = composable.setSourceLanguageAsDefault('de')

    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('de')
    expect(persistCalls).toHaveLength(2)

    persistCalls[1].resolve(true)
    await newerRequest

    persistCalls[0].reject(new Error('older request failed'))
    await expect(olderRequest).rejects.toThrow('older request failed')
    await nextTick()

    expect(mockSettingsStore.updateSettingLocally).not.toHaveBeenCalled()
    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('de')
  })

  it('keeps SOURCE_LANGUAGE and TARGET_LANGUAGE requests independent', async () => {
    const composable = withSetup()
    const persistCalls = useDeferredPersistence()
    const sourceRequest = composable.setSourceLanguageAsDefault('fr')
    const targetRequest = composable.setTargetLanguageAsDefault('de')

    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('fr')
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('de')
    expect(persistCalls).toHaveLength(2)

    persistCalls[1].resolve(true)
    await targetRequest

    persistCalls[0].reject(new Error('source request failed'))
    await expect(sourceRequest).rejects.toThrow('source request failed')
    await nextTick()

    expect(mockSettingsStore.updateSettingLocally).toHaveBeenCalledWith('SOURCE_LANGUAGE', 'auto')
    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('auto')
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('de')
  })

  it('isReady follows settingsStore.isInitialized', async () => {
    const composable = withSetup()

    expect(composable.isReady.value).toBe(false)

    mockSettingsStore.isInitialized = true
    await nextTick()

    expect(composable.isReady.value).toBe(true)
  })
})

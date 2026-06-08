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

  it('isReady follows settingsStore.isInitialized', async () => {
    const composable = withSetup()

    expect(composable.isReady.value).toBe(false)

    mockSettingsStore.isInitialized = true
    await nextTick()

    expect(composable.isReady.value).toBe(true)
  })
})

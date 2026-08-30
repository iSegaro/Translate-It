import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from './useUnifiedI18n.js'

const { storageManagerMock, i18nUtilsMock } = vi.hoisted(() => ({
  storageManagerMock: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn()
  },
  i18nUtilsMock: {
    getI18nUtils: vi.fn(),
    clearTranslationCache: vi.fn().mockResolvedValue(undefined),
    setI18nLocale: vi.fn()
  }
}))

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: storageManagerMock
}))

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: i18nUtilsMock
}))

describe('useUnifiedI18n', () => {
  let pinia
  let i18n
  let store
  let wrapper
  let composables

  const createHarness = async (options = {}) => {
    const { initialized = true, instances = 1 } = options
    const storedLocale = Object.hasOwn(options, 'storedLocale') ? options.storedLocale : 'en'

    pinia = createPinia()
    setActivePinia(pinia)

    storageManagerMock.get.mockResolvedValue(
      storedLocale === undefined ? {} : { APPLICATION_LOCALIZE: storedLocale }
    )
    store = useSettingsStore()
    await store.loadSettings()
    store.settings.APPLICATION_LOCALIZE = storedLocale
    store.isInitialized = initialized

    i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      messages: {
        en: { greeting: 'Hello' },
        fa: { greeting: 'Farsi' },
        ja: { greeting: 'Japanese' }
      }
    })

    i18nUtilsMock.setI18nLocale.mockImplementation(async localeCode => {
      i18n.global.locale.value = localeCode
    })
    i18nUtilsMock.getI18nUtils.mockResolvedValue({
      clearTranslationCache: i18nUtilsMock.clearTranslationCache,
      setI18nLocale: i18nUtilsMock.setI18nLocale,
      getTranslationString: vi.fn()
    })

    composables = []
    const TestComponent = defineComponent({
      setup() {
        for (let index = 0; index < instances; index += 1) {
          composables.push(useUnifiedI18n())
        }
        return () => h('div')
      }
    })

    wrapper = mount(TestComponent, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    await flushPromises()
    return { composables, i18n, store }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    i18nUtilsMock.clearTranslationCache.mockResolvedValue(undefined)
    i18nUtilsMock.setI18nLocale.mockReset()
    i18nUtilsMock.getI18nUtils.mockReset()
    storageManagerMock.get.mockResolvedValue({ APPLICATION_LOCALIZE: 'en' })
    storageManagerMock.set.mockResolvedValue(undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
    store?.cleanupStoreResources()
    setActivePinia(undefined)
  })

  it('derives and synchronizes a valid initial locale from Pinia', async () => {
    const { composables, i18n: activeI18n } = await createHarness({ storedLocale: 'fa' })

    expect(composables[0].locale.value).toBe('fa')
    expect(activeI18n.global.locale.value).toBe('fa')
    expect(i18nUtilsMock.setI18nLocale).toHaveBeenCalledWith('fa')
  })

  it.each([undefined, null, '', 42])('keeps fallback semantics for invalid locale %s', async storedLocale => {
    const { composables, i18n: activeI18n } = await createHarness({ storedLocale })

    expect(composables[0].locale.value).toBe('en')
    expect(activeI18n.global.locale.value).toBe('en')
    expect(i18nUtilsMock.setI18nLocale).not.toHaveBeenCalled()
  })

  it('preserves normalization for an unsupported locale code', async () => {
    const { composables, i18n: activeI18n } = await createHarness({ storedLocale: 'XX' })

    expect(composables[0].locale.value).toBe('xx')
    expect(activeI18n.global.locale.value).toBe('xx')
    expect(i18nUtilsMock.setI18nLocale).toHaveBeenCalledWith('xx')
  })

  it('syncs external Pinia locale changes without persisting them', async () => {
    const { composables, i18n: activeI18n, store: activeStore } = await createHarness()

    const persistSpy = vi.spyOn(activeStore, 'updateSettingAndPersist')
    activeStore.settings.APPLICATION_LOCALIZE = 'fa'
    await nextTick()
    await flushPromises()

    expect(composables[0].locale.value).toBe('fa')
    expect(activeI18n.global.locale.value).toBe('fa')
    expect(persistSpy).not.toHaveBeenCalled()
  })

  it.each([undefined, null, '', 42])('syncs external invalid locale %s to en without persisting', async newLocale => {
    const { composables, i18n: activeI18n, store: activeStore } = await createHarness({ storedLocale: 'fa' })

    const persistSpy = vi.spyOn(activeStore, 'updateSettingAndPersist')
    activeStore.settings.APPLICATION_LOCALIZE = newLocale
    await nextTick()
    await flushPromises()

    expect(composables[0].locale.value).toBe('en')
    expect(activeI18n.global.locale.value).toBe('en')
    expect(i18nUtilsMock.setI18nLocale).toHaveBeenCalledTimes(2)
    expect(i18nUtilsMock.setI18nLocale).toHaveBeenLastCalledWith('en')
    expect(persistSpy).not.toHaveBeenCalled()
  })

  it('persists canonical locale and updates Vue i18n through changeLanguage', async () => {
    const { composables, i18n: activeI18n, store: activeStore } = await createHarness()

    const persistSpy = vi.spyOn(activeStore, 'updateSettingAndPersist')
    await composables[0].changeLanguage('Farsi')
    await flushPromises()

    expect(persistSpy).toHaveBeenCalledWith('APPLICATION_LOCALIZE', 'fa')
    expect(activeStore.settings.APPLICATION_LOCALIZE).toBe('fa')
    expect(activeI18n.global.locale.value).toBe('fa')
    expect(composables[0].locale.value).toBe('fa')
  })

  it('shares locale changes across instances without duplicate persistence or locale sync', async () => {
    const { composables, i18n: activeI18n, store: activeStore } = await createHarness({ instances: 2 })

    const persistSpy = vi.spyOn(activeStore, 'updateSettingAndPersist')
    activeStore.settings.APPLICATION_LOCALIZE = 'fa'
    await nextTick()
    await flushPromises()

    expect(composables[0].locale.value).toBe('fa')
    expect(composables[1].locale.value).toBe('fa')
    expect(activeI18n.global.locale.value).toBe('fa')
    expect(i18nUtilsMock.setI18nLocale).toHaveBeenCalledTimes(1)
    expect(persistSpy).not.toHaveBeenCalled()

    await composables[0].changeLanguage('ja')
    await flushPromises()
    expect(persistSpy).toHaveBeenCalledTimes(1)
  })
})

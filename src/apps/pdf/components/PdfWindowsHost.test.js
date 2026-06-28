import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ref } from 'vue'

const eventHandlers = {}
const unsubscribeMocks = []
let windowsManagerImported = false
const storageSetMock = vi.fn(async (data) => {
  globalThis.__pdfWindowsHostStorageState = {
    ...(globalThis.__pdfWindowsHostStorageState || {}),
    ...data
  }
  return true
})

const sendRegularMessageMock = vi.fn()

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageCore: {
    get: vi.fn(async (keys) => {
      const state = globalThis.__pdfWindowsHostStorageState || {}

      if (typeof keys === 'string') {
        return { [keys]: state[keys] }
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, state[key]]))
      }

      if (keys && typeof keys === 'object') {
        return Object.fromEntries(
          Object.entries(keys).map(([key, fallback]) => [
            key,
            state[key] ?? fallback
          ])
        )
      }

      return { ...state }
    }),
    set: storageSetMock,
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    on: vi.fn((event, handler) => {
      eventHandlers[event] = handler
      const unsubscribe = vi.fn()
      unsubscribeMocks.push(unsubscribe)
      return unsubscribe
    }),
    emit: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: sendRegularMessageMock
}))

const getEffectiveProviderAsyncMock = vi.fn(async () => 'googlev2')
const getTargetLanguageAsyncMock = vi.fn(async () => 'fa')

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    PDF: 'pdf-translation',
    Selection: 'selection-manager',
    Dictionary_Translation: 'dictionary',
    LEGACY_DICTIONARY: 'legacy-dictionary'
  },
  getEffectiveProviderAsync: getEffectiveProviderAsyncMock,
  getSourceLanguageAsync: vi.fn(async () => 'auto'),
  getTargetLanguageAsync: getTargetLanguageAsyncMock
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key
  })
}))

vi.mock('@/composables/shared/useTextDirection.js', () => ({
  useTextDirection: (contentRef) => {
    const text = typeof contentRef?.value === 'string' ? contentRef.value : ''
    const rtlCount = (text.match(/[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length
    const direction = rtlCount > 0 ? 'rtl' : 'ltr'

    return {
      direction: ref(direction),
      textAlign: ref(direction === 'rtl' ? 'right' : 'left')
    }
  }
}))

vi.mock('@/composables/shared/useFont.js', () => ({
  useFont: () => ({
    fontStyles: ref({}),
    cssVariables: ref({})
  })
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    isDarkTheme: false
  })
}))

vi.mock('@/components/shared/ActionToolbar.vue', () => ({
  default: {
    name: 'ActionToolbar',
    template: '<div class="action-toolbar-stub" />'
  }
}))

vi.mock('@/components/base/LoadingSpinner.vue', () => ({
  default: {
    name: 'LoadingSpinner',
    template: '<div class="loading-spinner-stub" />'
  }
}))

vi.mock('@/components/shared/TTSButton.vue', () => ({
  default: {
    name: 'TTSButton',
    props: ['text', 'language', 'disabled', 'isDictionary'],
    template: '<button class="tts-button-stub" :data-text="text" :data-language="language" :data-dictionary="isDictionary" :disabled="disabled">{{ text }}</button>'
  }
}))

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    props: ['modelValue', 'mode', 'isGlobal', 'allowDefault', 'allowSetDefault', 'onlyConfigured', 'requiredFeature', 'disabled'],
    emits: ['update:modelValue', 'provider-change'],
    template: `
      <div
        class="provider-selector-stub"
        :data-mode="mode"
        :data-is-global="isGlobal"
        :data-allow-default="allowDefault"
        :data-allow-set-default="allowSetDefault"
        :data-only-configured="onlyConfigured"
        :data-required-feature="requiredFeature"
      >
        <select
          data-testid="translation-window-toolbar-provider-select"
          :value="modelValue"
          :disabled="disabled"
          @change="$emit('update:modelValue', $event.target.value)"
        >
          <option value="googlev2">googlev2</option>
          <option value="deepl">deepl</option>
          <option value="openai">openai</option>
        </select>
      </div>
    `
  }
}))

vi.mock('@/features/windows/composables/useWindowsManager.js', () => {
  windowsManagerImported = true
  return {
    useWindowsManager: vi.fn()
  }
})

const { default: PdfWindowsHost } = await import('./PdfWindowsHost.vue')

function emitSelection(detail) {
  eventHandlers['global-selection-change']?.(detail)
}

function emitSelectionClear(detail = {}) {
  eventHandlers['global-selection-clear']?.(detail)
}

async function showSelectionIcon(text, position = { x: 120, y: 180, width: 90, height: 18 }) {
  emitSelection({
    text,
    position,
    context: { source: 'pdf-viewer', isPdf: true }
  })
  await flushPromises()
}

async function openWindowFromSelectionIcon(wrapper) {
  const icon = wrapper.get('[data-testid="pdf-translation-icon"]')
  await icon.trigger('pointerdown')
  await flushPromises()
  await icon.trigger('click')
  await flushPromises()
}

function dispatchPointerEvent(target, type, options = {}) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options
  }))
}

describe('PdfWindowsHost', () => {
  let wrapper
  let addEventListenerSpy
  let removeEventListenerSpy
  let windowAddEventListenerSpy
  let windowRemoveEventListenerSpy
  let clipboardWriteTextMock

  beforeEach(async () => {
    windowsManagerImported = false
    globalThis.__pdfWindowsHostStorageState = {
      pdfWindowsHostLayout: {
        version: 1,
        global: {
          isPinned: false,
          dockMode: 'none',
          dockedWidth: 420,
          defaultPosition: { x: 72, y: 72 }
        },
        documents: {}
      }
    }
    sendRegularMessageMock.mockReset()
    sendRegularMessageMock.mockResolvedValue({ success: true, translatedText: 'Translated text' })
    getEffectiveProviderAsyncMock.mockClear()
    getTargetLanguageAsyncMock.mockClear()
    storageSetMock.mockClear()

    Object.keys(eventHandlers).forEach((key) => {
      delete eventHandlers[key]
    })
    unsubscribeMocks.length = 0

    clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock
      }
    })

    addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
    windowAddEventListenerSpy = vi.spyOn(window, 'addEventListener')
    windowRemoveEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    wrapper = mount(PdfWindowsHost, {
      props: {
        pdfFingerprint: 'pdf-doc-1'
      },
      attachTo: document.body
    })
    await flushPromises()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  it('opens for PDF selection events and ignores non-PDF selections', async () => {
    let resolveTranslation
    sendRegularMessageMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTranslation = resolve
    }))

    emitSelection({
      text: 'PDF text',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'web-page', isPdf: false }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(false)

    await showSelectionIcon('PDF text')

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)
    expect(sendRegularMessageMock).not.toHaveBeenCalled()

    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)
    expect(wrapper.find('.pdf-windows-host__source').exists()).toBe(false)
    expect(wrapper.find('[data-testid="translation-window-toolbar-original"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('PDF text')

    resolveTranslation({
      success: true,
      translatedText: 'Translated text'
    })
    await flushPromises()
  })

  it('keeps the selection icon transition alive until the icon click opens the window', async () => {
    await showSelectionIcon('Transition me')

    const icon = wrapper.get('[data-testid="pdf-translation-icon"]')
    await icon.trigger('pointerdown')
    emitSelectionClear({
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)

    await icon.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)
    expect(sendRegularMessageMock).toHaveBeenCalledTimes(1)
  })

  it('renders TTS for selected source text after the icon opens the window and hides it when there is no speakable text', async () => {
    let resolveTranslation
    sendRegularMessageMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTranslation = resolve
    }))

    expect(wrapper.find('[data-testid="translation-window-toolbar-tts"]').exists()).toBe(false)

    await showSelectionIcon('Speak me')
    expect(wrapper.find('[data-testid="translation-window-toolbar-tts"]').exists()).toBe(false)

    await openWindowFromSelectionIcon(wrapper)

    const ttsButton = wrapper.get('[data-testid="translation-window-toolbar-tts"]')
    expect(ttsButton.exists()).toBe(true)
    expect(ttsButton.attributes('data-text')).toBe('Speak me')

    resolveTranslation({
      success: true,
      translatedText: 'Translated text'
    })
    await flushPromises()
  })

  it('toggles the original source text visibility and switches TTS input between source and translated text', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Translated result',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Toggle me')
    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('Translated result')

    await wrapper.get('[data-testid="translation-window-toolbar-original"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.pdf-windows-host__source').exists()).toBe(true)
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('Toggle me')

    await wrapper.get('[data-testid="translation-window-toolbar-copy"]').trigger('click')
    await flushPromises()

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('Translated result')
    expect(clipboardWriteTextMock).not.toHaveBeenCalledWith('Toggle me')

    await wrapper.get('[data-testid="translation-window-toolbar-original"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.pdf-windows-host__source').exists()).toBe(false)
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('Translated result')
    expect(storageSetMock).not.toHaveBeenCalled()
  })

  it('renders the detected language badge after a successful translation', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Detected language result',
      sourceLanguage: 'en',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Detect me')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    const badge = wrapper.get('[data-testid="translation-window-toolbar-detected-language"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('English')
  })

  it('renders the target language badge after translation and updates it on the next translation when the target language changes', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Target language result',
      sourceLanguage: 'en',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Target me')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    const targetBadge = wrapper.get('[data-testid="translation-window-toolbar-target-language"]')
    expect(targetBadge.exists()).toBe(true)
    expect(targetBadge.text()).toBe('Persian (Farsi)')

    getTargetLanguageAsyncMock.mockResolvedValueOnce('ja')
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Updated target result',
      sourceLanguage: 'en',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Target update me', { x: 150, y: 210, width: 90, height: 18 })
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    expect(wrapper.get('[data-testid="translation-window-toolbar-target-language"]').text()).toBe('Japanese')
  })

  it('hides the target language badge for auto or unknown target language values', async () => {
    getTargetLanguageAsyncMock.mockResolvedValueOnce('auto')
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Auto target result',
      sourceLanguage: 'en',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Auto target')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="translation-window-toolbar-target-language"]').exists()).toBe(false)

    wrapper.unmount()
    wrapper = mount(PdfWindowsHost, {
      props: {
        pdfFingerprint: 'pdf-doc-1'
      },
      attachTo: document.body
    })
    await flushPromises()

    getTargetLanguageAsyncMock.mockResolvedValueOnce('xx-unknown')
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Unknown target result',
      sourceLanguage: 'en',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Unknown target')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="translation-window-toolbar-target-language"]').exists()).toBe(false)
  })

  it('prefers detectedSourceLanguage over sourceLanguage when rendering the badge', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Preferred detected result',
      sourceLanguage: 'en',
      detectedSourceLanguage: 'fa',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Prefer me')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    const badge = wrapper.get('[data-testid="translation-window-toolbar-detected-language"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('Persian (Farsi)')
  })

  it('hides the detected language badge for missing or auto source language values', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Auto source result',
      sourceLanguage: 'auto',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Auto me')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="translation-window-toolbar-detected-language"]').exists()).toBe(false)
  })

  it('hides the detected language badge for unknown or invalid source language values', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Unknown source result',
      sourceLanguage: 'xx-unknown',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Unknown me')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="translation-window-toolbar-detected-language"]').exists()).toBe(false)
  })

  it('resets the original text toggle on a new selection', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Translated once',
      mode: 'selection-manager'
    })

    await showSelectionIcon('First selection')
    await openWindowFromSelectionIcon(wrapper)
    await wrapper.get('[data-testid="translation-window-toolbar-original"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.pdf-windows-host__source').exists()).toBe(true)

    await showSelectionIcon('Second selection', { x: 140, y: 200, width: 90, height: 18 })
    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)

    await openWindowFromSelectionIcon(wrapper)
    expect(wrapper.find('.pdf-windows-host__source').exists()).toBe(false)
    expect(wrapper.find('[data-testid="translation-window-toolbar-detected-language"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('Translated text')
  })

  it('initializes the local provider switcher from PDF provider resolution', async () => {
    wrapper.unmount()
    wrapper = null
    getEffectiveProviderAsyncMock.mockClear()
    getEffectiveProviderAsyncMock.mockResolvedValueOnce('deepl')

    wrapper = mount(PdfWindowsHost, {
      props: {
        pdfFingerprint: 'pdf-doc-1'
      },
      attachTo: document.body
    })
    await showSelectionIcon('Initial provider')

    expect(getEffectiveProviderAsyncMock).toHaveBeenCalledWith('pdf-translation')
    expect(wrapper.find('[data-testid="translation-window-toolbar-provider-selector"]').exists()).toBe(false)

    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-selector"]').attributes('data-mode')).toBe('icon-only')
    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-selector"]').attributes('data-is-global')).toBe('false')
    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-selector"]').attributes('data-allow-default')).toBe('false')
    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-selector"]').attributes('data-allow-set-default')).toBe('false')
    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-select"]').element.value).toBe('deepl')
  })

  it('does not render explicit dock buttons', async () => {
    await showSelectionIcon('No dock buttons')
    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.find('[data-testid="pdf-windows-host-dock-left"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host-dock-right"]').exists()).toBe(false)
  })

  it('updates only the local provider selection and does not auto-translate', async () => {
    await showSelectionIcon('Provider switch')
    await openWindowFromSelectionIcon(wrapper)
    sendRegularMessageMock.mockClear()

    const providerSelect = wrapper.get('[data-testid="translation-window-toolbar-provider-select"]')
    await providerSelect.setValue('deepl')
    await flushPromises()

    expect(providerSelect.element.value).toBe('deepl')
    expect(sendRegularMessageMock).not.toHaveBeenCalled()
    expect(storageSetMock).not.toHaveBeenCalled()
    expect(globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout).toBeDefined()
  })

  it('handles provider-change events with the same local-only handler', async () => {
    await showSelectionIcon('Provider contract')
    await openWindowFromSelectionIcon(wrapper)
    sendRegularMessageMock.mockClear()

    const providerSelector = wrapper.findComponent({ name: 'ProviderSelector' })
    providerSelector.vm.$emit('provider-change', 'openai')
    await flushPromises()

    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-select"]').element.value).toBe('openai')
    expect(sendRegularMessageMock).not.toHaveBeenCalled()
    expect(storageSetMock).not.toHaveBeenCalled()
  })

  it('renders normal markdown translation results through SafeMarkdownPreview and cleans copy/TTS input', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Normal **bold** text',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Hello PDF')
    await openWindowFromSelectionIcon(wrapper)

    expect(sendRegularMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TRANSLATE',
      context: 'pdf-translation',
      data: expect.objectContaining({
        text: 'Hello PDF',
        provider: 'googlev2',
        sourceLanguage: 'auto',
        targetLanguage: 'fa',
        mode: 'selection-manager',
        isExplicitProvider: true
      })
    }))
    expect(sendRegularMessageMock.mock.calls[0][0].data.enableDictionary).toBeUndefined()
    expect(getEffectiveProviderAsyncMock).toHaveBeenCalledWith('pdf-translation')
    expect(getTargetLanguageAsyncMock).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(false)
    const result = wrapper.get('[data-testid="pdf-windows-host-result"]')
    expect(result.find('.simple-markdown').exists()).toBe(true)
    expect(result.text()).toContain('Normal')
    expect(result.text()).toContain('bold')
    expect(result.text()).not.toContain('**')
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-dictionary')).toBe('false')
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('Normal **bold** text')

    await wrapper.get('[data-testid="translation-window-toolbar-copy"]').trigger('click')
    await flushPromises()

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('Normal bold text')
  })

  it('keeps shared TranslationDisplay toolbar actions out of PdfWindowsHost while preserving PDF-local actions', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Toolbar parity check',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Toolbar check')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()

    expect(wrapper.find('.action-toolbar-stub').exists()).toBe(false)
    expect(wrapper.find('[data-testid="translation-window-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="translation-window-toolbar-copy"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pdf-windows-host-retry"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="translation-window-toolbar-tts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="translation-window-toolbar-provider-selector"]').exists()).toBe(true)
  })

  it('uses the currently selected local provider for the next translation and retry actions', async () => {
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: 'Translated with local provider',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Provider selected text')
    await openWindowFromSelectionIcon(wrapper)

    await wrapper.get('[data-testid="translation-window-toolbar-provider-select"]').setValue('deepl')
    await flushPromises()
    sendRegularMessageMock.mockClear()

    await showSelectionIcon('Provider selected text 2', { x: 150, y: 210, width: 90, height: 18 })
    await flushPromises()
    await openWindowFromSelectionIcon(wrapper)

    expect(sendRegularMessageMock).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider: 'deepl',
        mode: 'selection-manager'
      })
    }))

    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Retry with selected provider',
      mode: 'selection-manager'
    })

    await wrapper.get('[data-testid="pdf-windows-host-retry"]').trigger('click')
    await flushPromises()

    expect(sendRegularMessageMock).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider: 'deepl',
        mode: 'selection-manager'
      })
    }))
  })

  it('clears stale translation state when the provider changes', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Stale result',
      sourceLanguage: 'en',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Clear me')
    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.find('[data-testid="pdf-windows-host-result"]').text()).toContain('Stale result')
    expect(wrapper.get('[data-testid="translation-window-toolbar-detected-language"]').text()).toBe('English')
    sendRegularMessageMock.mockClear()

    const providerSelector = wrapper.findComponent({ name: 'ProviderSelector' })
    providerSelector.vm.$emit('update:modelValue', 'deepl')
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host-result"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="translation-window-toolbar-detected-language"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="translation-window-toolbar-provider-select"]').element.value).toBe('deepl')
    expect(sendRegularMessageMock).not.toHaveBeenCalled()
  })

  it('keeps plain text output readable through SafeMarkdownPreview', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Plain translated text',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Plain source')
    await openWindowFromSelectionIcon(wrapper)

    const result = wrapper.get('[data-testid="pdf-windows-host-result"]')
    expect(result.find('.simple-markdown').exists()).toBe(true)
    expect(result.text()).toBe('Plain translated text')
  })

  it('renders dictionary-formatted translation results without raw markdown artifacts', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: '**Noun**: hello\n- a greeting',
      mode: 'dictionary'
    })

    await showSelectionIcon('hello')
    await openWindowFromSelectionIcon(wrapper)

    const result = wrapper.get('[data-testid="pdf-windows-host-result"]')
    expect(result.find('.simple-markdown').exists()).toBe(true)
    expect(result.text()).toContain('Noun')
    expect(result.text()).toContain('hello')
    expect(result.text()).toContain('a greeting')
    expect(result.text()).not.toContain('**')
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-dictionary')).toBe('true')
    expect(wrapper.get('[data-testid="translation-window-toolbar-tts"]').attributes('data-text')).toBe('**Noun**: hello\n- a greeting')
  })

  it('renders errors and retries using the current selected text', async () => {
    sendRegularMessageMock
      .mockResolvedValueOnce({
        success: false,
        error: { message: 'Provider unavailable' }
      })
      .mockResolvedValueOnce({
        success: true,
        translatedText: 'Recovered result'
      })

    await showSelectionIcon('Retry me')
    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.find('[data-testid="pdf-windows-host-error"]').text()).toContain('Provider unavailable')

    await wrapper.get('[data-testid="pdf-windows-host-retry"]').trigger('click')
    await flushPromises()

    expect(sendRegularMessageMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        text: 'Retry me'
      })
    }))
    expect(sendRegularMessageMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        text: 'Retry me'
      })
    }))
    expect(wrapper.find('[data-testid="pdf-windows-host-result"]').text()).toContain('Recovered result')
  })

  it('updates the detected language badge on retry using the latest response', async () => {
    sendRegularMessageMock
      .mockResolvedValueOnce({
        success: false,
        error: { message: 'Provider unavailable' }
      })
      .mockResolvedValueOnce({
        success: true,
        translatedText: 'Recovered result',
        detectedSourceLanguage: 'fa'
      })

    await showSelectionIcon('Retry badge')
    await openWindowFromSelectionIcon(wrapper)

    expect(wrapper.find('[data-testid="translation-window-toolbar-detected-language"]').exists()).toBe(false)

    await wrapper.get('[data-testid="pdf-windows-host-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="translation-window-toolbar-detected-language"]').text()).toBe('Persian (Farsi)')
  })

  it('copies a normal markdown translation as cleaned plain text', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Copy **this** text',
      mode: 'selection-manager'
    })

    await showSelectionIcon('Copy me')
    await openWindowFromSelectionIcon(wrapper)

    await wrapper.get('[data-testid="translation-window-toolbar-copy"]').trigger('click')
    await flushPromises()

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('Copy this text')
    expect(wrapper.text()).toContain('pdf_windows_host_copied')
  })

  it('pins the window so outside clicks and clear events do not dismiss it until unpinned', async () => {
    await showSelectionIcon('Pin me')
    await openWindowFromSelectionIcon(wrapper)

    await wrapper.get('[data-testid="translation-window-toolbar-pin"]').trigger('click')
    await flushPromises()

    document.body.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 4,
      clientY: 4
    }))
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)

    emitSelectionClear({
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)

    await wrapper.get('[data-testid="translation-window-toolbar-pin"]').trigger('click')
    await flushPromises()

    document.body.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 4,
      clientY: 4
    }))
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)
  })

  it('docks by dragging near viewport edges and clamps dock resize width', async () => {
    await showSelectionIcon('Dock me')
    await openWindowFromSelectionIcon(wrapper)

    const header = wrapper.get('.pdf-windows-host__header')
    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 180, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 4, clientY: 210 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 4, clientY: 210 })
    await flushPromises()
    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).toContain('pdf-windows-host--dock-left')
    expect(wrapper.find('[data-testid="pdf-windows-host-resize-handle"]').exists()).toBe(true)

    const resizeHandle = wrapper.get('[data-testid="pdf-windows-host-resize-handle"]')
    dispatchPointerEvent(resizeHandle.element, 'pointerdown', { clientX: 420, clientY: 40 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 2000, clientY: 40 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 2000, clientY: 40 })
    await flushPromises()

    const dockedWidth = Number.parseInt(wrapper.get('[data-testid="pdf-windows-host"]').element.style.width, 10)
    const expectedMaxDockedWidth = Math.max(280, Math.floor((document.documentElement.clientWidth || window.innerWidth || 0) * 0.8))
    expect(dockedWidth).toBeLessThanOrEqual(expectedMaxDockedWidth)
    expect(dockedWidth).toBeGreaterThanOrEqual(280)

    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 20, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 540, clientY: 210 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 540, clientY: 210 })
    await flushPromises()
    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).not.toContain('pdf-windows-host--dock-left')
    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).not.toContain('pdf-windows-host--dock-right')

    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 520, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: window.innerWidth - 4, clientY: 210 })
    dispatchPointerEvent(document, 'pointerup', { clientX: window.innerWidth - 4, clientY: 210 })
    await flushPromises()
    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).toContain('pdf-windows-host--dock-right')
  })

  it('keeps the dock mode unchanged while dragging within the breakaway threshold and retains the resize handle', async () => {
    await showSelectionIcon('Stable dock')
    await openWindowFromSelectionIcon(wrapper)

    const header = wrapper.get('.pdf-windows-host__header')
    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 180, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 4, clientY: 210 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 4, clientY: 210 })
    await flushPromises()

    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).toContain('pdf-windows-host--dock-left')
    expect(wrapper.find('[data-testid="pdf-windows-host-resize-handle"]').exists()).toBe(true)

    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 20, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 72, clientY: 210 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 72, clientY: 210 })
    await flushPromises()

    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).toContain('pdf-windows-host--dock-left')
    expect(wrapper.find('[data-testid="pdf-windows-host-resize-handle"]').exists()).toBe(true)
  })

  it('translates directly without the icon when docked', async () => {
    await showSelectionIcon('Dock direct')
    await openWindowFromSelectionIcon(wrapper)

    const header = wrapper.get('.pdf-windows-host__header')
    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 180, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 4, clientY: 210 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 4, clientY: 210 })
    await flushPromises()
    sendRegularMessageMock.mockClear()

    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Docked translation',
      sourceLanguage: 'en'
    })

    await showSelectionIcon('Dock direct updated')
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)
    await flushPromises()
    expect(sendRegularMessageMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="translation-window-toolbar-detected-language"]').text()).toBe('English')
  })

  it('translates directly when a visible pinned window receives a new selection', async () => {
    await showSelectionIcon('Pinned visible')
    await openWindowFromSelectionIcon(wrapper)

    await wrapper.get('[data-testid="translation-window-toolbar-pin"]').trigger('click')
    await flushPromises()
    sendRegularMessageMock.mockClear()

    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: 'Pinned translation',
      sourceLanguage: 'fa'
    })

    await showSelectionIcon('Pinned direct selection', { x: 180, y: 220, width: 90, height: 18 })
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)
    expect(sendRegularMessageMock).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="translation-window-toolbar-detected-language"]').text()).toBe('Persian (Farsi)')
  })

  it('drags the floating window and restores persisted positions by fingerprint and global fallback', async () => {
    await showSelectionIcon('Drag me')
    await openWindowFromSelectionIcon(wrapper)

    const header = wrapper.get('.pdf-windows-host__header')
    dispatchPointerEvent(header.element, 'pointerdown', { clientX: 180, clientY: 210 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 260, clientY: 260 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 260, clientY: 260 })
    await flushPromises()

    expect(globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1']).toBeDefined()
    expect(globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1'].position.x).toBeGreaterThanOrEqual(12)
    expect(globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1'].position.y).toBeGreaterThanOrEqual(12)

    wrapper.unmount()
    wrapper = null

    globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.global.defaultPosition = { x: 88, y: 96 }
    const fingerprintRestored = mount(PdfWindowsHost, {
      props: {
        pdfFingerprint: 'pdf-doc-1'
      },
      attachTo: document.body
    })
    await flushPromises()

    await showSelectionIcon('Doc restore', { x: 20, y: 20, width: 80, height: 18 })
    expect(fingerprintRestored.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)

    await openWindowFromSelectionIcon(fingerprintRestored)

    expect(fingerprintRestored.get('[data-testid="pdf-windows-host"]').element.style.left).toBe(`${globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1'].position.x}px`)
    expect(fingerprintRestored.get('[data-testid="pdf-windows-host"]').element.style.top).toBe(`${globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1'].position.y}px`)

    fingerprintRestored.unmount()

    const globalFallback = mount(PdfWindowsHost, {
      attachTo: document.body
    })
    await flushPromises()

    await showSelectionIcon('Global fallback', { x: 20, y: 20, width: 80, height: 18 })
    expect(globalFallback.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)

    await openWindowFromSelectionIcon(globalFallback)

    expect(globalFallback.get('[data-testid="pdf-windows-host"]').element.style.left).toBe('88px')
    expect(globalFallback.get('[data-testid="pdf-windows-host"]').element.style.top).toBe('96px')

    globalFallback.unmount()
  })

  it('ignores stale results after a newer PDF selection arrives', async () => {
    let resolveTranslation
    sendRegularMessageMock.mockImplementation(() => new Promise((resolve) => {
      resolveTranslation = resolve
    }))

    await showSelectionIcon('Old selection')
    await openWindowFromSelectionIcon(wrapper)
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(true)

    await showSelectionIcon('New selection', { x: 160, y: 220, width: 90, height: 18 })
    await flushPromises()

    resolveTranslation({
      success: true,
      translatedText: 'Stale result'
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Stale result')
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)
  })

  it('dismisses on PDF selection clear, Escape key, and outside click', async () => {
    await showSelectionIcon('Dismiss me')
    await openWindowFromSelectionIcon(wrapper)

    await wrapper.get('[data-testid="translation-window-toolbar-original"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.pdf-windows-host__source').exists()).toBe(true)

    emitSelectionClear({
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)

    await showSelectionIcon('Dismiss me again')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)

    await showSelectionIcon('Dismiss me one more time')
    expect(wrapper.find('[data-testid="pdf-windows-host-icon-stage"]').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)
  })

  it('cleans up all listeners on unmount and does not import the WindowsManager stack', async () => {
    expect(windowsManagerImported).toBe(false)

    wrapper.unmount()
    wrapper = null
    await flushPromises()

    expect(unsubscribeMocks).toHaveLength(2)
    unsubscribeMocks.forEach((unsubscribe) => {
      expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true })
    expect(addEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { capture: true })
    expect(windowAddEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true })
    expect(windowAddEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function), undefined)

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true })
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { capture: true })
    expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true })
    expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function), undefined)
  })

  it('keeps PdfWindowsHost implementation free of WindowsManager imports', () => {
    const hostSource = fs.readFileSync(path.resolve(process.cwd(), 'src/apps/pdf/components/PdfWindowsHost.vue'), 'utf8')
    const composableSource = fs.readFileSync(path.resolve(process.cwd(), 'src/apps/pdf/composables/usePdfWindowsHost.js'), 'utf8')

    expect(hostSource).not.toMatch(/@\/features\/windows|src\/features\/windows/)
    expect(composableSource).not.toMatch(/@\/features\/windows|src\/features\/windows/)
  })
})

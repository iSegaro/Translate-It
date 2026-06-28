import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const eventHandlers = {}
const unsubscribeMocks = []
let windowsManagerImported = false

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
    set: vi.fn(async (data) => {
      globalThis.__pdfWindowsHostStorageState = {
        ...(globalThis.__pdfWindowsHostStorageState || {}),
        ...data
      }
      return true
    }),
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

vi.mock('@/components/shared/TTSButton.vue', () => ({
  default: {
    name: 'TTSButton',
    props: ['text', 'language', 'disabled', 'isDictionary'],
    template: '<button data-testid="pdf-windows-host-tts" :data-text="text" :data-dictionary="isDictionary" :disabled="disabled">{{ text }}</button>'
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
    emitSelection({
      text: 'PDF text',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'web-page', isPdf: false }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)

    emitSelection({
      text: 'PDF text',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('PDF text')
    expect(wrapper.get('[data-testid="pdf-windows-host-tts"]').attributes('data-text')).toBe('PDF text')
  })

  it('renders TTS for selected source text before translation and hides it when there is no speakable text', async () => {
    expect(wrapper.find('[data-testid="pdf-windows-host-tts"]').exists()).toBe(false)

    emitSelection({
      text: 'Speak me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    const ttsButton = wrapper.get('[data-testid="pdf-windows-host-tts"]')
    expect(ttsButton.exists()).toBe(true)
    expect(ttsButton.attributes('data-text')).toBe('Speak me')
  })

  it('translates selected text, renders success, and maps the PDF request correctly', async () => {
    emitSelection({
      text: 'Hello PDF',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-translate"]').trigger('click')
    await flushPromises()

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
    expect(wrapper.find('[data-testid="pdf-windows-host-result"]').text()).toContain('Translated text')
    expect(wrapper.get('[data-testid="pdf-windows-host-tts"]').attributes('data-text')).toBe('Translated text')
  })

  it('renders dictionary-formatted translation results without raw markdown artifacts', async () => {
    sendRegularMessageMock.mockResolvedValueOnce({
      success: true,
      translatedText: '**Noun**: hello\n- a greeting',
      mode: 'dictionary'
    })

    emitSelection({
      text: 'hello',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-translate"]').trigger('click')
    await flushPromises()

    const result = wrapper.get('[data-testid="pdf-windows-host-result"]')
    expect(result.find('.simple-markdown').exists()).toBe(true)
    expect(result.text()).toContain('Noun')
    expect(result.text()).toContain('hello')
    expect(result.text()).toContain('a greeting')
    expect(result.text()).not.toContain('**')
    expect(wrapper.get('[data-testid="pdf-windows-host-tts"]').attributes('data-dictionary')).toBe('true')
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

    emitSelection({
      text: 'Retry me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-translate"]').trigger('click')
    await flushPromises()

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

  it('copies the translated result', async () => {
    emitSelection({
      text: 'Copy me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-translate"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-copy"]').trigger('click')
    await flushPromises()

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('Translated text')
    expect(wrapper.text()).toContain('pdf_windows_host_copied')
  })

  it('pins the window so outside clicks and clear events do not dismiss it until unpinned', async () => {
    emitSelection({
      text: 'Pin me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-pin"]').trigger('click')
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

    await wrapper.get('[data-testid="pdf-windows-host-pin"]').trigger('click')
    await flushPromises()

    document.body.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 4,
      clientY: 4
    }))
    await flushPromises()

    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)
  })

  it('docks left and right and clamps dock resize width', async () => {
    emitSelection({
      text: 'Dock me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-dock-left"]').trigger('click')
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

    await wrapper.get('[data-testid="pdf-windows-host-dock-right"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="pdf-windows-host"]').classes()).toContain('pdf-windows-host--dock-right')
  })

  it('drags the floating window and restores persisted positions by fingerprint and global fallback', async () => {
    emitSelection({
      text: 'Drag me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

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

    emitSelection({
      text: 'Doc restore',
      position: { x: 20, y: 20, width: 80, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    expect(fingerprintRestored.get('[data-testid="pdf-windows-host"]').element.style.left).toBe(`${globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1'].position.x}px`)
    expect(fingerprintRestored.get('[data-testid="pdf-windows-host"]').element.style.top).toBe(`${globalThis.__pdfWindowsHostStorageState.pdfWindowsHostLayout.documents['pdf-doc-1'].position.y}px`)

    fingerprintRestored.unmount()

    const globalFallback = mount(PdfWindowsHost, {
      attachTo: document.body
    })
    await flushPromises()

    emitSelection({
      text: 'Global fallback',
      position: { x: 20, y: 20, width: 80, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    expect(globalFallback.get('[data-testid="pdf-windows-host"]').element.style.left).toBe('88px')
    expect(globalFallback.get('[data-testid="pdf-windows-host"]').element.style.top).toBe('96px')

    globalFallback.unmount()
  })

  it('ignores stale results after a newer PDF selection arrives', async () => {
    let resolveTranslation
    sendRegularMessageMock.mockImplementation(() => new Promise((resolve) => {
      resolveTranslation = resolve
    }))

    emitSelection({
      text: 'Old selection',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    await wrapper.get('[data-testid="pdf-windows-host-translate"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(true)

    emitSelection({
      text: 'New selection',
      position: { x: 160, y: 220, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    resolveTranslation({
      success: true,
      translatedText: 'Stale result'
    })
    await flushPromises()

    expect(wrapper.text()).toContain('New selection')
    expect(wrapper.text()).not.toContain('Stale result')
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(false)
  })

  it('dismisses on PDF selection clear, Escape key, and outside click', async () => {
    emitSelection({
      text: 'Dismiss me',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    emitSelectionClear({
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)

    emitSelection({
      text: 'Dismiss me again',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="pdf-windows-host"]').exists()).toBe(false)

    emitSelection({
      text: 'Dismiss me one more time',
      position: { x: 120, y: 180, width: 90, height: 18 },
      context: { source: 'pdf-viewer', isPdf: true }
    })
    await flushPromises()

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

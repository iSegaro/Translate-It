import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const eventHandlers = {}
const unsubscribeMocks = []
let windowsManagerImported = false

const sendRegularMessageMock = vi.fn()

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

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key
  })
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

describe('PdfWindowsHost', () => {
  let wrapper
  let addEventListenerSpy
  let removeEventListenerSpy
  let windowAddEventListenerSpy
  let windowRemoveEventListenerSpy
  let clipboardWriteTextMock

  beforeEach(async () => {
    windowsManagerImported = false
    sendRegularMessageMock.mockReset()
    sendRegularMessageMock.mockResolvedValue({ success: true, translatedText: 'Translated text' })

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
        mode: 'selection-manager',
        enableDictionary: false
      })
    }))
    expect(wrapper.find('[data-testid="pdf-windows-host-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pdf-windows-host-result"]').text()).toContain('Translated text')
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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const settingsStoreMock = vi.hoisted(() => ({
  settings: { MODE_PROVIDERS: {}, DEBUG_MODE: false },
  updateSettingAndPersist: vi.fn(() => Promise.resolve(true))
}))

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    template: `
      <div>
        <button class="mock-provider-selector" :disabled="disabled" @click="$emit(loading ? 'cancel' : 'translate', { provider: 'googlev2' })" />
        <button class="mock-provider-change-a" :disabled="disabled || dropdownDisabled" @click="$emit('provider-change', 'deepl'); $emit('translate', { provider: 'deepl' })" />
        <button class="mock-provider-change-b" :disabled="disabled || dropdownDisabled" @click="$emit('provider-change', 'openai'); $emit('translate', { provider: 'openai' })" />
      </div>
    `,
    props: ['disabled', 'dropdownDisabled', 'loading'],
    emits: ['translate', 'cancel', 'provider-change', 'update:modelValue']
  }
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => settingsStoreMock
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => loggerMock
}))

import PdfToolbar from './PdfToolbar.vue'
import { TranslationMode } from '@/shared/config/config.js'
import { BenchmarkEvaluator } from '../BenchmarkEvaluator.js'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('PdfToolbar', () => {
  beforeEach(() => {
    settingsStoreMock.settings.MODE_PROVIDERS = {}
    settingsStoreMock.settings.DEBUG_MODE = false
    settingsStoreMock.updateSettingAndPersist.mockReset()
    settingsStoreMock.updateSettingAndPersist.mockResolvedValue(true)
    loggerMock.debug.mockReset()
    loggerMock.info.mockReset()
    loggerMock.warn.mockReset()
    loggerMock.error.mockReset()
  })

  it('renders the file name and keeps core actions available', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'very-long-document-name.pdf',
        pageCount: 12,
        currentPageNumber: 5,
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        ocrRecommendationCount: 0,
        isOcrProcessing: false,
        zoomMode: 'fit-width',
        zoomPercent: 100,
        showTranslationOption: true,

      }
    })

    expect(wrapper.find('.pdf-toolbar__file-row').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__file-name').text()).toBe('very-long-document-name.pdf')
    expect(wrapper.find('.pdf-toolbar__file-name').attributes('title')).toBe('very-long-document-name.pdf')
    expect(wrapper.find('.pdf-toolbar__page-input').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__page-input').element.value).toBe('5')
    expect(wrapper.find('.pdf-toolbar__page-total').text()).toBe('12')
    expect(wrapper.find('.pdf-toolbar__zoom-select').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').exists()).toBe(true)

    expect(wrapper.find('.pdf-toolbar__mode-button--active').exists()).toBe(true)
  })

  it('emits content-view-change when a content view button is clicked', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'original',
        layoutMode: 'single',
        zoomMode: 'fit-width',
        zoomPercent: 100,
        showTranslationOption: true
      }
    })

    await wrapper.find('.pdf-toolbar__mode-button--active').trigger('click')
    expect(wrapper.emitted('content-view-change')).toBeTruthy()
    expect(wrapper.emitted('content-view-change')?.[0]?.[0]).toBe('original')

    const translationButton = wrapper.findAll('.pdf-toolbar__mode-button').find(
      (btn) => btn.text().includes('Translation')
    )
    await translationButton?.trigger('click')
    expect(wrapper.emitted('content-view-change')?.[1]?.[0]).toBe('translation')
  })

  it('hides the entire mode section when showTranslationOption is false', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'original',
        showTranslationOption: false
      }
    })

    expect(wrapper.find('.pdf-toolbar__mode-group--content').exists()).toBe(false)
    expect(wrapper.find('.pdf-toolbar__mode-group--layout').exists()).toBe(false)
    expect(wrapper.find('.pdf-toolbar__mode-button').exists()).toBe(false)
  })

  it('shows Translation option when showTranslationOption is true', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'translation',
        showTranslationOption: true
      }
    })

    const allButtons = wrapper.findAll('.pdf-toolbar__mode-button')
    const contentButtons = allButtons.filter(
      btn => ['Original', 'Translation', 'Translated PDF'].some(label => btn.text().includes(label))
    )
    expect(contentButtons).toHaveLength(3)
    expect(contentButtons.some(btn => btn.text().includes('Translation'))).toBe(true)
  })

  it('emits layout-mode-change when a layout mode button is clicked', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'translation',
        layoutMode: 'single',
        zoomMode: 'fit-width',
        zoomPercent: 100,
        showTranslationOption: true
      }
    })

    const sideBySideButton = wrapper.find('.pdf-toolbar__mode-button[aria-label="Side by Side"]')
    await sideBySideButton?.trigger('click')
    expect(wrapper.emitted('layout-mode-change')).toBeTruthy()
    expect(wrapper.emitted('layout-mode-change')?.[0]?.[0]).toBe('side-by-side')
  })

  it('keeps Open PDF and Clear Cache in the hamburger menu and export in the export menu', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        ocrRecommendationCount: 0,
        isOcrProcessing: false,
        zoomMode: 'fit-width',
        zoomPercent: 100,

      }
    })

    const toolbarButtons = () => wrapper.findAll('.pdf-toolbar__actions button')

    expect(toolbarButtons().some((button) => button.text().includes('Open PDF'))).toBe(false)
    expect(toolbarButtons().some((button) => button.text().includes('Clear Cache'))).toBe(false)

    await wrapper.find('.mock-provider-selector').trigger('click')
    expect(wrapper.emitted('translate-visible')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    expect(wrapper.find('.pdf-toolbar__export-menu').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Open PDF')
    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Clear Cache')

    await wrapper.find('.pdf-toolbar__export-menu button').trigger('click')
    expect(wrapper.emitted('request-open-pdf')).toHaveLength(1)

    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    await wrapper.find('.pdf-toolbar__export-menu button:nth-child(2)').trigger('click')
    expect(wrapper.emitted('clear-cache')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').trigger('click')
    expect(wrapper.find('.pdf-toolbar__export-menu').exists()).toBe(true)

    await wrapper.findAll('button').find((button) => button.text().includes('Export TXT'))?.trigger('click')
    expect(wrapper.emitted('export-txt')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').trigger('click')
    await wrapper.findAll('button').find((button) => button.text().includes('Export Markdown'))?.trigger('click')
    expect(wrapper.emitted('export-markdown')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').trigger('click')
    await wrapper.findAll('button').find((button) => button.text().includes('Export HTML'))?.trigger('click')
    expect(wrapper.emitted('export-html')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__zoom-select').setValue('125')
    expect(wrapper.emitted('zoom-change')?.at(-1)?.[0]).toEqual({ mode: 'percent', value: 125 })

    await wrapper.find('.pdf-toolbar__button[title="Fit to page"]').trigger('click')
    expect(wrapper.emitted('zoom-change')?.at(-1)?.[0]).toEqual({ mode: 'fit-page', value: 100 })

    await wrapper.findAll('button').find((button) => button.text().trim() === '+')?.trigger('click')
    expect(wrapper.emitted('zoom-step')?.at(-1)?.[0]).toBe(1)
  })

  it('emits Region Benchmark trigger only while Debug Mode is enabled', async () => {
    const debugDisabled = mount(PdfToolbar)

    await debugDisabled.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    expect(debugDisabled.find('.pdf-toolbar__menu-section').exists()).toBe(false)
    expect(debugDisabled.findAll('button').some((button) => button.text().includes('Region Benchmark'))).toBe(false)

    settingsStoreMock.settings.DEBUG_MODE = true
    const debugEnabled = mount(PdfToolbar)
    await debugEnabled.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')

    expect(debugEnabled.find('.pdf-toolbar__menu-section').text()).toContain('Developer')
    const regionBenchmark = debugEnabled.findAll('button').find((button) => button.text().includes('Region Benchmark'))
    expect(regionBenchmark?.attributes('disabled')).toBeUndefined()

    await regionBenchmark?.trigger('click')
    expect(debugEnabled.emitted('request-region-benchmark')).toHaveLength(1)
  })

  it('shows compact benchmark progress and results only in Developer Mode', async () => {
    const evaluatedResults = new BenchmarkEvaluator().evaluate([{
      candidateId: 'scale-1-eng',
      configuration: { scale: 1, language: 'eng' },
      runtime: { latencyMs: 42 },
      output: { status: 'recognized', data: { text: 'hello' } }
    }], { groundTruth: 'hallo' })
    const benchmarkState = {
      status: 'completed',
      progress: { totalCandidates: 2, completedCandidates: 2, currentCandidate: null },
      results: evaluatedResults,
      analysis: {
        winnerCandidateId: 'scale-1-eng',
        latency: { fastestMs: 42 },
        confidence: { highest: 95, delta: 5 },
        output: { identical: true, comparable: true }
      },
      summary: { totalElapsedMs: 84 }
    }
    const normalUser = mount(PdfToolbar, { props: { benchmarkState } })

    await normalUser.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    expect(normalUser.find('.pdf-toolbar__benchmark').exists()).toBe(false)

    settingsStoreMock.settings.DEBUG_MODE = true
    const developer = mount(PdfToolbar, { props: { benchmarkState } })
    await developer.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')

    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('2/2')
    expect(developer.find('.pdf-toolbar__benchmark-analysis').text()).toContain('Winner scale-1-eng')
    expect(developer.find('.pdf-toolbar__benchmark-analysis').text()).toContain('Fastest 42ms')
    expect(developer.find('.pdf-toolbar__benchmark-analysis').text()).toContain('Confidence 95 (+5)')
    expect(developer.find('.pdf-toolbar__benchmark-analysis').text()).toContain('Output Identical')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('scale-1-eng')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('scale 1')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('eng')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('42ms')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('recognized')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('CER 0.200')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('differences')
    expect(developer.find('.pdf-toolbar__benchmark').text()).toContain('Total 84ms')
    expect(developer.findAll('button').some(button => button.text().includes('Export Benchmark Artifact'))).toBe(false)

    await developer.setProps({ canExportBenchmarkArtifact: true })
    const exportArtifact = developer.findAll('button').find(button => button.text().includes('Export Benchmark Artifact'))
    expect(exportArtifact).toBeTruthy()
    await exportArtifact?.trigger('click')
    expect(developer.emitted('export-benchmark-artifact')).toHaveLength(1)
  })

  it('emits cancellation from active benchmark state', async () => {
    settingsStoreMock.settings.DEBUG_MODE = true
    const wrapper = mount(PdfToolbar, {
      props: {
        benchmarkState: {
          status: 'running',
          progress: {
            totalCandidates: 2,
            completedCandidates: 1,
            currentCandidate: { candidateId: 'scale-1.5-eng' }
          },
          results: [],
          summary: null
        }
      }
    })
    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')

    expect(wrapper.find('.pdf-toolbar__benchmark-current').text()).toBe('scale-1.5-eng')
    await wrapper.find('.pdf-toolbar__benchmark-cancel').trigger('click')
    expect(wrapper.emitted('cancel-region-benchmark')).toHaveLength(1)
  })

  it('does not render null confidence delta or incomparable output as different', async () => {
    settingsStoreMock.settings.DEBUG_MODE = true
    const wrapper = mount(PdfToolbar, {
      props: {
        benchmarkState: {
          status: 'completed',
          progress: { totalCandidates: 1, completedCandidates: 1, currentCandidate: null },
          results: [],
          analysis: {
            winnerCandidateId: null,
            latency: { fastestMs: null },
            confidence: { highest: 95, delta: null },
            output: { identical: false, comparable: false }
          },
          summary: null
        }
      }
    })
    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')

    expect(wrapper.find('.pdf-toolbar__benchmark-analysis').text()).toContain('Confidence 95')
    expect(wrapper.find('.pdf-toolbar__benchmark-analysis').text()).not.toContain('null')
    expect(wrapper.find('.pdf-toolbar__benchmark-analysis').text()).not.toContain('undefined')
    expect(wrapper.find('.pdf-toolbar__benchmark-analysis').text()).toContain('Output Not comparable')
  })

  it('shows OCR button without count when OCR recommendations exist', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        ocrRecommendationCount: 3,
        isOcrProcessing: false
      }
    })

    const ocrButton = wrapper.find('.pdf-toolbar__button--ocr')
    expect(ocrButton.exists()).toBe(true)
    expect(ocrButton.text()).toBe('OCR Page')

    await ocrButton.trigger('click')
    expect(wrapper.emitted('request-ocr')).toHaveLength(1)
  })

  it('emits one region OCR request from the toolbar action', async () => {
    const wrapper = mount(PdfToolbar, { props: { regionOcrAvailable: true } })

    await wrapper.find('.pdf-toolbar__button--region-ocr').trigger('click')

    expect(wrapper.emitted('request-region-ocr')).toHaveLength(1)
  })

  it('reflects selecting, processing, and unavailable Region OCR states', async () => {
    const wrapper = mount(PdfToolbar, { props: { regionOcrAvailable: true, regionOcrState: 'selecting' } })
    const button = wrapper.find('.pdf-toolbar__button--region-ocr')

    expect(button.text()).toBe('Cancel')
    expect(button.attributes('aria-pressed')).toBe('true')

    await wrapper.setProps({ regionOcrState: 'processing' })
    expect(button.text()).toContain('Processing...')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.pdf-toolbar__region-ocr-spinner').exists()).toBe(true)

    await wrapper.setProps({ regionOcrState: 'idle', regionOcrAvailable: false })
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('Region OCR is available only in the original PDF view.')
  })

  it('emits execution-mode-change from current execution mode selection', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        executionMode: 'ocr',
        executionModes: ['ocr', 'benchmark']
      }
    })

    const modeSelect = wrapper.find('.pdf-toolbar__execution-mode-select')
    expect(modeSelect.element.value).toBe('ocr')

    await modeSelect.setValue('benchmark')

    expect(wrapper.emitted('execution-mode-change')).toEqual([['benchmark']])
  })

  it('hides OCR button while processing or without OCR recommendations', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        ocrRecommendationCount: 0,
        isOcrProcessing: false
      }
    })

    expect(wrapper.find('.pdf-toolbar__button--ocr').exists()).toBe(false)

    await wrapper.setProps({ ocrRecommendationCount: 2, isOcrProcessing: true })
    expect(wrapper.find('.pdf-toolbar__button--ocr').exists()).toBe(false)
  })

  it('keeps the main provider selector action cancellable while translating', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        isTranslating: true,
        canTranslateVisiblePages: false
      }
    })

    const mainButton = wrapper.find('.mock-provider-selector')

    expect(mainButton.attributes('disabled')).toBeUndefined()

    await mainButton.trigger('click')

    expect(wrapper.emitted('cancel-translation')).toHaveLength(1)
    expect(wrapper.emitted('translate-visible')).toBeFalsy()
  })

  it('disables provider selection while translating', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        isTranslating: true,
        canTranslateVisiblePages: false
      }
    })

    const dropdownButton = wrapper.find('.mock-provider-change-a')

    expect(dropdownButton.attributes('disabled')).toBeDefined()

    await dropdownButton.trigger('click')

    expect(settingsStoreMock.updateSettingAndPersist).not.toHaveBeenCalled()
    expect(wrapper.emitted('translate-visible')).toBeFalsy()
  })

  it('keeps provider selector idle behavior unchanged', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        isTranslating: false,
        canTranslateVisiblePages: true
      }
    })

    expect(wrapper.find('.mock-provider-selector').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.mock-provider-change-a').attributes('disabled')).toBeUndefined()

    await wrapper.find('.mock-provider-selector').trigger('click')

    expect(wrapper.emitted('translate-visible')).toHaveLength(1)
  })

  it('waits for PDF provider persistence before translating after provider change', async () => {
    const persistence = createDeferred()
    settingsStoreMock.updateSettingAndPersist.mockImplementationOnce((key, value) => {
      return persistence.promise.then(() => {
        settingsStoreMock.settings[key] = value
        return true
      })
    })

    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        canTranslateVisiblePages: true
      }
    })

    await wrapper.find('.mock-provider-change-a').trigger('click')

    expect(settingsStoreMock.updateSettingAndPersist).toHaveBeenCalledWith(
      'MODE_PROVIDERS',
      expect.objectContaining({ [TranslationMode.PDF]: 'deepl' })
    )
    expect(wrapper.emitted('translate-visible')).toBeFalsy()

    persistence.resolve(true)
    await flushPromises()

    expect(settingsStoreMock.settings.MODE_PROVIDERS[TranslationMode.PDF]).toBe('deepl')
    expect(wrapper.emitted('translate-visible')).toHaveLength(1)
  })

  it('serializes rapid PDF provider changes so the latest selection persists and translates once', async () => {
    const firstPersistence = createDeferred()
    const secondPersistence = createDeferred()
    settingsStoreMock.updateSettingAndPersist
      .mockImplementationOnce((key, value) => {
        return firstPersistence.promise.then(() => {
          settingsStoreMock.settings[key] = value
          return true
        })
      })
      .mockImplementationOnce((key, value) => {
        return secondPersistence.promise.then(() => {
          settingsStoreMock.settings[key] = value
          return true
        })
      })

    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        canTranslateVisiblePages: true
      }
    })

    await wrapper.find('.mock-provider-change-a').trigger('click')
    await wrapper.find('.mock-provider-change-b').trigger('click')

    expect(settingsStoreMock.updateSettingAndPersist).toHaveBeenCalledTimes(1)

    firstPersistence.resolve(true)
    await flushPromises()
    expect(settingsStoreMock.updateSettingAndPersist).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('translate-visible')).toBeFalsy()

    secondPersistence.resolve(true)
    await flushPromises()

    expect(settingsStoreMock.settings.MODE_PROVIDERS[TranslationMode.PDF]).toBe('openai')
    expect(wrapper.emitted('translate-visible')).toHaveLength(1)
  })

  it('does not log stale PDF provider persistence failures when the latest selection succeeds', async () => {
    const firstPersistence = createDeferred()
    const secondPersistence = createDeferred()
    settingsStoreMock.updateSettingAndPersist
      .mockImplementationOnce(() => firstPersistence.promise)
      .mockImplementationOnce((key, value) => {
        return secondPersistence.promise.then(() => {
          settingsStoreMock.settings[key] = value
          return true
        })
      })

    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        canTranslateVisiblePages: true
      }
    })

    await wrapper.find('.mock-provider-change-a').trigger('click')
    await wrapper.find('.mock-provider-change-b').trigger('click')

    firstPersistence.reject(new Error('stale failed'))
    await flushPromises()

    expect(loggerMock.error).not.toHaveBeenCalled()
    expect(wrapper.emitted('translate-visible')).toBeFalsy()

    secondPersistence.resolve(true)
    await flushPromises()

    expect(settingsStoreMock.settings.MODE_PROVIDERS[TranslationMode.PDF]).toBe('openai')
    expect(loggerMock.error).not.toHaveBeenCalled()
    expect(wrapper.emitted('translate-visible')).toHaveLength(1)
  })

  it('logs latest PDF provider persistence failures without translating', async () => {
    const error = new Error('storage failed')
    settingsStoreMock.updateSettingAndPersist.mockRejectedValueOnce(error)

    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        canTranslateVisiblePages: true
      }
    })

    await wrapper.find('.mock-provider-change-a').trigger('click')
    await flushPromises()

    expect(loggerMock.error).toHaveBeenCalledWith('Failed to persist PDF provider selection:', error)
    expect(wrapper.emitted('translate-visible')).toBeFalsy()
  })

  it('keeps the current labels while loading', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 2,
        currentPageNumber: 1,
        isLoading: true,
        canTranslateVisiblePages: false,
        canExport: false,
        isTranslating: false,
        zoomMode: 'fit-width',
        zoomPercent: 100
      }
    })

    expect(wrapper.text()).toContain('demo.pdf')

    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Loading...')
  })

  it('shows outline toggle button when hasOutline is true', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: true,
        isOutlineVisible: false
      }
    })

    expect(wrapper.find('.pdf-toolbar__outline-toggle').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__outline-toggle--active').exists()).toBe(false)
  })

  it('hides outline toggle button when hasOutline is false', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: false
      }
    })

    expect(wrapper.find('.pdf-toolbar__outline-toggle').exists()).toBe(false)
  })

  it('emits toggle-outline when outline button is clicked', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: true,
        isOutlineVisible: false
      }
    })

    await wrapper.find('.pdf-toolbar__outline-toggle').trigger('click')
    expect(wrapper.emitted('toggle-outline')).toBeTruthy()
  })

  it('applies active class to outline toggle when outline is visible', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: true,
        isOutlineVisible: true
      }
    })

    expect(wrapper.find('.pdf-toolbar__outline-toggle--active').exists()).toBe(true)
  })
})

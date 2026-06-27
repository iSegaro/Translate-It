import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendRegularMessageMock = vi.fn()
const getModeProvidersAsyncMock = vi.fn()
const getProviderOptimizationLevelAsyncMock = vi.fn()
const getSourceLanguageAsyncMock = vi.fn()
const getTargetLanguageAsyncMock = vi.fn()
const getTranslationApiAsyncMock = vi.fn()

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: sendRegularMessageMock
}))

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Select_Element: 'select-element',
    PDF: 'pdf-translation'
  },
  getModeProvidersAsync: getModeProvidersAsyncMock,
  getProviderOptimizationLevelAsync: getProviderOptimizationLevelAsyncMock,
  getSourceLanguageAsync: getSourceLanguageAsyncMock,
  getTargetLanguageAsync: getTargetLanguageAsyncMock,
  getTranslationApiAsync: getTranslationApiAsyncMock
}))

vi.mock('@/features/translation/core/ProviderConfigurations.js', () => ({
  getProviderConfiguration: vi.fn(() => ({
    batching: {
      optimalSize: 10,
      characterLimit: 5000
    }
  }))
}))

const { PdfTranslationCoordinator } = await import('./PdfTranslationCoordinator.js')

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('PdfTranslationCoordinator', () => {
  let session

  beforeEach(() => {
    sendRegularMessageMock.mockReset()
    getModeProvidersAsyncMock.mockReset()
    getProviderOptimizationLevelAsyncMock.mockReset()
    getSourceLanguageAsyncMock.mockReset()
    getTargetLanguageAsyncMock.mockReset()
    getTranslationApiAsyncMock.mockReset()

    getModeProvidersAsyncMock.mockResolvedValue({})
    getProviderOptimizationLevelAsyncMock.mockResolvedValue(3)
    getSourceLanguageAsyncMock.mockResolvedValue('auto')
    getTargetLanguageAsyncMock.mockResolvedValue('es')
    getTranslationApiAsyncMock.mockResolvedValue('google')

    session = {
      getVisibleLogicalBlocks: vi.fn(),
      setBlockTranslationState: vi.fn(),
      getBlockTranslationState: vi.fn().mockReturnValue({ status: 'idle' }),
      getPageLayout: vi.fn().mockReturnValue(null)
    }
  })

  it('translates visible blocks and writes mapped state back to the matching block IDs', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' },
      { id: 'block-b', text: 'World', role: 'paragraph', sourceTextHash: 'hash-b' }
    ])
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: JSON.stringify([
        { blockId: 'block-a', text: 'Hola' },
        { blockId: 'block-b', text: 'Mundo' }
      ]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary).toEqual({
      status: 'translated',
      translatedCount: 2,
      failedCount: 0,
      totalCount: 2
    })
    expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-a', expect.objectContaining({
      status: 'translated',
      translatedText: 'Hola',
      provider: 'google',
      targetLanguage: 'es'
    }))
    expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-b', expect.objectContaining({
      status: 'translated',
      translatedText: 'Mundo',
      provider: 'google',
      targetLanguage: 'es'
    }))
    expect(sendRegularMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      context: 'pdf-translation',
      data: expect.objectContaining({
        mode: 'pdf-translation',
        pdfTranslation: true
      })
    }))
  })

  it('drops stale results after cancellation and does not write translated state', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    const deferred = createDeferred()

    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' }
    ])
    sendRegularMessageMock.mockImplementation((message) => {
      if (message?.action === 'CANCEL_TRANSLATION') {
        return Promise.resolve({ success: true })
      }

      return deferred.promise
    })

    const translatePromise = coordinator.translateVisibleBlocks()
    await vi.waitFor(() => {
      expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-a', expect.objectContaining({
        status: 'loading'
      }))
    })

    await coordinator.cancelActiveTranslation('document-replaced')
    deferred.resolve({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Hola' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    const summary = await translatePromise

    expect(summary.status).toBe('cancelled')
    expect(session.setBlockTranslationState).not.toHaveBeenCalledWith('block-a', expect.objectContaining({
      status: 'translated'
    }))
  })

  it('calls onStateChange after marking blocks loading and after applying batch results', async () => {
    const onStateChange = vi.fn()
    const coordinator = new PdfTranslationCoordinator(session, { onStateChange })
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' }
    ])
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Hola' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    await coordinator.translateVisibleBlocks()

    expect(onStateChange).toHaveBeenCalledTimes(2)
    expect(onStateChange).toHaveBeenNthCalledWith(1)
    expect(onStateChange).toHaveBeenNthCalledWith(2)
  })

  it('does not throw when onStateChange is not provided', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' }
    ])
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Hola' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    const summary = await coordinator.translateVisibleBlocks()
    expect(summary.status).toBe('translated')
  })

  it('applies direct results from OptimizedJsonHandler streaming response', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' },
      { id: 'block-b', text: 'World', role: 'paragraph', sourceTextHash: 'hash-b' }
    ])
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      streaming: true,
      error: null,
      results: [
        { blockId: 'block-a', t: 'Hola', text: 'Hola', status: 'translated', provider: 'google' },
        { blockId: 'block-b', t: 'Mundo', text: 'Mundo', status: 'translated', provider: 'google' }
      ],
      metadata: { batchCount: 1 }
    })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary).toEqual({
      status: 'translated',
      translatedCount: 2,
      failedCount: 0,
      totalCount: 2
    })
    expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-a', expect.objectContaining({
      status: 'translated',
      translatedText: 'Hola'
    }))
    expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-b', expect.objectContaining({
      status: 'translated',
      translatedText: 'Mundo'
    }))
  })

  it('marks blocks with empty translatedText as error, not translated', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' },
      { id: 'block-b', text: 'World', role: 'paragraph', sourceTextHash: 'hash-b' }
    ])
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      streaming: true,
      error: null,
      results: [
        { blockId: 'block-a', t: 'Hola', text: 'Hola', status: 'translated', provider: 'google' },
        { blockId: 'block-b', t: '', text: '', status: 'translated', provider: 'google' }
      ],
      metadata: { batchCount: 1 }
    })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary).toEqual({
      status: 'partial',
      translatedCount: 1,
      failedCount: 1,
      totalCount: 2
    })
    expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-a', expect.objectContaining({
      status: 'translated',
      translatedText: 'Hola'
    }))
    expect(session.setBlockTranslationState).toHaveBeenCalledWith('block-b', expect.objectContaining({
      status: 'error',
      translatedText: '',
      error: 'Empty translation result'
    }))
  })

  it('passes pageLayout regions as semanticRegions to batch planner', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Revenue', role: 'paragraph', sourceTextHash: 'hash-a', roleMetadata: { regionId: 'region-a' } }
    ])
    session.getPageLayout.mockReturnValue({
      regions: [{
        id: 'region-a',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['block-a'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.9,
            signals: {},
            metrics: [{ label: 'Revenue', value: '$12.3B', unit: 'currency' }]
          }
        }
      }]
    })
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Ingresos' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary.status).toBe('translated')

    const sentMessage = sendRegularMessageMock.mock.calls[0][0]
    expect(sentMessage.data.options.contextMetadata).toBeDefined()
    expect(sentMessage.data.options.contextMetadata.semanticHint).toBeDefined()
    expect(sentMessage.data.options.contextMetadata.semanticHint.regionTypes).toEqual(['kpi-candidate'])
  })

  it('omits semanticHint when pageLayout has no semantic regions', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' }
    ])
    session.getPageLayout.mockReturnValue({
      regions: [{
        id: 'region-a',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['block-a'],
        metadata: {}
      }]
    })
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Hola' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary.status).toBe('translated')

    const sentMessage = sendRegularMessageMock.mock.calls[0][0]
    expect(sentMessage.data.options.contextMetadata).toBeUndefined()
  })

  it('handles missing getPageLayout gracefully', async () => {
    session.getPageLayout = undefined
    const coordinator = new PdfTranslationCoordinator(session)
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' }
    ])
    sendRegularMessageMock.mockResolvedValue({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Hola' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary.status).toBe('translated')
  })
})

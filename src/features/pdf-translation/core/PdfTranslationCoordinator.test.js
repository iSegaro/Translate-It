import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendRegularMessageMock = vi.fn()
const getEffectiveProviderAsyncMock = vi.fn()
const getProviderOptimizationLevelAsyncMock = vi.fn()
const getSourceLanguageAsyncMock = vi.fn()
const getTargetLanguageAsyncMock = vi.fn()

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: sendRegularMessageMock
}))

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Select_Element: 'select-element',
    PDF: 'pdf-translation'
  },
  getEffectiveProviderAsync: getEffectiveProviderAsyncMock,
  getProviderOptimizationLevelAsync: getProviderOptimizationLevelAsyncMock,
  getSourceLanguageAsync: getSourceLanguageAsyncMock,
  getTargetLanguageAsync: getTargetLanguageAsyncMock
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

function createStructuredCell({
  blockId,
  regionId,
  rowIndex,
  columnIndex,
  text,
  role
}) {
  return {
    id: `${blockId}-r${rowIndex}-c${columnIndex}`,
    regionId,
    rowIndex,
    columnIndex,
    rowSpan: 1,
    colSpan: 1,
    spanType: 'cell',
    role,
    text,
    boundingBox: {
      x: 10 + (columnIndex * 40),
      y: 100 + (rowIndex * 12),
      width: role === 'page-number' ? 24 : 120,
      height: 12
    },
    sourceReferences: {
      blockIds: [blockId],
      lineIds: [`${blockId}-line-${rowIndex}`],
      sourceLineIndices: [rowIndex],
      sourceItemIndices: [columnIndex],
      groupRegionIds: []
    },
    spanCandidate: false,
    estimatedRowSpan: 1,
    estimatedColSpan: 1,
    confidence: 1
  }
}

describe('PdfTranslationCoordinator', () => {
  let session
  let translationStateStore

  const getDefaultTranslationState = (blockId) => ({
    blockId,
    translatedText: '',
    translatedCells: null,
    status: 'idle',
    provider: '',
    sourceLanguage: '',
    targetLanguage: '',
    sourceTextHash: '',
    translationSettingsHash: '',
    updatedAt: 0,
    error: null
  })

  beforeEach(() => {
    sendRegularMessageMock.mockReset()
    getEffectiveProviderAsyncMock.mockReset()
    getProviderOptimizationLevelAsyncMock.mockReset()
    getSourceLanguageAsyncMock.mockReset()
    getTargetLanguageAsyncMock.mockReset()

    getEffectiveProviderAsyncMock.mockResolvedValue('google')
    getProviderOptimizationLevelAsyncMock.mockResolvedValue(3)
    getSourceLanguageAsyncMock.mockResolvedValue('auto')
    getTargetLanguageAsyncMock.mockResolvedValue('es')

    translationStateStore = new Map()
    session = {
      getVisibleLogicalBlocks: vi.fn(),
      setBlockTranslationState: vi.fn((blockId, patch = {}) => {
        const current = translationStateStore.get(blockId) || getDefaultTranslationState(blockId)
        const next = {
          ...current,
          ...patch,
          blockId,
          updatedAt: patch.updatedAt || Date.now()
        }
        translationStateStore.set(blockId, next)
        return next
      }),
      getBlockTranslationState: vi.fn((blockId) => translationStateStore.get(blockId) || getDefaultTranslationState(blockId)),
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
      totalCount: 2,
      translationOccurrenceId: 1
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
      messageId: expect.stringMatching(/^pdf-translate-/),
      data: expect.objectContaining({
        mode: 'pdf-translation',
        pdfTranslation: true
      })
    }))
  })

  it('uses distinct globally scoped IDs for matching coordinator runs', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const coordinatorA = new PdfTranslationCoordinator(session)
    const coordinatorB = new PdfTranslationCoordinator(session)

    const messageIdA = coordinatorA._buildMessageId(1, 'pdf-batch-0')
    const messageIdB = coordinatorB._buildMessageId(1, 'pdf-batch-0')

    expect(messageIdA).toMatch(/^pdf-translate-/)
    expect(messageIdB).toMatch(/^pdf-translate-/)
    expect(messageIdA).not.toBe(messageIdB)

    now.mockRestore()
  })

  it('tracks generated request IDs before sending their batch messages', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    const response = createDeferred()
    session.getVisibleLogicalBlocks.mockResolvedValue([
      { id: 'block-a', text: 'Hello', role: 'paragraph', sourceTextHash: 'hash-a' }
    ])
    sendRegularMessageMock.mockReturnValue(response.promise)

    const translation = coordinator.translateVisibleBlocks()
    await vi.waitFor(() => expect(sendRegularMessageMock).toHaveBeenCalledTimes(1))

    const messageId = sendRegularMessageMock.mock.calls[0][0].messageId
    expect(messageId).toMatch(/^pdf-translate-/)
    expect(coordinator.activeRequestIds).toEqual(new Set([messageId]))

    response.resolve({
      success: true,
      translatedText: JSON.stringify([{ blockId: 'block-a', text: 'Hola' }]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })
    await translation
  })

  it('passes canonical structured regions to the batch planner before legacy regions', async () => {
    const batchPlanner = {
      plan: vi.fn(() => [])
    }
    const coordinator = new PdfTranslationCoordinator(session, { batchPlanner })

    const structuredRegions = [{
      id: 'region-structured',
      kind: 'kpi',
      subtype: 'kpi-card',
      structureSignals: {
        semantic: {
          metricCount: 1
        }
      },
      sourceReferences: {},
      relationships: {},
      cells: []
    }]

    const legacyRegions = [{
      id: 'region-legacy',
      metadata: {
        semantic: {
          type: 'key-value-candidate',
          confidence: 0.5,
          metrics: []
        }
      }
    }]

    session.getVisibleLogicalBlocks.mockResolvedValue([
      {
        id: 'block-a',
        text: 'Hello',
        role: 'paragraph',
        sourceTextHash: 'hash-a',
        roleMetadata: {
          regionId: 'region-structured'
        }
      }
    ])
    session.getPageLayout.mockReturnValue({
      regions: legacyRegions,
      metadata: {
        structured: {
          regions: structuredRegions
        }
      }
    })

    await coordinator.translateVisibleBlocks()

    expect(batchPlanner.plan).toHaveBeenCalledTimes(1)
    expect(batchPlanner.plan).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        semanticRegions: legacyRegions,
        structuredRegions
      })
    )
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

  it('cancels every coordinator-owned request ID without global cancellation', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    coordinator.activeRequestIds.add('pdf-run-a')
    coordinator.activeRequestIds.add('pdf-run-b')
    sendRegularMessageMock.mockResolvedValue({ success: true })

    const cancelledIds = await coordinator.cancelActiveTranslation('document-replaced')

    expect(cancelledIds).toEqual(['pdf-run-a', 'pdf-run-b'])
    expect(coordinator.activeRequestIds.size).toBe(0)
    expect(sendRegularMessageMock).toHaveBeenCalledTimes(2)
    for (const [message] of sendRegularMessageMock.mock.calls) {
      expect(message).toEqual(expect.objectContaining({
        action: 'CANCEL_TRANSLATION',
        context: 'pdf-translation',
        data: expect.objectContaining({ reason: 'document-replaced' })
      }))
      expect(message.data).not.toHaveProperty('cancelAll')
    }
    expect(sendRegularMessageMock.mock.calls.map(([message]) => message.data.messageId)).toEqual(['pdf-run-a', 'pdf-run-b'])
  })

  it('does not cancel request IDs owned by another coordinator', async () => {
    const coordinatorA = new PdfTranslationCoordinator(session)
    const coordinatorB = new PdfTranslationCoordinator(session)
    coordinatorA.activeRequestIds.add('pdf-run-a')
    coordinatorB.activeRequestIds.add('pdf-run-b')
    sendRegularMessageMock.mockResolvedValue({ success: true })

    await coordinatorA.cancelActiveTranslation('user-cancel')

    expect(sendRegularMessageMock).toHaveBeenCalledOnce()
    expect(sendRegularMessageMock.mock.calls[0][0].data.messageId).toBe('pdf-run-a')
    expect(coordinatorB.activeRequestIds).toEqual(new Set(['pdf-run-b']))
  })

  it('does not send backend cancellation without active request IDs', async () => {
    const coordinator = new PdfTranslationCoordinator(session)

    await expect(coordinator.cancelActiveTranslation()).resolves.toBeUndefined()

    expect(sendRegularMessageMock).not.toHaveBeenCalled()
  })

  it('continues scoped cancellation when one cancellation transport rejects', async () => {
    const coordinator = new PdfTranslationCoordinator(session)
    coordinator.activeRequestIds.add('pdf-run-a')
    coordinator.activeRequestIds.add('pdf-run-b')
    sendRegularMessageMock
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({ success: true })

    await expect(coordinator.cancelActiveTranslation('user-cancel')).resolves.toEqual(['pdf-run-a', 'pdf-run-b'])

    expect(sendRegularMessageMock).toHaveBeenCalledTimes(2)
    expect(sendRegularMessageMock.mock.calls.map(([message]) => message.data.messageId)).toEqual(['pdf-run-a', 'pdf-run-b'])
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
    expect(onStateChange).toHaveBeenNthCalledWith(1, ['block-a'])
    expect(onStateChange).toHaveBeenNthCalledWith(2, ['block-a'])
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
      totalCount: 2,
      translationOccurrenceId: 1
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

  it('merges partial structured batch results across batches for the same block', async () => {
    const block = {
      id: 'block-a',
      text: 'Table of Contents',
      role: 'table-region',
      sourceTextHash: 'hash-a',
      roleMetadata: {
        isStructured: true
      }
    }

    const structuredItem = (lineIndex, cellIndex, text, role) => ({
      blockId: block.id,
      sourceTextHash: block.sourceTextHash,
      isStructured: true,
      lineIndex,
      cellIndex,
      text,
      t: text,
      cellId: `${block.id}-cell-${lineIndex}-${cellIndex}`,
      tableRowIndex: lineIndex,
      tableColumnIndex: cellIndex,
      structuredCell: createStructuredCell({
        blockId: block.id,
        regionId: 'region-toc',
        rowIndex: lineIndex,
        columnIndex: cellIndex,
        text,
        role
      })
    })

    const batchPlanner = {
      plan: vi.fn(() => ([
        {
          batchId: 'pdf-batch-0',
          blocks: [block],
          items: [
            structuredItem(0, 0, 'فهرست مطالب', 'title'),
            structuredItem(0, 1, '3', 'page-number'),
            structuredItem(1, 0, 'اختصارات', 'title'),
            structuredItem(1, 1, '4', 'page-number')
          ]
        },
        {
          batchId: 'pdf-batch-1',
          blocks: [block],
          items: [
            structuredItem(1, 0, 'اختصارات به‌روز', 'title'),
            structuredItem(1, 1, '4', 'page-number'),
            structuredItem(2, 0, 'بیانیه مأموریت', 'title'),
            structuredItem(2, 1, '7', 'page-number'),
            structuredItem(3, 0, 'بخش یک', 'title'),
            structuredItem(3, 1, '12', 'page-number')
          ]
        },
        {
          batchId: 'pdf-batch-2',
          blocks: [block],
          items: [
            structuredItem(4, 0, 'حاکمیت', 'title'),
            structuredItem(4, 1, '18', 'page-number'),
            structuredItem(5, 0, 'پیوست', 'title'),
            structuredItem(5, 1, '24', 'page-number')
          ]
        }
      ]))
    }

    const coordinator = new PdfTranslationCoordinator(session, { batchPlanner })
    session.getVisibleLogicalBlocks.mockResolvedValue([block])

    sendRegularMessageMock
      .mockResolvedValueOnce({
        success: true,
        results: [
          { blockId: block.id, t: 'فهرست مطالب', text: 'فهرست مطالب', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '3', text: '3', status: 'translated', provider: 'google' },
          { blockId: block.id, t: 'اختصارات', text: 'اختصارات', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '4', text: '4', status: 'translated', provider: 'google' }
        ],
        provider: 'google',
        sourceLanguage: 'en',
        targetLanguage: 'fa'
      })
      .mockResolvedValueOnce({
        success: true,
        results: [
          { blockId: block.id, t: 'اختصارات به‌روز', text: 'اختصارات به‌روز', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '4', text: '4', status: 'translated', provider: 'google' },
          { blockId: block.id, t: 'بیانیه مأموریت', text: 'بیانیه مأموریت', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '7', text: '7', status: 'translated', provider: 'google' },
          { blockId: block.id, t: 'بخش یک', text: 'بخش یک', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '12', text: '12', status: 'translated', provider: 'google' }
        ],
        provider: 'google',
        sourceLanguage: 'en',
        targetLanguage: 'fa'
      })
      .mockResolvedValueOnce({
        success: true,
        results: [
          { blockId: block.id, t: 'حاکمیت', text: 'حاکمیت', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '18', text: '18', status: 'translated', provider: 'google' },
          { blockId: block.id, t: 'پیوست', text: 'پیوست', status: 'translated', provider: 'google' },
          { blockId: block.id, t: '24', text: '24', status: 'translated', provider: 'google' }
        ],
        provider: 'google',
        sourceLanguage: 'en',
        targetLanguage: 'fa'
      })

    const summary = await coordinator.translateVisibleBlocks()

    expect(summary).toEqual({
      status: 'translated',
      translatedCount: 3,
      failedCount: 0,
      totalCount: 3,
      translationOccurrenceId: 1
    })

    const finalState = translationStateStore.get(block.id)
    expect(finalState).toBeDefined()
    expect(finalState.translatedCells).toHaveLength(6)
    expect(finalState.translatedCells.map((line) => line.lineIndex)).toEqual([0, 1, 2, 3, 4, 5])
    expect(finalState.translatedCells[1].cells).toEqual(['اختصارات به‌روز', '4'])
    expect(finalState.translatedCells[1].structuredCells[0]).toEqual(expect.objectContaining({
      id: 'block-a-r1-c0',
      regionId: 'region-toc',
      rowIndex: 1,
      columnIndex: 0,
      text: 'اختصارات به‌روز'
    }))
    expect(finalState.translatedText).toBe([
      'فهرست مطالب 3',
      'اختصارات به‌روز 4',
      'بیانیه مأموریت 7',
      'بخش یک 12',
      'حاکمیت 18',
      'پیوست 24'
    ].join('\n'))
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
      totalCount: 2,
      translationOccurrenceId: 1
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

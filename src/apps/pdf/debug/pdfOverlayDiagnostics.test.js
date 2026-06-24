import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/features/pdf-translation/core/PdfDocumentSession.js', () => {
  const mockPageSessions = new Map()
  const mockTranslationStates = new Map()
  const mockVisiblePageNumbers = new Set()
  const mockPageMetrics = []

  return {
    pdfDocumentSession: {
      pageSessions: mockPageSessions,
      translationStates: mockTranslationStates,
      visiblePageNumbers: mockVisiblePageNumbers,
      pageMetrics: mockPageMetrics,
      getBlockTranslationState(blockId) {
        return mockTranslationStates.get(blockId) || {
          blockId,
          translatedText: '',
          status: 'idle',
          provider: '',
          sourceLanguage: '',
          targetLanguage: '',
          sourceTextHash: '',
          error: null
        }
      }
    }
  }
})

import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'

function makeLine(overrides = {}) {
  return {
    text: 'Col1  Col2  Col3',
    direction: 'ltr',
    items: [
      { index: 0, raw: { str: 'Col1' }, text: 'Col1', x: 40, y: 200, right: 80, bottom: 214, width: 40, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false },
      { index: 1, raw: { str: 'Col2' }, text: 'Col2', x: 120, y: 200, right: 160, bottom: 214, width: 40, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false },
      { index: 2, raw: { str: 'Col3' }, text: 'Col3', x: 200, y: 200, right: 240, bottom: 214, width: 40, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false }
    ],
    boundingBox: { x: 40, y: 200, width: 200, height: 14 },
    fontSize: 10,
    index: 0,
    role: 'paragraph',
    roleMetadata: { fontSize: 10, itemCount: 3, direction: 'ltr' },
    ...overrides
  }
}

function makeBlock(overrides = {}) {
  const line1 = makeLine({ text: 'Row1-A  Row1-B', boundingBox: { x: 40, y: 200, width: 180, height: 14 }, items: [
    { index: 0, raw: { str: 'Row1-A' }, text: 'Row1-A', x: 40, y: 200, right: 90, bottom: 214, width: 50, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false },
    { index: 1, raw: { str: 'Row1-B' }, text: 'Row1-B', x: 140, y: 200, right: 190, bottom: 214, width: 50, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false }
  ] })
  const line2 = makeLine({ text: 'Row2-A  Row2-B', boundingBox: { x: 40, y: 218, width: 180, height: 14 }, items: [
    { index: 0, raw: { str: 'Row2-A' }, text: 'Row2-A', x: 40, y: 218, right: 90, bottom: 232, width: 50, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false },
    { index: 1, raw: { str: 'Row2-B' }, text: 'Row2-B', x: 140, y: 218, right: 190, bottom: 232, width: 50, height: 14, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false }
  ] })

  return {
    id: 'test-block-1',
    text: 'Row1-A Row1-B Row2-A Row2-B',
    role: 'table-region',
    sourceTextHash: 'abc123',
    pageNumber: 1,
    columnIndex: 0,
    readingOrderIndex: 0,
    boundingBox: { x: 40, y: 200, width: 200, height: 32 },
    lines: [line1, line2],
    lineCount: 2,
    roleMetadata: {
      isStructured: true,
      fontSize: 10,
      sourceLineRoles: ['table-cell', 'table-cell'],
      lineCount: 2,
      isMultiLine: true
    },
    ...overrides
  }
}

function makePageSession(blocks, lines) {
  return {
    getLogicalBlocks: () => blocks,
    getTextLines: () => lines || blocks.flatMap((b) => b.lines)
  }
}

describe('pdfOverlayDiagnostics', () => {
  beforeEach(() => {
    pdfDocumentSession.pageSessions.clear()
    pdfDocumentSession.translationStates.clear()
    pdfDocumentSession.visiblePageNumbers.clear()
    pdfDocumentSession.pageMetrics.length = 0
  })

  it('registers on globalThis.__PDF_OVERLAY_DIAGNOSTICS__', async () => {
    await import('../debug/pdfOverlayDiagnostics.js')
    expect(globalThis.__PDF_OVERLAY_DIAGNOSTICS__).toBeDefined()
    expect(typeof globalThis.__PDF_OVERLAY_DIAGNOSTICS__.dumpCurrentPage).toBe('function')
    expect(typeof globalThis.__PDF_OVERLAY_DIAGNOSTICS__.dumpAllPages).toBe('function')
    expect(typeof globalThis.__PDF_OVERLAY_DIAGNOSTICS__.buildPageReport).toBe('function')
  })

  it('buildPageReport returns error for unloaded page', async () => {
    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(999)
    expect(report.error).toContain('not loaded')
    expect(report.pageNumber).toBe(999)
  })

  it('buildPageReport produces valid structure for loaded page', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 0.98
    })
    pdfDocumentSession.visiblePageNumbers.add(1)

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'Cell-A Cell-B\nCell-C Cell-D',
      status: 'translated',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      sourceTextHash: 'abc123',
      error: null,
      translatedCells: [
        { lineIndex: 0, cells: ['Cell-A', 'Cell-B'] },
        { lineIndex: 1, cells: ['Cell-C', 'Cell-D'] }
      ]
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)

    expect(report.pageNumber).toBe(1)
    expect(report.pageSize).toBeDefined()
    expect(report.extractedLines).toBeInstanceOf(Array)
    expect(report.extractedLines.length).toBeGreaterThan(0)
    expect(report.logicalBlocks).toBeInstanceOf(Array)
    expect(report.logicalBlocks.length).toBe(1)
    expect(report.adapterItems).toBeInstanceOf(Array)
    expect(report.translationResults).toBeInstanceOf(Array)
    expect(report.overlayRenderPlan).toBeInstanceOf(Array)
    expect(report.pageSummary).toBeDefined()
    expect(report.pageSummary.blockCount).toBe(1)
  })

  it('overlay render plan detects cell mode for structured blocks with translatedCells', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'A B\nC D',
      status: 'translated',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      error: null,
      translatedCells: [
        { lineIndex: 0, cells: ['A', 'B'] },
        { lineIndex: 1, cells: ['C', 'D'] }
      ]
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)
    const plan = report.overlayRenderPlan[0]

    expect(plan.renderedMode).toBe('cell')
    expect(plan.itemCount).toBe(4)
    expect(plan.items[0].width).toBeGreaterThan(0)
    expect(plan.items[0].height).toBeGreaterThan(0)
  })

  it('overlay render plan detects block fallback for non-structured block', async () => {
    const block = makeBlock({
      role: 'paragraph',
      roleMetadata: {
        isStructured: false,
        fontSize: 10,
        lineCount: 2
      }
    })
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'Some translated text',
      status: 'translated',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      error: null
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)
    const plan = report.overlayRenderPlan[0]

    expect(plan.renderedMode).toBe('block')
    expect(plan.itemCount).toBe(1)
  })

  it('detects translatedCells missing warning for structured block without cells', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'fallback text',
      status: 'translated',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      error: null
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)
    const plan = report.overlayRenderPlan[0]

    expect(plan.warnings.some((w) => w.includes('translatedCells missing'))).toBe(true)
  })

  it('detects cell count mismatch warning', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'A B C D',
      status: 'translated',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      error: null,
      translatedCells: [
        { lineIndex: 0, cells: ['A'] },
        { lineIndex: 1, cells: ['C'] }
      ]
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)
    const plan = report.overlayRenderPlan[0]

    expect(plan.warnings.some((w) => w.includes('!= translated cells'))).toBe(true)
  })

  it('pageSummary counts roles and modes correctly', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'A B\nC D',
      status: 'translated',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      error: null,
      translatedCells: [
        { lineIndex: 0, cells: ['A', 'B'] },
        { lineIndex: 1, cells: ['C', 'D'] }
      ]
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)

    expect(report.pageSummary.renderedModeCounts.cell).toBe(1)
    expect(report.pageSummary.roleCounts).toBeDefined()
  })

  it('dumpCurrentPage returns report object', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.visiblePageNumbers.add(1)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    const { dumpCurrentPage } = await import('../debug/pdfOverlayDiagnostics.js')
    const report = dumpCurrentPage(1)
    expect(report).toBeDefined()
    expect(report.pageNumber).toBe(1)
  })

  it('dumpAllPages returns array of reports', async () => {
    const block = makeBlock()
    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    const { dumpAllPages } = await import('../debug/pdfOverlayDiagnostics.js')
    const reports = dumpAllPages()
    expect(reports).toBeInstanceOf(Array)
    expect(reports.length).toBe(1)
  })

  it('cell height floor applies for zero-height items', async () => {
    const block = makeBlock({
      lines: [
        {
          text: 'A B',
          boundingBox: { x: 40, y: 200, width: 180, height: 0 },
          fontSize: 10,
          items: [
            { index: 0, raw: { str: 'A' }, text: 'A', x: 40, y: 200, right: 50, bottom: 200, width: 10, height: 0, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false },
            { index: 1, raw: { str: 'B' }, text: 'B', x: 140, y: 200, right: 150, bottom: 200, width: 10, height: 0, fontSize: 10, fontFamily: null, ascent: null, descent: null, vertical: false }
          ],
          direction: 'ltr',
          role: 'table-cell',
          roleMetadata: { fontSize: 10, itemCount: 2, direction: 'ltr' }
        }
      ]
    })

    const pageSession = makePageSession([block])
    pdfDocumentSession.pageSessions.set(1, pageSession)
    pdfDocumentSession.pageMetrics.push({
      pageNumber: 1,
      width: 600,
      height: 800,
      naturalWidth: 612,
      naturalHeight: 792,
      scale: 1
    })

    pdfDocumentSession.translationStates.set('test-block-1', {
      blockId: 'test-block-1',
      translatedText: 'X Y',
      status: 'translated',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      error: null,
      translatedCells: [{ lineIndex: 0, cells: ['X', 'Y'] }]
    })

    const { buildPageReport } = await import('./pdfOverlayDiagnostics.js')
    const report = buildPageReport(1)
    const plan = report.overlayRenderPlan[0]

    expect(plan.renderedMode).toBe('cell')
    for (const item of plan.items) {
      expect(item.height).toBeGreaterThan(0)
    }
  })
})

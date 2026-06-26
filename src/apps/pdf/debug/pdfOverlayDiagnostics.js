import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfTranslationAdapter } from '@/features/pdf-translation/core/PdfTranslationAdapter.js'

const adapter = new PdfTranslationAdapter()
const VWS_PATTERN = /\s{2,}/
const MIN_VWS_GROUPS = 3
const CELL_GAP_RATIO = 0.4
const SNIPPET_MAX = 80

function snip(text, max = SNIPPET_MAX) {
  if (!text) return ''
  const s = String(text).replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : s.slice(0, max) + '…'
}

function r4(n) {
  return Math.round(n * 10000) / 10000
}

function bbox(obj) {
  if (!obj) return null
  return { x: r4(obj.x), y: r4(obj.y), width: r4(obj.width), height: r4(obj.height) }
}

function explainLineRole(line, context) {
  const text = (line?.text || '').trim()
  if (!text) return 'paragraph (empty text)'

  if (line.items?.length >= 2) {
    if (line.items.some((item) => item.virtualFromWhitespace)) {
      return 'table-cell (virtualFromWhitespace item present)'
    }

    const hasVWSGroups = line.items.some((item) => {
      const raw = item.raw?.str
      if (!raw || !VWS_PATTERN.test(raw)) return false
      const groups = raw.split(VWS_PATTERN).filter((g) => g.trim().length > 0)
      return groups.length >= MIN_VWS_GROUPS
    })
    if (hasVWSGroups) return 'table-cell (raw.str whitespace groups ≥ 3)'

    const sorted = [...line.items].sort((a, b) => a.x - b.x || (a.index ?? 0) - (b.index ?? 0))
    const gaps = sorted.map((item, i, arr) => (i === arr.length - 1 ? 0 : arr[i + 1].x - item.right))
    const widest = Math.max(...gaps, 0)
    const threshold = Math.max(line.fontSize * 1.5, 24)
    if (widest >= threshold) return `table-cell (widest gap ${r4(widest)} ≥ ${r4(threshold)})`
    if (/\s{3,}/.test(line.text)) return 'table-cell (3+ spaces in normalized text)'
  }

  if (/^(?:[•‣◦·*-]|\(?\d+(?:\.\d+)*[.)]?|[a-zA-Z][.)])\s+\S/.test(text)) {
    return 'list-item (bullet/number pattern)'
  }
  if (/^(?:figure|fig\.|table|caption)\b/i.test(text)) return 'caption (caption pattern)'

  const medFs = context?.medianFontSize || 0
  const pageH = context?.pageSize?.height || 0
  const ratio = medFs > 0 ? line.fontSize / medFs : 1
  const isShort = text.length <= Math.max(60, (context?.averageLineLength || 60) * 0.75 || 60)
  const inTop = pageH > 0 ? line.boundingBox.y <= pageH * 0.25 : true
  if (line.fontSize >= 13 && ratio >= 1.25 && (isShort || inTop)) {
    return `heading (fs=${r4(line.fontSize)}, ratio=${r4(ratio)}, short=${isShort}, top=${inTop})`
  }

  return 'paragraph (default)'
}

function collectExtractedLines(pageSession, context) {
  const lines = pageSession.getTextLines()
  return lines.map((line, idx) => ({
    lineIndex: idx,
    text: snip(line.text),
    fullTextLength: line.text?.length || 0,
    role: explainLineRole(line, context),
    boundingBox: bbox(line.boundingBox),
    itemCount: line.items?.length || 0,
    itemGeometry: (line.items || []).map((item) => ({
      index: item.index,
      x: r4(item.x),
      y: r4(item.y),
      width: r4(item.width),
      height: r4(item.height),
      right: r4(item.right),
      bottom: r4(item.bottom),
      fontSize: r4(item.fontSize),
      text: snip(item.text, 40),
      virtualFromWhitespace: !!item.virtualFromWhitespace
    })),
    rawStrSamples: (line.items || []).slice(0, 3).map((item) => snip(item.raw?.str || '', 60)),
    fontSize: r4(line.fontSize)
  }))
}

function collectLogicalBlocks(pageSession) {
  const blocks = pageSession.getLogicalBlocks()
  return blocks.map((block) => ({
    blockId: block.id,
    role: block.role,
    isStructured: block.roleMetadata?.isStructured || false,
    boundingBox: bbox(block.boundingBox),
    sourceText: snip(block.text),
    lineCount: block.lines?.length || 0,
    itemCountsPerLine: (block.lines || []).map((line) => line.items?.length || 0),
    whyRole: block.roleMetadata?.sourceLineRoles
      ? `sourceLineRoles=[${block.roleMetadata.sourceLineRoles.join(',')}]`
      : block.role || 'unknown'
  }))
}

function collectAdapterItems(blocks) {
  const items = adapter.toProviderItems(blocks)
  return items.map((item) => ({
    blockId: item.blockId,
    lineIndex: item.lineIndex ?? null,
    cellIndex: item.cellIndex ?? null,
    emittedText: snip(item.text),
    structuredPath: item.isStructured === true,
    cellPath: item.cellIndex != null
  }))
}

function collectTranslationResults(pageSession, session) {
  const blocks = pageSession.getLogicalBlocks()
  return blocks.map((block) => {
    const state = session.getBlockTranslationState(block.id)
    const translatedCells = state.translatedCells || null
    const missingCells = []

    if (translatedCells) {
      for (const lc of translatedCells) {
        const line = block.lines?.[lc.lineIndex]
        const expectedCount = line?.items?.length || 0
        const actualCount = lc.cells?.length || 0
        if (expectedCount > actualCount) {
          for (let i = actualCount; i < expectedCount; i++) {
            missingCells.push(`line${lc.lineIndex}:cell${i}`)
          }
        }
      }
    }

    return {
      blockId: block.id,
      status: state.status,
      translatedText: snip(state.translatedText),
      translatedCells: translatedCells || null,
      hasTranslatedCells: !!translatedCells,
      cellLineCount: translatedCells?.length || 0,
      missingCells,
      provider: state.provider || '',
      error: state.error || null
    }
  })
}

function computeCellOverlayData(block, translatedCells, pageScale) {
  if (!translatedCells) return []
  const blockBbox = block.boundingBox
  if (!blockBbox) return []

  const translatedCellMap = new Map()
  for (const lc of translatedCells) {
    translatedCellMap.set(lc.lineIndex, lc.cells)
  }

  return (block.lines || [])
    .map((line, lineIndex) => {
      const lineItems = line.items || []
      if (lineItems.length === 0) return null

      const translatedCellTexts = translatedCellMap.get(lineIndex)
      const cellTexts = translatedCellTexts || lineItems.map((item) => item.text || '')

      return {
        lineIndex,
        cells: cellTexts
          .map((cellText, cellIdx) => {
            const item = lineItems[cellIdx]
            if (!item) return null

            const lineRight = (line.boundingBox?.x || 0) + (line.boundingBox?.width || 0)
            const isLastCell = cellIdx === cellTexts.length - 1
            let cellWidth

            if (isLastCell) {
              cellWidth = lineRight - item.x
            } else {
              const nextItem = lineItems[cellIdx + 1]
              const itemRight = item.right ?? (item.x + item.width)
              const gap = nextItem ? nextItem.x - itemRight : 0
              cellWidth = item.width + Math.max(0, gap * CELL_GAP_RATIO)
            }
            cellWidth = Math.max(item.width, cellWidth)

            const minFs = item.fontSize || block.roleMetadata?.fontSize || 12
            const cellHeight = Math.round(Math.max(item.height || 0, minFs * 0.8) * 10) / 10

            return {
              text: snip(cellText, 40),
              x: r4((item.x - blockBbox.x) * pageScale),
              y: r4((item.y - blockBbox.y) * pageScale),
              width: r4(cellWidth * pageScale),
              height: r4(cellHeight * pageScale),
              rawHeight: r4(cellHeight),
              cellWidthPdf: r4(cellWidth),
              isFallback: !translatedCellTexts
            }
          })
          .filter(Boolean)
      }
    })
    .filter(Boolean)
}

function collectOverlayRenderPlan(blocks, results, pageMetric, session) {
  const scale = pageMetric?.scale || 1

  return blocks.map((block) => {
    const resultState = results.find((r) => r.blockId === block.id)
    const rawState = session?.getBlockTranslationState?.(block.id)
    const translatedText = rawState?.translatedText || resultState?.translatedText || ''
    const translatedCells = findTranslatedCells(resultState)
    const sourceLineCount = block.lines?.length || 0
    const translatedLines = translatedText ? translatedText.split('\n') : []

    const useLineOverlay =
      sourceLineCount > 1 &&
      block.roleMetadata?.isStructured === true &&
      translatedLines.length === sourceLineCount

    const useCellOverlay =
      translatedCells &&
      translatedCells.some((lc) => lc.cells && lc.cells.length > 1) &&
      (sourceLineCount <= 1 || block.roleMetadata?.isStructured === true || useLineOverlay)

    let renderedMode = 'block'
    let items = []
    const warnings = []
    const spanDiagnostics = []

    if (useCellOverlay) {
      renderedMode = 'cell'
      const cellData = computeCellOverlayData(block, translatedCells, scale)

      const translatedLineIndices = new Set(translatedCells.map((lc) => lc.lineIndex))
      const missingLineCount = sourceLineCount - translatedLineIndices.size
      if (missingLineCount > 0 && block.roleMetadata?.isStructured) {
        warnings.push(`partial translatedCells: ${translatedLineIndices.size}/${sourceLineCount} lines translated, ${missingLineCount} fallback to source text`)
      }

      for (const ld of cellData) {
        for (const cell of ld.cells) {
          items.push({
            x: cell.x,
            y: cell.y,
            width: cell.width,
            height: cell.height,
            textSnippet: cell.text,
            rawHeight: cell.rawHeight
          })
          if (cell.rawHeight <= 0) {
            warnings.push(`cell height <= 0 at line${ld.lineIndex}`)
          }
        }
      }

      for (const lc of translatedCells) {
        if (lc.colSpanCandidates) {
          for (let i = 0; i < lc.colSpanCandidates.length; i++) {
            if (lc.colSpanCandidates[i]) {
              spanDiagnostics.push({
                lineIndex: lc.lineIndex,
                cellIndex: i,
                estimatedColSpan: lc.estimatedColSpans?.[i] || 1,
                cellId: lc.cellIds?.[i] || null
              })
            }
          }
        }
      }
    } else if (useLineOverlay) {
      renderedMode = 'line'
      const blockBbox = block.boundingBox
      for (let i = 0; i < sourceLineCount; i++) {
        const line = block.lines[i]
        const lineBbox = line.boundingBox || blockBbox
        items.push({
          x: r4((lineBbox.x - blockBbox.x) * scale),
          y: r4((lineBbox.y - blockBbox.y) * scale),
          width: r4(lineBbox.width * scale),
          height: r4(lineBbox.height * scale),
          textSnippet: snip(translatedLines[i] || '', 40)
        })
      }
    } else {
      renderedMode = 'block'
      const bboxObj = block.boundingBox
      items.push({
        x: r4(bboxObj.x * scale),
        y: r4(bboxObj.y * scale),
        width: r4(bboxObj.width * scale),
        height: r4(bboxObj.height * scale),
        textSnippet: snip(translatedText, 40)
      })

      const hasTableLines = (block.lines || []).some(
        (l) => l.role === 'table-cell' || l.role === 'table-region' || block.roleMetadata?.sourceLineRoles?.includes('table-cell')
      )
      if (hasTableLines) {
        warnings.push('block fallback in table-like area')
      }
    }

    if (!block.roleMetadata?.isStructured && block.lines?.length > 1) {
      const multiItemLines = block.lines.filter((l) => l.items?.length > 1)
      if (multiItemLines.length > 0) {
        warnings.push(`non-structured block with ${multiItemLines.length} multi-item line(s)`)
      }
    }

    const isListItemOrPara = block.role === 'list-item' || block.role === 'paragraph'
    if (isListItemOrPara) {
      for (const line of block.lines || []) {
        if ((line.items?.length || 0) > 1) {
          const sorted = [...line.items].sort((a, b) => a.x - b.x)
          const gaps = sorted.map((it, i, arr) => (i === arr.length - 1 ? 0 : arr[i + 1].x - it.right))
          if (Math.max(...gaps, 0) >= Math.max(line.fontSize * 1.5, 24)) {
            warnings.push(`role=${block.role} but line has wide gaps (possible table)`)
            break
          }
        }
      }
    }

    if (!translatedCells && block.roleMetadata?.isStructured) {
      warnings.push('translatedCells missing on structured block')
    }

    if (translatedCells) {
      const blockLines = block.lines || []
      for (const lc of translatedCells) {
        const line = blockLines[lc.lineIndex]
        if (!line) continue
        const expected = line.items?.length || 0
        const actual = lc.cells?.length || 0
        if (expected !== actual && expected > 0) {
          warnings.push(`source items (${expected}) != translated cells (${actual}) at line${lc.lineIndex}`)
        }
      }
    }

    if (items.length > 1 && renderedMode === 'cell') {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i]
          const b = items[j]
          const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
          if (overlaps) {
            warnings.push(`cells [${i}] and [${j}] overlap`)
            break
          }
        }
        if (warnings.some((w) => w.includes('overlap'))) break
      }
    }

    return {
      blockId: block.id,
      renderedMode,
      itemCount: items.length,
      items,
      warnings,
      spanDiagnostics: spanDiagnostics.length > 0 ? spanDiagnostics : undefined
    }
  })
}

function findTranslatedCells(state) {
  if (!state) return null
  const raw = state.translatedCells
  if (!Array.isArray(raw) || raw.length === 0) return null
  return raw
}

function detectSuspiciousBlocks(blockReports, overlayPlans, results) {
  const suspicious = []

  for (const block of blockReports) {
    const plan = overlayPlans.find((p) => p.blockId === block.blockId)
    const result = results.find((r) => r.blockId === block.blockId)

    if (plan?.warnings?.length > 0) {
      suspicious.push({
        blockId: block.blockId,
        role: block.role,
        warnings: plan.warnings
      })
    }

    if (result?.status === 'error') {
      suspicious.push({
        blockId: block.blockId,
        role: block.role,
        warnings: [`translation error: ${result.error}`]
      })
    }
  }

  return suspicious
}

function rankProbableCauses(suspicious) {
  const causes = []
  const allWarnings = suspicious.flatMap((s) => s.warnings)

  const fallbackCount = allWarnings.filter((w) => w.includes('block fallback')).length
  if (fallbackCount > 0) {
    causes.push({
      cause: 'table-cell misclassified → block fallback overlay',
      count: fallbackCount,
      severity: 'high',
      suggestion: 'Check detectPdfLineRole() priority order and gap thresholds'
    })
  }

  const nonStructuredCount = allWarnings.filter((w) => w.includes('non-structured')).length
  if (nonStructuredCount > 0) {
    causes.push({
      cause: 'multi-item lines not marked as structured',
      count: nonStructuredCount,
      severity: 'high',
      suggestion: 'Check isStructured flag propagation in block builder'
    })
  }

  const missingCellsCount = allWarnings.filter((w) => w.includes('translatedCells missing')).length
  if (missingCellsCount > 0) {
    causes.push({
      cause: 'structured block missing translatedCells',
      count: missingCellsCount,
      severity: 'medium',
      suggestion: 'Check coordinator._applyBatchResults() passes translatedCells'
    })
  }

  const mismatchCount = allWarnings.filter((w) => w.includes('!= translated cells')).length
  if (mismatchCount > 0) {
    causes.push({
      cause: 'source/translated cell count mismatch',
      count: mismatchCount,
      severity: 'medium',
      suggestion: 'Check adapter.mapBatchResponse() grouping logic'
    })
  }

  const zeroHeightCount = allWarnings.filter((w) => w.includes('height <= 0')).length
  if (zeroHeightCount > 0) {
    causes.push({
      cause: 'zero-height cell items from pdf.js',
      count: zeroHeightCount,
      severity: 'low',
      suggestion: 'Minimum cell height floor should handle this'
    })
  }

  const overlapCount = allWarnings.filter((w) => w.includes('overlap')).length
  if (overlapCount > 0) {
    causes.push({
      cause: 'overlapping cell overlay boxes',
      count: overlapCount,
      severity: 'medium',
      suggestion: 'Check CELL_GAP_EXPANSION_RATIO and column detection'
    })
  }

  const wideGapCount = allWarnings.filter((w) => w.includes('wide gaps')).length
  if (wideGapCount > 0) {
    causes.push({
      cause: 'list-item/paragraph with wide gaps (possible table)',
      count: wideGapCount,
      severity: 'medium',
      suggestion: 'Check isTableLikeLine() detection for these blocks'
    })
  }

  return causes.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 }
    return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3) || b.count - a.count
  })
}

export function buildPageReport(pageNumber) {
  const session = pdfDocumentSession
  const pageSession = pageSessionMap().get(pageNumber)
  if (!pageSession) {
    return { pageNumber, error: `Page ${pageNumber} not loaded` }
  }

  const metric = session.pageMetrics?.find((m) => m.pageNumber === pageNumber)
  const pageSize = {
    width: metric?.naturalWidth || 0,
    height: metric?.naturalHeight || 0
  }

  const lines = pageSession.getTextLines()
  const medFs = median(lines.map((l) => l.fontSize).filter(Boolean))
  const avgLen = lines.length ? lines.reduce((s, l) => s + (l.text?.length || 0), 0) / lines.length : 0
  const context = { medianFontSize: medFs, averageLineLength: avgLen, pageSize }

  const extractedLines = collectExtractedLines(pageSession, context)
  const blockReports = collectLogicalBlocks(pageSession)
  const adapterItems = collectAdapterItems(pageSession.getLogicalBlocks())
  const translationResults = collectTranslationResults(pageSession, session)
  const overlayPlans = collectOverlayRenderPlan(
    pageSession.getLogicalBlocks(),
    translationResults,
    metric,
    session
  )

  const roleCounts = {}
  for (const line of extractedLines) {
    const role = line.role.split(' ')[0]
    roleCounts[role] = (roleCounts[role] || 0) + 1
  }

  const modeCounts = {}
  for (const plan of overlayPlans) {
    modeCounts[plan.renderedMode] = (modeCounts[plan.renderedMode] || 0) + 1
  }

  const allWarnings = overlayPlans.flatMap((p) => p.warnings)
  const suspicious = detectSuspiciousBlocks(blockReports, overlayPlans, translationResults)
  const probableCauses = rankProbableCauses(suspicious)

  return {
    pageNumber,
    pageSize: bbox(pageSize),
    scale: metric?.scale || 1,
    extractedLines,
    logicalBlocks: blockReports,
    adapterItems,
    translationResults,
    overlayRenderPlan: overlayPlans,
    pageSummary: {
      lineCount: extractedLines.length,
      blockCount: blockReports.length,
      adapterItemCount: adapterItems.length,
      roleCounts,
      renderedModeCounts: modeCounts,
      totalWarnings: allWarnings.length,
      suspiciousBlocks: suspicious,
      probableCauses
    }
  }
}

function pageSessionMap() {
  return pdfDocumentSession.pageSessions
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function resolvePageNumber(pageNumber) {
  if (pageNumber && typeof pageNumber === 'number') return pageNumber
  const visible = pdfDocumentSession.visiblePageNumbers
  if (visible?.size > 0) return [...visible].sort((a, b) => a - b)[0]
  return 1
}

export function dumpCurrentPage(pageNumber) {
  const pn = resolvePageNumber(pageNumber)
  const report = buildPageReport(pn)

  if (typeof console !== 'undefined' && console.log) {
    console.log(`%c PDF Overlay Diagnostics — Page ${pn} `, 'background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold')
    console.log(JSON.stringify(report, null, 2))
  }

  return report
}

export function dumpAllPages() {
  const reports = []
  for (const pn of [...pageSessionMap().keys()].sort((a, b) => a - b)) {
    reports.push(buildPageReport(pn))
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log(`%c PDF Overlay Diagnostics — All Pages (${reports.length}) `, 'background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold')
    console.log(JSON.stringify(reports, null, 2))
  }

  return reports
}

if (typeof globalThis !== 'undefined') {
  globalThis.__PDF_OVERLAY_DIAGNOSTICS__ = {
    dumpCurrentPage,
    dumpAllPages,
    buildPageReport
  }
}

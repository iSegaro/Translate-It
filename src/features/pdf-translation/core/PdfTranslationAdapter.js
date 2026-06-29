import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { TranslationMode } from '@/shared/config/config.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import { normalizePdfText } from './PdfBlockIdentity.js'

const STRUCTURED_MAX_CELLS_PER_LINE = 10

const READING_ROLE_KPI = 'metric'
const READING_ROLE_KV = 'summary'
const RELATIONSHIP_ROLE_PARENT = 'parent'
const RELATIONSHIP_ROLE_CHILD = 'child'
const RELATIONSHIP_ROLE_STANDALONE = 'standalone'

function isStructuredBlock(block) {
  if (block?.roleMetadata?.isStructured !== true) return false
  if (!Array.isArray(block?.lines) || block.lines.length === 0) return false
  return block.lines.length > 1 || block.lines.some((line) => line.items?.length > 1)
}

function buildSemanticContext(block, semanticRegions, structuredRegions = []) {
  const regionId = block.roleMetadata?.regionId
  if (!regionId) return undefined

  const structuredRegion = findRegionById(structuredRegions, regionId)
  const structuredContext = buildStructuredContextFromRegion(structuredRegion)
  if (structuredContext) {
    return structuredContext
  }

  if (!semanticRegions || semanticRegions.length === 0) return undefined

  const regionMap = new Map()
  for (const r of semanticRegions) {
    regionMap.set(r.id, r)
  }

  const region = regionMap.get(regionId)
  if (!region) return undefined

  const semantic = region.metadata?.semantic
  if (!semantic) return undefined

  const context = {}

  if (semantic.type) {
    context.regionType = semantic.type
  }

  if (semantic.type === 'kpi-candidate' && Array.isArray(semantic.metrics) && semantic.metrics.length === 1) {
    const metric = semantic.metrics[0]
    if (metric.financial?.subtype) {
      context.financialSubtype = metric.financial.subtype
    }
  }

  if (semantic.type === 'key-value-candidate') {
    if (semantic.pairs?.length === 1 && semantic.pairs[0].financial?.subtype) {
      context.financialSubtype = semantic.pairs[0].financial.subtype
    } else if (semantic.pairs?.length > 1) {
      const subtypes = semantic.pairs.map((p) => p.financial?.subtype).filter(Boolean)
      if (subtypes.length > 0) {
        const unique = [...new Set(subtypes)]
        if (unique.length === 1) {
          context.financialSubtype = unique[0]
        }
      }
    }
  }

  if (semantic.financialStatement) {
    context.statementFragment = true
  }

  if (semantic.dashboardGroup) {
    context.dashboardGroup = true
  }

  if (semantic.metrics?.length === 1) {
    context.readingRole = READING_ROLE_KPI
  } else if (semantic.type === 'key-value-candidate') {
    context.readingRole = READING_ROLE_KV
  }

  const relationships = semantic.relationships
  if (relationships) {
    if (relationships.childRegionIds?.length > 0) {
      context.relationshipRole = RELATIONSHIP_ROLE_PARENT
    } else if (relationships.parentRegionId) {
      context.relationshipRole = RELATIONSHIP_ROLE_CHILD
    } else {
      context.relationshipRole = RELATIONSHIP_ROLE_STANDALONE
    }
  }

  if (Object.keys(context).length === 0) return undefined

  return Object.freeze(context)
}

function normalizeTranslatedText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value
    .replace(/\u00A0/g, ' ')
    .replace(/[\s\u200B-\u200D\uFEFF]+/gu, ' ')
    .trim()
}

function normalizeStructuredTranslatedText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value
    .split('\n')
    .map((line) => line.replace(/\u00A0/g, ' ').replace(/[^\S\n\r]+/gu, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim()
}

function normalizeCellText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value.replace(/\u00A0/g, ' ').replace(/[^\S\n\r]+/gu, ' ').trim()
}

function extractTranslatedString(translatedItem) {
  if (translatedItem === null || translatedItem === undefined) return ''
  if (typeof translatedItem === 'string') return translatedItem
  if (typeof translatedItem === 'object') return translatedItem.text ?? translatedItem.t ?? translatedItem.translation ?? ''
  return String(translatedItem)
}

function extractBlockId(translatedItem, originalItem) {
  if (translatedItem && typeof translatedItem === 'object') {
    return translatedItem.blockId || translatedItem.b || translatedItem.id || originalItem.blockId || originalItem.b || originalItem.i
  }

  return originalItem.blockId || originalItem.b || originalItem.i
}

function findRegionById(regions = [], regionId = '') {
  if (!regionId || !Array.isArray(regions) || regions.length === 0) return null

  return regions.find((region) => region?.id === regionId || region?.regionId === regionId) || null
}

function buildStructuredContextFromRegion(region = null) {
  if (!region || typeof region !== 'object') return undefined

  const context = {}

  if (region.kind === 'table') {
    context.regionType = 'table'
  } else if (region.kind === 'kpi') {
    context.regionType = 'kpi-candidate'
  } else if (region.kind === 'key-value') {
    context.regionType = 'key-value-candidate'
  } else if (typeof region.kind === 'string' && region.kind.length > 0) {
    context.regionType = region.kind
  }

  if (region.subtype === 'financial-kpi' || region.subtype === 'financial-key-value') {
    context.financialSubtype = region.subtype
  }

  if (region.kind === 'kpi') {
    const metricCount = region.structureSignals?.semantic?.metricCount ?? region.structureSignals?.kpi?.metricCount ?? 0
    if (metricCount === 1) {
      context.readingRole = READING_ROLE_KPI
    }
  } else if (region.kind === 'key-value') {
    context.readingRole = READING_ROLE_KV
  }

  const groupId = region.groupId || region.relationships?.groupId || region.sourceReferences?.groupId || region.structureSignals?.semantic?.dashboardGroupId || null
  if (groupId) {
    context.dashboardGroup = true
  }

  const relationshipSource = region.compatibility?.semantic?.relationships || region.structureSignals?.semantic?.relationships || null
  if (relationshipSource) {
    if (relationshipSource.childRegionIds?.length > 0) {
      context.relationshipRole = RELATIONSHIP_ROLE_PARENT
    } else if (relationshipSource.parentRegionId) {
      context.relationshipRole = RELATIONSHIP_ROLE_CHILD
    } else {
      context.relationshipRole = RELATIONSHIP_ROLE_STANDALONE
    }
  } else if (!context.relationshipRole && groupId) {
    context.relationshipRole = RELATIONSHIP_ROLE_STANDALONE
  }

  const compatSemantic = region.compatibility?.semantic || null
  if (compatSemantic) {
    if (!context.financialSubtype) {
      if (compatSemantic.type === 'kpi-candidate' && Array.isArray(compatSemantic.metrics) && compatSemantic.metrics.length === 1) {
        const metric = compatSemantic.metrics[0]
        if (metric.financial?.subtype) {
          context.financialSubtype = metric.financial.subtype
        }
      } else if (compatSemantic.type === 'key-value-candidate') {
        if (compatSemantic.pairs?.length === 1 && compatSemantic.pairs[0].financial?.subtype) {
          context.financialSubtype = compatSemantic.pairs[0].financial.subtype
        } else if (compatSemantic.pairs?.length > 1) {
          const subtypes = compatSemantic.pairs.map((pair) => pair.financial?.subtype).filter(Boolean)
          if (subtypes.length > 0) {
            const unique = [...new Set(subtypes)]
            if (unique.length === 1) {
              context.financialSubtype = unique[0]
            }
          }
        }
      }
    }

    if (!context.statementFragment && compatSemantic.financialStatement) {
      context.statementFragment = true
    }

    if (!context.dashboardGroup && compatSemantic.dashboardGroup) {
      context.dashboardGroup = true
    }

    if (!context.readingRole) {
      if (compatSemantic.metrics?.length === 1) {
        context.readingRole = READING_ROLE_KPI
      } else if (compatSemantic.type === 'key-value-candidate') {
        context.readingRole = READING_ROLE_KV
      }
    }

    if (!context.relationshipRole && compatSemantic.relationships) {
      const relationships = compatSemantic.relationships
      if (relationships.childRegionIds?.length > 0) {
        context.relationshipRole = RELATIONSHIP_ROLE_PARENT
      } else if (relationships.parentRegionId) {
        context.relationshipRole = RELATIONSHIP_ROLE_CHILD
      } else {
        context.relationshipRole = RELATIONSHIP_ROLE_STANDALONE
      }
    }
  }

  if (Object.keys(context).length === 0) return undefined

  return Object.freeze(context)
}

function hasStructuredCellMetadata(item = null) {
  return item?.structuredCell != null && typeof item.structuredCell === 'object'
}

export class PdfTranslationAdapter {
  toProviderItems(blocks = [], semanticRegions = [], structuredRegions = []) {
    const items = []

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex]
      const semanticContext = buildSemanticContext(block, semanticRegions, structuredRegions)

      if (isStructuredBlock(block)) {
        for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
          const line = block.lines[lineIndex]
          const cellItems = line.items

          if (cellItems && cellItems.length > 1 && cellItems.length <= STRUCTURED_MAX_CELLS_PER_LINE) {
            for (let cellIndex = 0; cellIndex < cellItems.length; cellIndex++) {
              const cell = cellItems[cellIndex]
              items.push({
                i: block.id,
                b: block.id,
                blockId: block.id,
                r: block.role,
                t: cell.text,
                text: cell.text,
                lineIndex,
                cellIndex,
                isStructured: true,
                sourceTextHash: block.sourceTextHash,
                pageNumber: block.pageNumber,
                columnIndex: block.columnIndex,
                readingOrderIndex: block.readingOrderIndex,
                position: items.length,
                cellId: cell.cellId || null,
                tableRowIndex: cell.rowIndex ?? null,
                tableColumnIndex: cell.columnIndex ?? null,
                colSpanCandidate: cell.colSpanCandidate || false,
                estimatedColSpan: cell.estimatedColSpan || 1,
                ...(hasStructuredCellMetadata(cell) && { structuredCell: cell.structuredCell }),
                ...(semanticContext && { semanticContext })
              })
            }
          } else {
            items.push({
              i: block.id,
              b: block.id,
              blockId: block.id,
              r: block.role,
              t: line.text,
              text: line.text,
              lineIndex,
              isStructured: true,
              sourceTextHash: block.sourceTextHash,
              pageNumber: block.pageNumber,
              columnIndex: block.columnIndex,
              readingOrderIndex: block.readingOrderIndex,
              position: items.length,
              ...(hasStructuredCellMetadata(line.items?.[0]) && { structuredCell: line.items[0].structuredCell }),
              ...(semanticContext && { semanticContext })
            })
          }
        }
      } else {
        items.push({
          i: block.id,
          b: block.id,
          blockId: block.id,
          r: block.role,
          t: block.text,
          text: block.text,
          sourceTextHash: block.sourceTextHash,
          pageNumber: block.pageNumber,
          columnIndex: block.columnIndex,
          readingOrderIndex: block.readingOrderIndex,
          position: items.length,
          ...(semanticContext && { semanticContext })
        })
      }
    }

    return items
  }

  buildSemanticBatchHint(items = []) {
    const regionTypes = []
    const financialSubtypes = []
    const readingRoles = []
    const relationshipRoles = []
    let hasStatementFragment = false
    let hasDashboardGroup = false

    for (const item of items) {
      const ctx = item.semanticContext
      if (!ctx) continue

      if (ctx.regionType && !regionTypes.includes(ctx.regionType)) {
        regionTypes.push(ctx.regionType)
      }

      if (ctx.financialSubtype && !financialSubtypes.includes(ctx.financialSubtype)) {
        financialSubtypes.push(ctx.financialSubtype)
      }

      if (ctx.statementFragment) {
        hasStatementFragment = true
      }

      if (ctx.dashboardGroup) {
        hasDashboardGroup = true
      }

      if (ctx.readingRole && !readingRoles.includes(ctx.readingRole)) {
        readingRoles.push(ctx.readingRole)
      }

      if (ctx.relationshipRole && !relationshipRoles.includes(ctx.relationshipRole)) {
        relationshipRoles.push(ctx.relationshipRole)
      }
    }

    if (regionTypes.length === 0 && financialSubtypes.length === 0 &&
        !hasStatementFragment && !hasDashboardGroup &&
        readingRoles.length === 0 && relationshipRoles.length === 0) {
      return null
    }

    return Object.freeze({
      hasSemanticContext: true,
      regionTypes: Object.freeze(regionTypes),
      financialSubtypes: Object.freeze(financialSubtypes),
      hasStatementFragment,
      hasDashboardGroup,
      readingRoles: Object.freeze(readingRoles),
      relationshipRoles: Object.freeze(relationshipRoles)
    })
  }

  buildTranslationRequest(items, {
    provider,
    sourceLanguage,
    targetLanguage,
    messageId,
    sessionId,
    documentIdentity = '',
    pageNumbers = [],
    semanticHint = null,
    contextMetadata = null
  }) {
    const resolvedContextMetadata = {
      ...(contextMetadata || {}),
      ...(semanticHint != null && { semanticHint })
    }

    return {
      action: MessageActions.TRANSLATE,
      messageId,
      context: MessageContexts.PDF_TRANSLATION,
      data: {
        text: items,
        provider,
        sourceLanguage,
        targetLanguage,
        mode: TranslationMode.PDF,
        pdfTranslation: true,
        isExplicitProvider: true,
        documentIdentity,
        pageNumbers,
        options: {
          rawJsonPayload: true,
          pdfTranslation: true,
          documentIdentity,
          pageNumbers,
          sessionId,
          ...(Object.keys(resolvedContextMetadata).length > 0 && {
            contextMetadata: resolvedContextMetadata
          })
        }
      }
    }
  }

  mapBatchResponse(batchItems, response, {
    provider,
    sourceLanguage,
    targetLanguage
  } = {}) {
    if (!Array.isArray(batchItems) || batchItems.length === 0) {
      return []
    }

    if (!response || response.success === false) {
      const errorMessage = response?.error?.message || response?.error || 'PDF translation failed'
      return batchItems.map((item) => ({
        blockId: item.blockId,
        status: 'error',
        translatedText: '',
        provider: provider || response?.provider || '',
        sourceLanguage: sourceLanguage || response?.sourceLanguage || '',
        targetLanguage: targetLanguage || response?.targetLanguage || '',
        sourceTextHash: item.sourceTextHash || '',
        error: errorMessage
      }))
    }

    if (this._isMappedResults(response.results)) {
      return this._mergeDirectResults(batchItems, response.results, {
        provider, sourceLanguage, targetLanguage
      })
    }

    const translatedPayload = response.translatedText ?? response.results ?? response
    const rawResults = this._normalizeTranslatedPayload(translatedPayload)

    const grouped = new Map()

    batchItems.forEach((originalItem, index) => {
      const translatedItem = rawResults[index]
      const translatedText = this._extractTranslatedText(translatedItem, originalItem)
      const blockId = extractBlockId(translatedItem, originalItem)

      if (!grouped.has(blockId)) {
        grouped.set(blockId, {
          blockId,
          status: 'translated',
          provider: response.provider || provider || '',
          sourceLanguage: response.sourceLanguage || sourceLanguage || '',
          targetLanguage: response.targetLanguage || targetLanguage || '',
          sourceTextHash: originalItem.sourceTextHash || '',
          error: null,
          parts: [],
          lineResults: new Map(),
          isStructured: originalItem.isStructured === true
        })
      }

      const group = grouped.get(blockId)
      const lineIndex = originalItem.lineIndex
      const cellIndex = originalItem.cellIndex

      if (group.isStructured && lineIndex != null) {
        if (!group.lineResults.has(lineIndex)) {
          group.lineResults.set(lineIndex, { cells: [], cellIds: [], columnIndices: [], rowIndices: [], colSpanCandidates: [], estimatedColSpans: [], structuredCells: [], lineText: '' })
        }
        const lineResult = group.lineResults.get(lineIndex)

        if (cellIndex != null) {
          lineResult.cells[cellIndex] = translatedText
          if (originalItem.cellId) lineResult.cellIds[cellIndex] = originalItem.cellId
          if (originalItem.tableColumnIndex != null) lineResult.columnIndices[cellIndex] = originalItem.tableColumnIndex
          if (originalItem.tableRowIndex != null) lineResult.rowIndices[cellIndex] = originalItem.tableRowIndex
          if (originalItem.colSpanCandidate != null) lineResult.colSpanCandidates[cellIndex] = originalItem.colSpanCandidate
          if (originalItem.estimatedColSpan != null) lineResult.estimatedColSpans[cellIndex] = originalItem.estimatedColSpan
          if (hasStructuredCellMetadata(originalItem)) lineResult.structuredCells[cellIndex] = originalItem.structuredCell
        } else {
          lineResult.lineText = translatedText
          if (hasStructuredCellMetadata(originalItem)) lineResult.structuredCells[0] = originalItem.structuredCell
        }
      } else {
        group.parts.push(translatedText)
      }
    })

    return [...grouped.values()].map((entry) => {
      const translatedCells = this._buildTranslatedCells(entry)
      const lineTexts = this._buildLineTexts(entry)

      return {
        blockId: entry.blockId,
        translatedText: entry.isStructured
          ? normalizeStructuredTranslatedText(lineTexts.join('\n'))
          : normalizeTranslatedText(lineTexts.join(' ')),
        translatedCells: translatedCells || undefined,
        status: entry.status,
        provider: entry.provider,
        sourceLanguage: entry.sourceLanguage,
        targetLanguage: entry.targetLanguage,
        sourceTextHash: entry.sourceTextHash,
        error: entry.error
      }
    })
  }

  _buildLineTexts(entry) {
    if (!entry.isStructured || entry.lineResults.size === 0) {
      return entry.parts || []
    }

    const sortedIndices = [...entry.lineResults.keys()].sort((a, b) => a - b)
    return sortedIndices.map((lineIndex) => {
      const lr = entry.lineResults.get(lineIndex)
      if (lr.cells.length > 0) {
        return normalizeStructuredTranslatedText(lr.cells.filter(Boolean).join(' '))
      }
      return lr.lineText || ''
    })
  }

  _buildTranslatedCells(entry) {
    if (!entry.isStructured || entry.lineResults.size === 0) return null

    const hasAnyCells = [...entry.lineResults.values()].some((lr) => lr.cells.length > 0)
    const hasAnyStructuredCells = [...entry.lineResults.values()].some((lr) => Array.isArray(lr.structuredCells) && lr.structuredCells.some((cell) => cell != null))
    if (!hasAnyCells && !hasAnyStructuredCells) return null

    const sortedIndices = [...entry.lineResults.keys()].sort((a, b) => a - b)
    return sortedIndices.map((lineIndex) => {
      const lr = entry.lineResults.get(lineIndex)
      const cells = lr.cells.length > 0
        ? lr.cells.map((c) => normalizeCellText(c || ''))
        : [normalizeCellText(lr.lineText || '')]

      const result = { lineIndex, cells }
      const hasStructuredCells = Array.isArray(lr.structuredCells) && lr.structuredCells.some((cell) => cell != null)
      if (hasStructuredCells) {
        result.structuredCells = lr.structuredCells.map((cell) => cell || null)
      }

      const hasCellIds = lr.cellIds && lr.cellIds.some((id) => id != null)
      if (hasCellIds) {
        result.cellIds = lr.cellIds.map((id) => id || null)
      }

      const hasColumnIndices = lr.columnIndices && lr.columnIndices.some((idx) => idx != null)
      if (hasColumnIndices) {
        result.columnIndices = lr.columnIndices.map((idx) => idx ?? null)
      }

      const hasRowIndices = lr.rowIndices && lr.rowIndices.some((idx) => idx != null)
      if (hasRowIndices) {
        result.rowIndices = lr.rowIndices.map((idx) => idx ?? null)
      }

      const hasColSpanCandidates = lr.colSpanCandidates && lr.colSpanCandidates.some((v) => v)
      if (hasColSpanCandidates) {
        result.colSpanCandidates = lr.colSpanCandidates.map((v) => v || false)
      }

      const hasEstimatedColSpans = lr.estimatedColSpans && lr.estimatedColSpans.some((v) => v && v > 1)
      if (hasEstimatedColSpans) {
        result.estimatedColSpans = lr.estimatedColSpans.map((v) => v || 1)
      }

      return result
    })
  }

  _isMappedResults(results) {
    if (!Array.isArray(results) || results.length === 0) return false
    const first = results[0]
    return first && typeof first === 'object' && 'blockId' in first
  }

  _mergeDirectResults(batchItems, mappedResults, {
    provider,
    sourceLanguage,
    targetLanguage
  } = {}) {
    const resultByBlockId = new Map()
    for (const r of mappedResults) {
      if (!r?.blockId) continue
      if (!resultByBlockId.has(r.blockId)) {
        resultByBlockId.set(r.blockId, [])
      }
      resultByBlockId.get(r.blockId).push(r)
    }

    const itemsByBlockId = new Map()
    for (const item of batchItems) {
      if (!itemsByBlockId.has(item.blockId)) {
        itemsByBlockId.set(item.blockId, [])
      }
      itemsByBlockId.get(item.blockId).push(item)
    }

    return [...resultByBlockId.entries()].map(([blockId, results]) => {
      const blockItems = itemsByBlockId.get(blockId) || []
      const representativeItem = blockItems[0]
      const isStructured = representativeItem?.isStructured === true

      if (results.length === 1 && !isStructured) {
        const direct = results[0]
        const translatedText = normalizeTranslatedText(direct.t || direct.text || direct.translatedText || '')
        return {
          blockId,
          translatedText,
          status: translatedText ? 'translated' : 'error',
          provider: direct.provider || provider || '',
          sourceLanguage: direct.sourceLanguage || sourceLanguage || '',
          targetLanguage: direct.targetLanguage || targetLanguage || '',
          sourceTextHash: representativeItem?.sourceTextHash || '',
          error: translatedText ? null : 'Empty translation result'
        }
      }

      if (isStructured) {
        return this._mergeStructuredDirectResults(blockId, blockItems, results, {
          provider, sourceLanguage, targetLanguage
        })
      }

      const translatedText = normalizeStructuredTranslatedText(
        results.map((r) => extractTranslatedString(r.t || r.text || r.translatedText)).join('\n')
      )
      const lastResult = results[results.length - 1] || {}
      return {
        blockId,
        translatedText,
        status: translatedText ? 'translated' : 'error',
        provider: lastResult.provider || provider || '',
        sourceLanguage: lastResult.sourceLanguage || sourceLanguage || '',
        targetLanguage: lastResult.targetLanguage || targetLanguage || '',
        sourceTextHash: representativeItem?.sourceTextHash || '',
        error: translatedText ? null : 'Empty translation result',
        ...(blockItems.some((item) => hasStructuredCellMetadata(item)) && {
          translatedCells: [{
            lineIndex: 0,
            cells: [normalizeCellText(translatedText)],
            structuredCells: blockItems.map((item) => (hasStructuredCellMetadata(item) ? item.structuredCell : null))
          }]
        })
      }
    })
  }

  _mergeStructuredDirectResults(blockId, blockItems, results, {
    provider,
    sourceLanguage,
    targetLanguage
  } = {}) {
    const lineResults = new Map()

    for (let i = 0; i < blockItems.length; i++) {
      const item = blockItems[i]
      const lineIndex = item.lineIndex
      if (lineIndex == null) continue

      if (!lineResults.has(lineIndex)) {
        lineResults.set(lineIndex, { cells: [], cellIds: [], columnIndices: [], rowIndices: [], colSpanCandidates: [], estimatedColSpans: [], structuredCells: [], lineText: '' })
      }
      const lr = lineResults.get(lineIndex)
      const text = results[i] ? extractTranslatedString(results[i].t || results[i].text || results[i].translatedText) : ''

      if (item.cellIndex != null) {
        lr.cells[item.cellIndex] = text
        if (item.cellId) lr.cellIds[item.cellIndex] = item.cellId
        if (item.tableColumnIndex != null) lr.columnIndices[item.cellIndex] = item.tableColumnIndex
        if (item.tableRowIndex != null) lr.rowIndices[item.cellIndex] = item.tableRowIndex
        if (item.colSpanCandidate != null) lr.colSpanCandidates[item.cellIndex] = item.colSpanCandidate
        if (item.estimatedColSpan != null) lr.estimatedColSpans[item.cellIndex] = item.estimatedColSpan
        if (hasStructuredCellMetadata(item)) lr.structuredCells[item.cellIndex] = item.structuredCell
      } else if (!lr.lineText) {
        lr.lineText = text
        if (hasStructuredCellMetadata(item)) lr.structuredCells[0] = item.structuredCell
      }
    }

    const sortedIndices = [...lineResults.keys()].sort((a, b) => a - b)
    const lineTexts = sortedIndices.map((idx) => {
      const lr = lineResults.get(idx)
      if (lr.cells.length > 0) {
        return normalizeStructuredTranslatedText(lr.cells.filter(Boolean).join(' '))
      }
      return lr.lineText || ''
    })

    const hasAnyCells = [...lineResults.values()].some((lr) => lr.cells.length > 0)
    const hasAnyStructuredCells = [...lineResults.values()].some((lr) => Array.isArray(lr.structuredCells) && lr.structuredCells.some((cell) => cell != null))
    const translatedCells = (hasAnyCells || hasAnyStructuredCells)
      ? sortedIndices.map((idx) => {
        const lr = lineResults.get(idx)
        const cells = lr.cells.length > 0
          ? lr.cells.map((c) => normalizeCellText(c || ''))
          : [normalizeCellText(lr.lineText || '')]

        const result = { lineIndex: idx, cells }
        const hasStructuredCells = Array.isArray(lr.structuredCells) && lr.structuredCells.some((cell) => cell != null)
        if (hasStructuredCells) {
          result.structuredCells = lr.structuredCells.map((cell) => cell || null)
        }

        const hasCellIds = lr.cellIds && lr.cellIds.some((id) => id != null)
        if (hasCellIds) {
          result.cellIds = lr.cellIds.map((id) => id || null)
        }

        const hasColumnIndices = lr.columnIndices && lr.columnIndices.some((ci) => ci != null)
        if (hasColumnIndices) {
          result.columnIndices = lr.columnIndices.map((ci) => ci ?? null)
        }

        const hasRowIndices = lr.rowIndices && lr.rowIndices.some((ri) => ri != null)
        if (hasRowIndices) {
          result.rowIndices = lr.rowIndices.map((ri) => ri ?? null)
        }

        const hasColSpanCandidates = lr.colSpanCandidates && lr.colSpanCandidates.some((v) => v)
        if (hasColSpanCandidates) {
          result.colSpanCandidates = lr.colSpanCandidates.map((v) => v || false)
        }

        const hasEstimatedColSpans = lr.estimatedColSpans && lr.estimatedColSpans.some((v) => v && v > 1)
        if (hasEstimatedColSpans) {
          result.estimatedColSpans = lr.estimatedColSpans.map((v) => v || 1)
        }

        return result
      })
      : undefined

    const lastResult = results[results.length - 1] || {}
    const translatedText = normalizeStructuredTranslatedText(lineTexts.join('\n'))

    return {
      blockId,
      translatedText,
      translatedCells,
      status: translatedText ? 'translated' : 'error',
      provider: lastResult.provider || provider || '',
      sourceLanguage: lastResult.sourceLanguage || sourceLanguage || '',
      targetLanguage: lastResult.targetLanguage || targetLanguage || '',
      sourceTextHash: blockItems[0]?.sourceTextHash || '',
      error: translatedText ? null : 'Empty translation result'
    }
  }

  _extractTranslatedText(translatedItem, originalItem) {
    if (translatedItem === null || translatedItem === undefined) {
      return normalizePdfText(originalItem?.text || originalItem?.t || '')
    }

    if (typeof translatedItem === 'string') {
      return normalizeTranslatedText(translatedItem)
    }

    if (typeof translatedItem === 'object') {
      return normalizeTranslatedText(translatedItem.text ?? translatedItem.t ?? translatedItem.translation ?? '')
    }

    return normalizeTranslatedText(String(translatedItem))
  }

  _normalizeTranslatedPayload(payload) {
    if (Array.isArray(payload)) {
      return payload
    }

    if (typeof payload === 'string') {
      const trimmed = payload.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed)
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch {
          return [payload]
        }
      }

      return [payload]
    }

    if (payload && typeof payload === 'object') {
      const candidate = payload.translations || payload.results
      if (Array.isArray(candidate)) {
        return candidate
      }

      if (candidate && typeof candidate === 'object') {
        return [candidate]
      }

      return [payload]
    }

    return [payload]
  }
}

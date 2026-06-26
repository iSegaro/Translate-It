/**
 * SemanticRegionAnalyzer — diagnostic-only semantic metadata enrichment.
 *
 * Phase L6a: Adds KPI candidate detection for non-table regions.
 * Detects regions with numeric/currency/percentage content and short lines.
 * This is diagnostic-only — no rendering, translation, or adapter changes.
 *
 * Pipeline position: after analyzeTableRegions, before buildMetadata.
 */

const REGION_TYPE_TABLE = 'table'
const REGION_TYPE_HEADING = 'heading'
const REGION_TYPE_LIST = 'list'

const KPI_CONFIDENCE_THRESHOLD = 0.55

const CURRENCY_PATTERN = /[$€£¥₹]/
const PERCENTAGE_PATTERN = /%/
const NUMERIC_PATTERN = /^[\d.,\s+\-–—$€£¥₹BMKbmk%]+$/
const SHORT_LINE_THRESHOLD = 20

const WEIGHT_NUMERIC_RATIO = 0.3
const WEIGHT_SHORT_LINE_RATIO = 0.2
const WEIGHT_FONT_HIERARCHY = 0.2
const WEIGHT_CURRENCY_SIGNAL = 0.15
const WEIGHT_LABEL_SIGNAL = 0.15

function isNumericDominant(text) {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  return NUMERIC_PATTERN.test(trimmed)
}

function hasCurrencyOrPercent(text) {
  if (!text) return false
  return CURRENCY_PATTERN.test(text) || PERCENTAGE_PATTERN.test(text)
}

function isShortLine(text) {
  if (!text) return false
  return text.trim().length <= SHORT_LINE_THRESHOLD
}

function isLabelLine(text) {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length > 25) return false
  if (isNumericDominant(trimmed)) return false
  return true
}

function computeSignals(region, lines) {
  const regionLines = lines.filter((line) => {
    if (!line.boundingBox) return false
    const bb = line.boundingBox
    const rbb = region.boundingBox
    const centerX = bb.x + bb.width / 2
    const centerY = bb.y + bb.height / 2
    return (
      centerX >= rbb.x &&
      centerX <= rbb.x + rbb.width &&
      centerY >= rbb.y &&
      centerY <= rbb.y + rbb.height
    )
  })

  if (regionLines.length === 0) {
    return {
      numericLineRatio: 0,
      shortLineRatio: 0,
      fontHierarchyRatio: 1,
      currencyOrPercentSignal: 0,
      lineCount: 0
    }
  }

  const numericCount = regionLines.filter((l) => isNumericDominant(l.text)).length
  const shortCount = regionLines.filter((l) => isShortLine(l.text)).length
  const currencyCount = regionLines.filter((l) => hasCurrencyOrPercent(l.text)).length

  const fontSizes = regionLines.map((l) => l.fontSize || 12)
  const maxFont = Math.max(...fontSizes)
  const minFont = Math.min(...fontSizes)
  const fontHierarchyRatio = minFont > 0 ? maxFont / minFont : 1

  return {
    numericLineRatio: numericCount / regionLines.length,
    shortLineRatio: shortCount / regionLines.length,
    fontHierarchyRatio,
    currencyOrPercentSignal: currencyCount / regionLines.length,
    lineCount: regionLines.length
  }
}

function detectMetrics(region, lines) {
  const regionLineEntries = []
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (!line.boundingBox) continue
    const bb = line.boundingBox
    const rbb = region.boundingBox
    const centerX = bb.x + bb.width / 2
    const centerY = bb.y + bb.height / 2
    if (
      centerX >= rbb.x &&
      centerX <= rbb.x + rbb.width &&
      centerY >= rbb.y &&
      centerY <= rbb.y + rbb.height
    ) {
      regionLineEntries.push({ line, sourceIndex: idx })
    }
  }

  const metrics = []
  for (let i = 0; i < regionLineEntries.length; i++) {
    const { line, sourceIndex } = regionLineEntries[i]
    const text = (line.text || '').trim()
    if (!text) continue

    if (isNumericDominant(text)) {
      let unit = null
      if (CURRENCY_PATTERN.test(text)) unit = 'currency'
      else if (PERCENTAGE_PATTERN.test(text)) unit = 'percentage'

      let label = null
      let labelSourceIndex = null
      for (let j = i - 1; j >= 0; j--) {
        if (isLabelLine(regionLineEntries[j].line.text)) {
          label = regionLineEntries[j].line.text.trim()
          labelSourceIndex = regionLineEntries[j].sourceIndex
          break
        }
      }
      if (!label) {
        for (let j = i + 1; j < regionLineEntries.length; j++) {
          if (isLabelLine(regionLineEntries[j].line.text)) {
            label = regionLineEntries[j].line.text.trim()
            labelSourceIndex = regionLineEntries[j].sourceIndex
            break
          }
        }
      }

      metrics.push(Object.freeze({
        label: label || '',
        value: text,
        unit,
        delta: null,
        valueLineIndex: sourceIndex,
        labelLineIndex: labelSourceIndex
      }))
    }
  }

  return metrics
}

function computeConfidence(signals) {
  if (signals.lineCount < 1 || signals.lineCount > 5) return 0

  const numericScore = Math.min(signals.numericLineRatio * 1.2, 1)
  const shortScore = Math.min(signals.shortLineRatio, 1)
  const fontScore = signals.fontHierarchyRatio >= 1.3 ? 0.8 : signals.fontHierarchyRatio >= 1.1 ? 0.5 : 0.2
  const currencyScore = signals.currencyOrPercentSignal > 0 ? 0.9 : 0

  return (
    numericScore * WEIGHT_NUMERIC_RATIO +
    shortScore * WEIGHT_SHORT_LINE_RATIO +
    fontScore * WEIGHT_FONT_HIERARCHY +
    currencyScore * WEIGHT_CURRENCY_SIGNAL +
    0.5 * WEIGHT_LABEL_SIGNAL
  )
}

function buildSemanticMetadata(region, lines) {
  const regionType = region.type
  if (regionType === REGION_TYPE_TABLE || regionType === REGION_TYPE_HEADING || regionType === REGION_TYPE_LIST) {
    return null
  }

  const signals = computeSignals(region, lines)
  const confidence = computeConfidence(signals)

  if (confidence < KPI_CONFIDENCE_THRESHOLD) return null

  const metrics = detectMetrics(region, lines)

  return Object.freeze({
    type: 'kpi-candidate',
    confidence: Math.round(confidence * 100) / 100,
    signals: Object.freeze({
      numericLineRatio: Math.round(signals.numericLineRatio * 100) / 100,
      shortLineRatio: Math.round(signals.shortLineRatio * 100) / 100,
      fontHierarchyRatio: Math.round(signals.fontHierarchyRatio * 100) / 100,
      currencyOrPercentSignal: Math.round(signals.currencyOrPercentSignal * 100) / 100,
      lineCount: signals.lineCount
    }),
    metrics: Object.freeze(metrics)
  })
}

/**
 * Enrich non-table regions with semantic metadata for KPI candidates.
 *
 * Returns a new frozen array of regions. For regions that match KPI candidate
 * criteria, adds a `semantic` field to metadata. Non-matching regions are unchanged.
 * Does NOT mutate input regions.
 *
 * @param {Object[]} regions — classified regions from analyzeTableRegions
 * @param {Object[]} lines — text lines from the page
 * @param {Object[]} blocks — logical blocks from the page (reserved for future)
 * @returns {Object[]} frozen array of regions with semantic metadata
 */
export function analyzeSemanticRegions(regions = [], lines = [], blocks = []) { // eslint-disable-line no-unused-vars
  if (!regions.length) return Object.freeze([])

  const enrichedRegions = regions.map((region) => {
    const semantic = buildSemanticMetadata(region, lines)

    if (!semantic) {
      return Object.freeze({
        ...region,
        childRegionIds: Object.freeze([...region.childRegionIds]),
        blockIds: Object.freeze([...region.blockIds]),
        metadata: Object.freeze({ ...region.metadata })
      })
    }

    return Object.freeze({
      ...region,
      childRegionIds: Object.freeze([...region.childRegionIds]),
      blockIds: Object.freeze([...region.blockIds]),
      metadata: Object.freeze({
        ...region.metadata,
        semantic
      })
    })
  })

  return Object.freeze(enrichedRegions)
}

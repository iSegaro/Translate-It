/**
 * SemanticRegionAnalyzer — diagnostic-only semantic metadata enrichment.
 *
 * Phase L6a-L6b: Adds KPI candidate and key-value candidate detection
 * for non-table regions. Phase L6d-a adds financial signal enrichment
 * (delta, polarity, magnitude, period) to metrics and pairs.
 * Phase L6d-b adds three-line metric parsing: delta lines attach to
 * the nearest value metric instead of becoming standalone metrics.
 * All diagnostic-only — no rendering, translation, or adapter changes.
 *
 * Pipeline position: after analyzeTableRegions, before buildMetadata.
 */

const REGION_TYPE_TABLE = 'table'
const REGION_TYPE_HEADING = 'heading'
const REGION_TYPE_LIST = 'list'

const KPI_CONFIDENCE_THRESHOLD = 0.55
const KV_CONFIDENCE_THRESHOLD = 0.55
const KV_MIN_PAIRS = 2

const CURRENCY_PATTERN = /[$€£¥₹]/
const PERCENTAGE_PATTERN = /%/
const NUMERIC_PATTERN = /^[\d.,\s+\-–—$€£¥₹BMKbmk%]+$/
const SHORT_LINE_THRESHOLD = 20
const DOT_LEADER_PATTERN = /\.{3,}|…/

const DELTA_PATTERN = /^[+\-–—]?\s*[\d.,]+\s*%/
const PAREN_NEGATIVE_PATTERN = /^\(.*\)$/
const MAGNITUDE_PATTERN = /[BMKTbmkt](?:n|N)?$/
const PERIOD_PATTERN = /\b(YoY|QoQ|MoM|YTD|FY|TTM|CAGR|vs\s*LY|vs\s*Last\s*Year|vs\s*Prior|vs\s*Prior\s*Year)\b/i
const FINANCIAL_VOCABULARY_PATTERN = /\b(?:revenue|income|expense|asset|liabilit|equity|margin|profit|loss|cash.?flow|EBITDA|EPS|dividend|depreciation|amortization|working.?capital|retained|operating|net.?income|gross.?profit|total|subtotal|current|non.?current|earnings|BITDA|ROI|ROE|ROA)\b/i
const PAREN_VALUE_PATTERN = /^\([\d.,\s+\-–—$€£¥₹BMKbmk%]+\)$/
const DELTA_VALUE_PATTERN = /^[+\-–—]?\s*[\d.,]+\s*%\s*(?:YoY|QoQ|MoM|YTD|FY|TTM|CAGR|vs\s*LY|vs\s*Last\s*Year|vs\s*Prior\s*Year)?$/i
const TOTAL_LABEL_PATTERN = /\b(?:total|subtotal|net\s+(?:income|loss|revenue|profit)|gross\s+(?:profit|margin)|operating\s+(?:income|profit|expense|margin)|total\s+(?:assets|liabilit|equity|revenue|expense)|earnings|BITDA)\b/i

const WEIGHT_NUMERIC_RATIO = 0.3
const WEIGHT_SHORT_LINE_RATIO = 0.2
const WEIGHT_FONT_HIERARCHY = 0.2
const WEIGHT_CURRENCY_SIGNAL = 0.15
const WEIGHT_LABEL_SIGNAL = 0.15

const KV_WEIGHT_COLON_PAIR = 0.3
const KV_WEIGHT_CONSISTENT_ALIGNMENT = 0.2
const KV_WEIGHT_PAIR_COUNT = 0.2

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

function isFinancialValue(text) {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isNumericDominant(trimmed)) return true
  if (PAREN_VALUE_PATTERN.test(trimmed)) return true
  if (DELTA_VALUE_PATTERN.test(trimmed)) return true
  return false
}

function isStandaloneDeltaLine(text) {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (!PERCENTAGE_PATTERN.test(trimmed)) return false
  if (CURRENCY_PATTERN.test(trimmed)) return false
  if (extractMagnitude(trimmed)) return false
  const hasPeriod = PERIOD_PATTERN.test(trimmed)
  const hasExplicitSign = /^[+\u002B]/.test(trimmed) || /^[-\u2013\u2014]/.test(trimmed)
  return hasPeriod || hasExplicitSign
}

function extractMagnitude(text) {
  if (!text) return null
  const stripped = text.replace(/^\(/, '').replace(/\)$/, '')
  const match = stripped.match(MAGNITUDE_PATTERN)
  if (!match) return null
  const suffix = match[0].charAt(0)
  if (suffix === 'B' || suffix === 'b') return 'B'
  if (suffix === 'M' || suffix === 'm') return 'M'
  if (suffix === 'K' || suffix === 'k') return 'K'
  if (suffix === 'T' || suffix === 't') return 'T'
  return null
}

function detectPolarity(valueText) {
  if (!valueText) return 'neutral'
  if (PAREN_NEGATIVE_PATTERN.test(valueText)) return 'negative'
  const trimmed = valueText.trim()
  if (/^[+\u002B]/.test(trimmed)) return 'positive'
  if (/^[-\u2013\u2014]/.test(trimmed)) return 'negative'
  return 'neutral'
}

function extractDeltaAndPeriod(text) {
  if (!text) return { delta: null, period: null }

  const periodMatch = text.match(PERIOD_PATTERN)
  const period = periodMatch ? periodMatch[1] : null

  const deltaMatch = text.match(DELTA_PATTERN)
  const delta = deltaMatch ? deltaMatch[0].trim() : null

  if (period && !delta) {
    const numericPart = text.replace(PERIOD_PATTERN, '').trim()
    if (/^[+\-\u2013\u2014]/.test(numericPart) || PERCENTAGE_PATTERN.test(numericPart)) {
      return { delta: numericPart, period }
    }
  }

  return { delta, period }
}

function buildFinancialMetadata(valueText, labelText) {
  const hasVocabulary = FINANCIAL_VOCABULARY_PATTERN.test(labelText || '')
  const magnitude = extractMagnitude(valueText || '')
  const polarity = detectPolarity(valueText || '')
  const { delta, period } = extractDeltaAndPeriod(valueText || '')

  const hasAnySignal = hasVocabulary || magnitude || delta || period || polarity !== 'neutral'
  if (!hasAnySignal) return null

  return Object.freeze({
    hasEnglishFinancialVocabularySignal: hasVocabulary,
    polarity,
    magnitude,
    period,
    delta
  })
}

const SUBTYPE_PRIORITY = ['total-row', 'metric-with-delta', 'summary-row', 'negative-value']

function classifyFinancialSubtypes({ label, value, financial, kind, delta }) {
  if (!financial) return null

  const matched = []

  if (kind === 'metric' && delta != null) {
    const hasPeriod = financial.period != null
    const hasExplicitSign = /^[-\u002B\u2013\u2014]/.test(delta)
    if (hasPeriod || hasExplicitSign) {
      matched.push('metric-with-delta')
    }
  }

  if (financial.magnitude != null || CURRENCY_PATTERN.test(value || '')) {
    matched.push('summary-row')
  }

  if (TOTAL_LABEL_PATTERN.test(label || '')) {
    matched.push('total-row')
  }

  if (financial.polarity === 'negative') {
    matched.push('negative-value')
  }

  if (matched.length === 0) return null

  const sorted = SUBTYPE_PRIORITY.filter((s) => matched.includes(s))

  return Object.freeze({
    subtype: sorted[0],
    subtypes: Object.freeze(sorted)
  })
}

function getRegionLineEntries(region, lines) {
  const entries = []
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
      entries.push({ line, sourceIndex: idx })
    }
  }
  return entries
}

function buildPairFinancial(label, value) {
  const financial = buildFinancialMetadata(value, label)
  if (!financial) return null
  const subtypes = classifyFinancialSubtypes({ label, value, financial, kind: 'pair', delta: null })
  return subtypes ? Object.freeze({ ...financial, ...subtypes }) : Object.freeze({ ...financial, subtype: null })
}

function detectKeyValuePairs(region, lines) {
  const regionLineEntries = getRegionLineEntries(region, lines)
  if (regionLineEntries.length < 2) return null

  const pairs = []
  let horizontalPairCount = 0
  let colonPairCount = 0
  let dotLeaderCount = 0

  for (let i = 0; i < regionLineEntries.length; i++) {
    const { line, sourceIndex } = regionLineEntries[i]
    const text = (line.text || '').trim()
    if (!text) continue

    const colonMatch = text.match(/^(.+?):\s*(.+)$/)
    if (colonMatch) {
      const label = colonMatch[1].trim()
      const value = colonMatch[2].trim()
      if (label && value) {
        pairs.push(Object.freeze({
          label,
          value,
          separator: 'colon',
          labelLineIndex: sourceIndex,
          valueLineIndex: sourceIndex,
          labelBbox: Object.freeze({ x: line.boundingBox.x, y: line.boundingBox.y, width: line.boundingBox.width * 0.4, height: line.boundingBox.height }),
          valueBbox: Object.freeze({ x: line.boundingBox.x + line.boundingBox.width * 0.45, y: line.boundingBox.y, width: line.boundingBox.width * 0.55, height: line.boundingBox.height }),
          financial: buildPairFinancial(label, value)
        }))
        colonPairCount++
        continue
      }
    }

    if (DOT_LEADER_PATTERN.test(text)) {
      const dotMatch = text.match(/^(.+?)[.…]{2,}\s*(.+)$/)
      if (dotMatch) {
        const label = dotMatch[1].trim()
        const value = dotMatch[2].trim()
        if (label && value) {
          pairs.push(Object.freeze({
            label,
            value,
            separator: 'dot-leader',
            labelLineIndex: sourceIndex,
            valueLineIndex: sourceIndex,
            labelBbox: Object.freeze({ x: line.boundingBox.x, y: line.boundingBox.y, width: line.boundingBox.width * 0.5, height: line.boundingBox.height }),
            valueBbox: Object.freeze({ x: line.boundingBox.x + line.boundingBox.width * 0.55, y: line.boundingBox.y, width: line.boundingBox.width * 0.45, height: line.boundingBox.height }),
            financial: buildPairFinancial(label, value)
          }))
          dotLeaderCount++
          continue
        }
      }
    }

    if (line.items && line.items.length >= 2) {
      const sorted = [...line.items].sort((a, b) => a.x - b.x)
      const gap = sorted[1].x - (sorted[0].right || sorted[0].x + sorted[0].width)
      if (gap > (sorted[0].width || 20) * 0.5) {
        const label = (sorted[0].text || '').trim()
        const value = (sorted[1].text || '').trim()
        if (label && value && isLabelLine(label)) {
          pairs.push(Object.freeze({
            label,
            value,
            separator: 'space',
            labelLineIndex: sourceIndex,
            valueLineIndex: sourceIndex,
            labelBbox: Object.freeze({ x: sorted[0].x, y: sorted[0].y || line.boundingBox.y, width: sorted[0].width || 60, height: sorted[0].height || line.boundingBox.height }),
            valueBbox: Object.freeze({ x: sorted[1].x, y: sorted[1].y || line.boundingBox.y, width: sorted[1].width || 60, height: sorted[1].height || line.boundingBox.height }),
            financial: buildPairFinancial(label, value)
          }))
          horizontalPairCount++
        }
      }
    }
  }

  if (pairs.length === 0) return null

  return { pairs, horizontalPairCount, colonPairCount, dotLeaderCount }
}

function computeKeyValueConfidence(kvResult, lineCount) {
  if (!kvResult) return 0
  const { pairs, horizontalPairCount, colonPairCount, dotLeaderCount } = kvResult

  const hasExplicitPair = colonPairCount > 0 || dotLeaderCount > 0
  const pairCount = pairs.length

  if (pairCount < 1) return 0
  if (pairCount < KV_MIN_PAIRS && !hasExplicitPair) return 0

  const pairScore = Math.min(pairCount / 3, 1)
  const explicitScore = hasExplicitPair ? 0.9 : 0.3
  const alignmentScore = horizontalPairCount > 0 ? 0.8 : 0.4
  const lineScore = lineCount >= 2 && lineCount <= 8 ? 0.7 : 0.3

  return (
    pairScore * KV_WEIGHT_PAIR_COUNT +
    explicitScore * KV_WEIGHT_COLON_PAIR +
    alignmentScore * KV_WEIGHT_CONSISTENT_ALIGNMENT +
    lineScore * 0.2
  )
}

function buildKeyValueSemantic(region, lines) {
  const kvResult = detectKeyValuePairs(region, lines)
  if (!kvResult) return null

  const regionLineEntries = getRegionLineEntries(region, lines)
  const confidence = computeKeyValueConfidence(kvResult, regionLineEntries.length)

  if (confidence < KV_CONFIDENCE_THRESHOLD) return null

  return Object.freeze({
    type: 'key-value-candidate',
    confidence: Math.round(confidence * 100) / 100,
    signals: Object.freeze({
      horizontalPairRatio: regionLineEntries.length > 0 ? Math.round((kvResult.horizontalPairCount / regionLineEntries.length) * 100) / 100 : 0,
      colonPairRatio: regionLineEntries.length > 0 ? Math.round((kvResult.colonPairCount / regionLineEntries.length) * 100) / 100 : 0,
      dottedLeaderRatio: regionLineEntries.length > 0 ? Math.round((kvResult.dotLeaderCount / regionLineEntries.length) * 100) / 100 : 0,
      pairCount: kvResult.pairs.length,
      consistentAlignment: kvResult.horizontalPairCount > 0
    }),
    pairs: Object.freeze(kvResult.pairs)
  })
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

  const entries = regionLineEntries.map(({ line, sourceIndex }) => {
    const text = (line.text || '').trim()
    if (!text) return { line, sourceIndex, text, role: 'other' }
    if (isFinancialValue(text)) {
      if (isStandaloneDeltaLine(text)) return { line, sourceIndex, text, role: 'delta' }
      return { line, sourceIndex, text, role: 'value' }
    }
    if (isLabelLine(text)) return { line, sourceIndex, text, role: 'label' }
    return { line, sourceIndex, text, role: 'other' }
  })

  const hasValueLines = entries.some((e) => e.role === 'value')
  if (!hasValueLines) {
    for (const entry of entries) {
      if (entry.role === 'delta') entry.role = 'value'
    }
  }

  const metrics = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.role !== 'value') continue

    let unit = null
    if (CURRENCY_PATTERN.test(entry.text)) unit = 'currency'
    else if (PERCENTAGE_PATTERN.test(entry.text)) unit = 'percentage'

    let label = null
    let labelSourceIndex = null
    for (let j = i - 1; j >= 0; j--) {
      if (entries[j].role === 'label') {
        label = entries[j].text
        labelSourceIndex = entries[j].sourceIndex
        break
      }
    }
    if (!label) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].role === 'label') {
          label = entries[j].text
          labelSourceIndex = entries[j].sourceIndex
          break
        }
      }
    }

    metrics.push({
      label: label || '',
      value: entry.text,
      unit,
      delta: null,
      valueLineIndex: entry.sourceIndex,
      labelLineIndex: labelSourceIndex,
      deltaLineIndex: null,
      financial: buildFinancialMetadata(entry.text, label)
    })
  }

  const deltaAttachedMetrics = new Set()

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.role !== 'delta') continue

    const deltaText = entry.text
    const { delta: deltaValue, period } = extractDeltaAndPeriod(deltaText)
    const deltaPolarity = detectPolarity(deltaText)

    let attached = false

    for (let m = metrics.length - 1; m >= 0; m--) {
      if (deltaAttachedMetrics.has(m)) continue
      if (metrics[m].valueLineIndex < entry.sourceIndex) {
        let hasInterveningValue = false
        for (let j = i - 1; j >= 0; j--) {
          if (entries[j].role === 'value' && entries[j].sourceIndex > metrics[m].valueLineIndex) {
            hasInterveningValue = true
            break
          }
        }
        if (!hasInterveningValue) {
          const existingFinancial = metrics[m].financial || {}
          metrics[m] = Object.freeze({
            ...metrics[m],
            delta: deltaText,
            deltaLineIndex: entry.sourceIndex,
            financial: Object.freeze({
              ...existingFinancial,
              ...(deltaValue && { delta: deltaValue }),
              ...(period && { period }),
              ...(deltaPolarity !== 'neutral' && existingFinancial.polarity === 'neutral' && { polarity: deltaPolarity })
            })
          })
          deltaAttachedMetrics.add(m)
          attached = true
          break
        }
      }
    }

    if (!attached) {
      let hasPriorLabel = false
      for (let j = i - 1; j >= 0; j--) {
        if (entries[j].role === 'label') {
          hasPriorLabel = true
          break
        }
      }

      if (hasPriorLabel) {
        for (let m = 0; m < metrics.length; m++) {
          if (deltaAttachedMetrics.has(m)) continue
          if (metrics[m].valueLineIndex > entry.sourceIndex) {
            let hasInterveningValue = false
            for (let j = i + 1; j < entries.length; j++) {
              if (entries[j].role === 'value' && entries[j].sourceIndex < metrics[m].valueLineIndex) {
                hasInterveningValue = true
                break
              }
            }
            if (!hasInterveningValue) {
              const existingFinancial = metrics[m].financial || {}
              metrics[m] = Object.freeze({
                ...metrics[m],
                delta: deltaText,
                deltaLineIndex: entry.sourceIndex,
                financial: Object.freeze({
                  ...existingFinancial,
                  ...(deltaValue && { delta: deltaValue }),
                  ...(period && { period }),
                  ...(deltaPolarity !== 'neutral' && existingFinancial.polarity === 'neutral' && { polarity: deltaPolarity })
                })
              })
              deltaAttachedMetrics.add(m)
              attached = true
              break
            }
          }
        }
      }
    }
  }

  return metrics.map((m) => {
    const financial = m.financial || null
    if (!financial) return Object.freeze({ ...m, financial: null })
    const subtypes = classifyFinancialSubtypes({
      label: m.label,
      value: m.value,
      financial,
      kind: 'metric',
      delta: m.delta
    })
    return Object.freeze({
      ...m,
      financial: subtypes ? Object.freeze({ ...financial, ...subtypes }) : Object.freeze({ ...financial, subtype: null })
    })
  })
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

  const kpiSignals = computeSignals(region, lines)
  const kpiConfidence = computeConfidence(kpiSignals)

  const kvSemantic = buildKeyValueSemantic(region, lines)
  const kvConfidence = kvSemantic ? kvSemantic.confidence : 0

  if (kpiConfidence >= KPI_CONFIDENCE_THRESHOLD && kpiConfidence >= kvConfidence) {
    const metrics = detectMetrics(region, lines)
    return Object.freeze({
      type: 'kpi-candidate',
      confidence: Math.round(kpiConfidence * 100) / 100,
      signals: Object.freeze({
        numericLineRatio: Math.round(kpiSignals.numericLineRatio * 100) / 100,
        shortLineRatio: Math.round(kpiSignals.shortLineRatio * 100) / 100,
        fontHierarchyRatio: Math.round(kpiSignals.fontHierarchyRatio * 100) / 100,
        currencyOrPercentSignal: Math.round(kpiSignals.currencyOrPercentSignal * 100) / 100,
        lineCount: kpiSignals.lineCount
      }),
      metrics: Object.freeze(metrics)
    })
  }

  if (kvConfidence >= KV_CONFIDENCE_THRESHOLD && kvConfidence > kpiConfidence) {
    return kvSemantic
  }

  if (kpiConfidence >= KPI_CONFIDENCE_THRESHOLD) {
    const metrics = detectMetrics(region, lines)
    return Object.freeze({
      type: 'kpi-candidate',
      confidence: Math.round(kpiConfidence * 100) / 100,
      signals: Object.freeze({
        numericLineRatio: Math.round(kpiSignals.numericLineRatio * 100) / 100,
        shortLineRatio: Math.round(kpiSignals.shortLineRatio * 100) / 100,
        fontHierarchyRatio: Math.round(kpiSignals.fontHierarchyRatio * 100) / 100,
        currencyOrPercentSignal: Math.round(kpiSignals.currencyOrPercentSignal * 100) / 100,
        lineCount: kpiSignals.lineCount
      }),
      metrics: Object.freeze(metrics)
    })
  }

  if (kvConfidence >= KV_CONFIDENCE_THRESHOLD) {
    return kvSemantic
  }

  return null
}

const DASHBOARD_MIN_REGIONS = 2
const DASHBOARD_Y_TOLERANCE_MULTIPLIER = 2
const DASHBOARD_SIZE_SIMILARITY = 0.35
const DASHBOARD_MAX_GAP_MULTIPLIER = 4

function detectDashboardGroups(enrichedRegions, lines) {
  const semanticRegions = enrichedRegions.filter((r) => {
    const semanticType = r.metadata?.semantic?.type
    return semanticType === 'kpi-candidate' || semanticType === 'key-value-candidate'
  })

  if (semanticRegions.length < DASHBOARD_MIN_REGIONS) {
    return enrichedRegions
  }

  const medianFontSize = getMedianFontSizeForRegions(semanticRegions, lines)
  const yTolerance = medianFontSize * DASHBOARD_Y_TOLERANCE_MULTIPLIER
  const maxGap = medianFontSize * DASHBOARD_MAX_GAP_MULTIPLIER

  const sorted = [...semanticRegions].sort((a, b) => {
    const ay = a.boundingBox.y
    const by = b.boundingBox.y
    if (Math.abs(ay - by) <= yTolerance) return a.boundingBox.x - b.boundingBox.x
    return ay - by
  })

  const groups = []
  let currentGroup = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1]
    const curr = sorted[i]

    const yDiff = Math.abs(prev.boundingBox.y - curr.boundingBox.y)
    const sizeDiffW = Math.abs(prev.boundingBox.width - curr.boundingBox.width) / Math.max(prev.boundingBox.width, 1)
    const sizeDiffH = Math.abs(prev.boundingBox.height - curr.boundingBox.height) / Math.max(prev.boundingBox.height, 1)
    const xGap = curr.boundingBox.x - (prev.boundingBox.x + prev.boundingBox.width)

    const sameRow = yDiff <= yTolerance
    const similarSize = sizeDiffW <= DASHBOARD_SIZE_SIMILARITY && sizeDiffH <= DASHBOARD_SIZE_SIMILARITY
    const closeEnough = xGap <= maxGap && xGap >= -maxGap

    if (sameRow && similarSize && closeEnough) {
      currentGroup.push(curr)
    } else {
      if (currentGroup.length >= DASHBOARD_MIN_REGIONS) {
        groups.push(currentGroup)
      }
      currentGroup = [curr]
    }
  }

  if (currentGroup.length >= DASHBOARD_MIN_REGIONS) {
    groups.push(currentGroup)
  }

  if (groups.length === 0) {
    return enrichedRegions
  }

  const groupIdSet = new Map()
  for (const group of groups) {
    const groupId = `dashboard-${group[0].id}`
    const regionIds = group.map((r) => r.id)

    let layout = 'row'
    if (group.length >= 2) {
      const allSameY = group.every((r) => Math.abs(r.boundingBox.y - group[0].boundingBox.y) <= yTolerance)
      const allDifferentX = new Set(group.map((r) => Math.round(r.boundingBox.x))).size === group.length

      if (allSameY && allDifferentX) {
        layout = 'row'
      } else if (!allSameY && group.every((r) => Math.abs(r.boundingBox.x - group[0].boundingBox.x) <= yTolerance)) {
        layout = 'column'
      } else {
        layout = 'grid'
      }
    }

    // NOTE: Grid detection is limited — the grouping pass only forms same-row groups,
    // so a 2x2 grid produces two row-groups instead of one grid-group.
    // Multi-row grid merging is deferred to a future phase.

    const avgConfidence = group.reduce((sum, r) => sum + (r.metadata?.semantic?.confidence || 0), 0) / group.length
    const confidence = Math.round(avgConfidence * 100) / 100

    for (const r of group) {
      groupIdSet.set(r.id, Object.freeze({
        groupId,
        layout,
        confidence,
        regionIds: Object.freeze(regionIds),
        role: 'member'
      }))
    }
  }

  return enrichedRegions.map((region) => {
    const dashboardGroup = groupIdSet.get(region.id)
    if (!dashboardGroup) return region

    return Object.freeze({
      ...region,
      childRegionIds: Object.freeze([...region.childRegionIds]),
      blockIds: Object.freeze([...region.blockIds]),
      metadata: Object.freeze({
        ...region.metadata,
        semantic: Object.freeze({
          ...region.metadata.semantic,
          dashboardGroup
        })
      })
    })
  })
}

function getMedianFontSizeForRegions(regions, lines) {
  const regionLines = []
  for (const region of regions) {
    for (const line of lines) {
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
        regionLines.push(line)
      }
    }
  }

  const sizes = regionLines.map((l) => l.fontSize || 12)
  if (!sizes.length) return 12

  const sorted = [...sizes].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Enrich non-table regions with semantic metadata for KPI candidates
 * and detect dashboard groups.
 *
 * Returns a new frozen array of regions. For regions that match KPI candidate
 * criteria, adds a `semantic` field to metadata. Non-matching regions are unchanged.
 * Dashboard groups are detected and attached to member regions.
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

  return Object.freeze(detectDashboardGroups(enrichedRegions, lines))
}

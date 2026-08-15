/**
 * Pure structural parser for V3 marker-bearing text.
 *
 * This module only describes observed marker intervals. Expected-unit mapping,
 * provider validity, and DOM reconstruction remain owned by their consumers.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createMarkerRegex({ sessionId = '', entropy = '', grammar = 'auto' } = {}) {
  if (grammar === 'legacy') return /@@\s*SEG\s*_\s*(n\d+)\s*@@/giu

  if (sessionId) {
    const escapedSessionId = escapeRegExp(sessionId)
    if (entropy) {
      return new RegExp(
        `@@\\s*TI\\s*_\\s*SEG\\s*_\\s*${escapeRegExp(entropy)}\\s*_\\s*${escapedSessionId}\\s*_\\s*(n\\d+)\\s*@@`,
        'giu',
      )
    }
    return new RegExp(
      `@@\\s*TI\\s*_\\s*SEG\\s*_\\s*${escapedSessionId}\\s*_\\s*(n\\d+)\\s*@@`,
      'giu',
    )
  }

  if (grammar === 'ti') {
    return /@@\s*TI\s*_\s*SEG\s*_\s*(?:(?:[a-z0-9]+)\s*_\s*)?[a-z0-9]+\s*_\s*(n\d+)\s*@@/giu
  }

  return /@@\s*(?:(?:TI\s*_\s*SEG\s*_\s*(?:(?:[a-z0-9]+)\s*_\s*)?[a-z0-9]+)|SEG)\s*_\s*(n\d+)\s*@@/giu
}

function getMarkerIdentity(raw) {
  const compact = raw.replace(/\s+/g, '')
  const parts = compact.slice(2, -2).split('_')
  const isTiMarker = parts[0].toLowerCase() === 'ti' && parts[1].toLowerCase() === 'seg'
  const markerId = parts.at(-1)
  const components = isTiMarker ? parts.slice(2, -1) : []
  const entropy = isTiMarker && components.length === 2 ? components[0].toLowerCase() : null
  const sessionId = isTiMarker
    ? components.at(-1)?.toLowerCase() || null
    : null
  const normalizedIdentity = isTiMarker
    ? ['TI', 'SEG', entropy, sessionId, markerId].filter(Boolean).join('_')
    : ['SEG', markerId].join('_')

  return { markerId, entropy, sessionId, normalizedIdentity }
}

/**
 * Escape-token regex for literal delimiter escaping.
 *
 * Matches only the canonical tokens produced by BlockGroupReconstructor.injectMarkers()
 * and restored verbatim by BlockGroupReconstructor.apply():
 *   @@TI_ESC_<entropy>@@   (entropy = lowercase base36)
 *   @@TI_ESC@@             (fallback when no entropy is provided)
 *
 * Strict by design: marker tolerance (internal whitespace, keyword casing) is NOT
 * inherited here. A token is masked only when the downstream unescape path can
 * reliably restore it, so a provider-mutated token stays visible to
 * orphan-delimiter detection.
 */
function createEscapeTokenRegex() {
  return /@@TI_ESC(?:_[a-z0-9]+)?@@/g
}

/**
 * Scan for orphan `@@` delimiters that belong to no valid token.
 *
 * Structural-only: positions inside well-formed markers (from the marker regex)
 * and well-formed escape tokens (TI_ESC) are masked. Any remaining `@@` pair in
 * the original text is raw delimiter residue that the provider must not emit.
 *
 * @param {string} text - The scanned text
 * @param {Object[]} markers - Discovered valid markers (start/end spans)
 * @param {Object[]} escapeTokens - Discovered valid escape tokens (start/end spans)
 * @returns {number[]} Positions of orphan `@@` delimiters in `text`
 */
function findOrphanDelimiters(text, markers, escapeTokens) {
  const ranges = markers.map(({ start, end }) => ({ start, end }))
    .concat(escapeTokens.map(({ start, end }) => ({ start, end })))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const orphans = []
  let rangeIndex = 0
  let index = 0
  while (index < text.length) {
    while (rangeIndex < ranges.length && ranges[rangeIndex].end <= index) rangeIndex++
    const current = ranges[rangeIndex]
    const insideToken = current !== undefined && index >= current.start && index < current.end

    if (text[index] === '@' && text[index + 1] === '@') {
      if (!insideToken) orphans.push(index)
      index += 2
    } else {
      index += 1
    }
  }
  return orphans
}

/**
 * Parse observed V3 intervals without applying semantic policy.
 *
 * @param {string} text - Marker-bearing source or translated text
 * @param {Object} options - Grammar/session options
 * @returns {{leadingText: string, intervals: Object[], markers: Object[], structuralFacts: Object}}
 */
export function parseV3Intervals(text, options = {}) {
  if (typeof text !== 'string') {
    return {
      leadingText: '',
      intervals: [],
      markers: [],
      structuralFacts: { invalidInput: true, isV3: false, orphanDelimiters: [] },
    }
  }

  const regex = createMarkerRegex(options)
  const markers = []
  let match

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0]
    const identity = getMarkerIdentity(raw)
    markers.push({
      raw,
      markerId: identity.markerId,
      normalizedId: identity.markerId,
      entropy: identity.entropy,
      sessionId: identity.sessionId,
      normalizedIdentity: identity.normalizedIdentity,
      start: match.index,
      end: match.index + raw.length,
    })
  }

  const escapeTokens = []
  const escapeRegex = createEscapeTokenRegex()
  let escapeMatch
  while ((escapeMatch = escapeRegex.exec(text)) !== null) {
    escapeTokens.push({
      start: escapeMatch.index,
      end: escapeMatch.index + escapeMatch[0].length,
    })
  }

  const orphanDelimiters = findOrphanDelimiters(text, markers, escapeTokens)

  const leadingText = markers.length > 0 ? text.slice(0, markers[0].start) : text
  const intervals = [{
    markerId: null,
    text: leadingText,
    start: 0,
    end: markers.length > 0 ? markers[0].start : text.length,
  }]

  markers.forEach((marker, index) => {
    const start = marker.end
    const end = index + 1 < markers.length ? markers[index + 1].start : text.length
    intervals.push({
      markerId: marker.markerId,
      text: text.slice(start, end),
      start,
      end,
    })
  })

  return {
    leadingText,
    intervals,
    markers,
    structuralFacts: {
      invalidInput: false,
      isV3: markers.length > 0,
      orphanDelimiters,
    },
  }
}

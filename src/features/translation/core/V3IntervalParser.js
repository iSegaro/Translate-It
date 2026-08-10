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
      structuralFacts: { invalidInput: true, isV3: false },
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
    },
  }
}

import { describe, expect, it } from 'vitest'
import { parseV3Intervals } from './V3IntervalParser.js'

describe('parseV3Intervals', () => {
  it('preserves leading and marker-owned interval text', () => {
    const result = parseV3Intervals('A@@TI_SEG_e1_s1_n2@@B@@TI_SEG_e1_s1_n3@@C', { grammar: 'ti' })

    expect(result.intervals.map(({ markerId, text }) => ({ markerId, text }))).toEqual([
      { markerId: null, text: 'A' },
      { markerId: 'n2', text: 'B' },
      { markerId: 'n3', text: 'C' },
    ])
    expect(result.markers).toHaveLength(2)
  })

  it('accepts translated marker whitespace without applying semantic policy', () => {
    const result = parseV3Intervals('A@@ TI _ SEG _ e1 _ s1 _ n2 @@B', { grammar: 'ti' })

    expect(result.structuralFacts.isV3).toBe(true)
    expect(result.intervals[1]).toMatchObject({ markerId: 'n2', text: 'B' })
    expect(result.markers[0]).toMatchObject({
      entropy: 'e1',
      sessionId: 's1',
      normalizedIdentity: 'TI_SEG_e1_s1_n2',
    })
  })

  it('exposes full marker identity components without classifying validity', () => {
    const exact = parseV3Intervals('A@@TI_SEG_e1_s1_n13@@B', { grammar: 'ti' })
    const tolerant = parseV3Intervals('A@@ti _ seg _ E1 _ S1 _ n13@@B', { grammar: 'ti' })
    const uppercaseId = parseV3Intervals('A@@TI_SEG_e1_s1_N13@@B', { grammar: 'ti' })

    expect(exact.markers[0]).toMatchObject({
      entropy: 'e1',
      sessionId: 's1',
      markerId: 'n13',
      normalizedIdentity: 'TI_SEG_e1_s1_n13',
    })
    expect(tolerant.markers[0].normalizedIdentity).toBe(exact.markers[0].normalizedIdentity)
    expect(uppercaseId.markers[0].normalizedIdentity).not.toBe(exact.markers[0].normalizedIdentity)
    expect(tolerant.structuralFacts).toEqual({ invalidInput: false, isV3: true })
  })

  it('keeps escaped literal delimiters as interval text', () => {
    const result = parseV3Intervals('A@@TI_ESC_e1@@B@@TI_SEG_e1_s1_n2@@C', { grammar: 'ti' })

    expect(result.intervals[0].text).toBe('A@@TI_ESC_e1@@B')
  })

  it('leaves duplicate marker interpretation to the validator', () => {
    const result = parseV3Intervals('A@@TI_SEG_e1_s1_n2@@B@@TI_SEG_e1_s1_n2@@C', { grammar: 'ti' })

    expect(result.markers.map(({ normalizedId }) => normalizedId)).toEqual(['n2', 'n2'])
    expect(result.structuralFacts).toEqual({ invalidInput: false, isV3: true })
  })
})

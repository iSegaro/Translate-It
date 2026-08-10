import { describe, expect, it } from 'vitest'
import { createParserSnapshot } from '../providers/utils/ParserSnapshot.js'
import { createManifestView, createRequestUnitManifest } from '../ir/RequestUnitManifest.js'
import { TranslationContractValidator } from './TranslationContractValidator.js'

describe('TranslationContractValidator', () => {
  describe('V3 marker ownership', () => {
    const source = 'Purchases@@TI_SEG_e1_s1_n13@@video game publisher@@TI_SEG_e1_s1_n14@@Electronic Arts'

    it('accepts ownership-preserving intervals', () => {
      const result = TranslationContractValidator.validateV3Parent(
        source,
        'خرید@@TI_SEG_e1_s1_n13@@ناشر بازی‌های ویدئویی@@TI_SEG_e1_s1_n14@@الکترونیک آرتس',
        'g5',
      )

      expect(result).toMatchObject({ isValid: true, violations: [] })
    })

    it('rejects a blank meaningful member interval', () => {
      const result = TranslationContractValidator.validateV3Parent(
        source,
        'خرید@@TI_SEG_e1_s1_n13@@ @@TI_SEG_e1_s1_n14@@الکترونیک آرتس',
        'g5',
      )

      expect(result.violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'V3_EMPTY_TRANSLATED_INTERVAL', markerId: 'n13' }),
      ]))
    })

    it('rejects foreign entropy and session while preserving marker diagnostics', () => {
      const foreignEntropy = TranslationContractValidator.validateV3Parent(
        'A@@TI_SEG_e1_s1_n13@@B',
        'الف@@TI_SEG_x9_s1_n13@@ب',
        'g5',
      )
      const foreignSession = TranslationContractValidator.validateV3Parent(
        'A@@TI_SEG_e1_s1_n13@@B',
        'الف@@TI_SEG_e1_s999_n13@@ب',
        'g5',
      )
      const uppercaseMarkerId = TranslationContractValidator.validateV3Parent(
        'A@@TI_SEG_e1_s1_n13@@B',
        'الف@@TI_SEG_e1_s1_N13@@ب',
        'g5',
      )

      expect(foreignEntropy.violations.map(({ code }) => code)).toContain('V3_MARKER_IDENTITY_MISMATCH')
      expect(foreignSession.violations.map(({ code }) => code)).toContain('V3_MARKER_IDENTITY_MISMATCH')
      expect(uppercaseMarkerId.violations.map(({ code }) => code)).toContain('V3_MARKER_IDENTITY_MISMATCH')
      expect(foreignEntropy.violations[0].reason).toBe('MARKER_SEQUENCE_MISMATCH')
    })

    it('reports marker identity and order violations', () => {
      const duplicate = TranslationContractValidator.validateV3Parent(
        source,
        'خرید@@TI_SEG_e1_s1_n13@@ناشر@@TI_SEG_e1_s1_n13@@الکترونیک آرتس',
        'g5',
      )
      const missing = TranslationContractValidator.validateV3Parent(source, 'خرید', 'g5')

      expect(duplicate.violations.map(({ code }) => code)).toContain('V3_DUPLICATE_MARKER')
      expect(duplicate.violations.map(({ code }) => code)).toContain('V3_MISSING_MARKER')
      expect(missing.violations.map(({ code }) => code)).toContain('V3_MISSING_MARKER')
      expect(missing.violations[0].reason).toBe('MARKER_COUNT_MISMATCH')
    })

    it('validates marker-owned intervals even when the leading interval is empty', () => {
      const result = TranslationContractValidator.validateV3Parent(
        '@@TI_SEG_e1_s1_n2@@foo@@TI_SEG_e1_s1_n3@@bar',
        '@@TI_SEG_e1_s1_n2@@ @@TI_SEG_e1_s1_n3@@',
        'g5',
      )

      expect(result.violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'V3_EMPTY_TRANSLATED_INTERVAL', markerId: 'n2' }),
        expect.objectContaining({ code: 'V3_EMPTY_TRANSLATED_INTERVAL', markerId: 'n3' }),
      ]))
    })
  })

  describe('response identity namespaces', () => {
    const logicalUnits = [{ i: 'g1', t: 'one' }, { i: 'g2', t: 'two' }]
    const manifestView = createManifestView(createRequestUnitManifest(logicalUnits))

    it('accepts positional wire IDs only in positional-wire mode', () => {
      const result = TranslationContractValidator.validate(
        manifestView,
        createParserSnapshot([{ id: '0', text: 'یک' }, { id: '1', text: 'دو' }]),
        undefined,
        { responseIdentityMode: 'positional-wire' },
      )

      expect(result).toMatchObject({ isValid: true, orderingFacts: { mode: 'POSITIONAL_WIRE', isInRequestOrder: true } })
      expect(result.violations).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'UNKNOWN_RESPONSE_ID' }),
      ]))
    })

    it('keeps logical identity mode strict for numeric response IDs', () => {
      const result = TranslationContractValidator.validate(
        manifestView,
        createParserSnapshot([{ id: '0', text: 'یک' }, { id: '1', text: 'دو' }]),
        undefined,
        { responseIdentityMode: 'logical' },
      )

      expect(result.violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'UNKNOWN_RESPONSE_ID' }),
      ]))
    })

    it.each([
      ['duplicate', [{ id: '0', text: 'یک' }, { id: '0', text: 'دو' }], 'DUPLICATE_RESPONSE_ID'],
      ['out of range', [{ id: '0', text: 'یک' }, { id: '9', text: 'دو' }], 'UNKNOWN_RESPONSE_ID'],
      ['non-numeric', [{ id: '0', text: 'یک' }, { id: 'foo', text: 'دو' }], 'UNKNOWN_RESPONSE_ID'],
    ])('rejects positional-wire %s IDs', (_label, units, code) => {
      const result = TranslationContractValidator.validate(
        manifestView,
        createParserSnapshot(units),
        undefined,
        { responseIdentityMode: 'positional-wire' },
      )

      expect(result.violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ code }),
      ]))
    })
  })

  it('records identity, cardinality, ordering, shape, and empty-content facts without changing candidates', () => {
    const nestedText = { unexpected: true }
    const snapshot = createParserSnapshot([
      { i: 'second', t: 'translated' },
      { i: 'second', t: '' },
      { i: 'unknown', t: nestedText },
    ], { repaired: true })
    const requestedUnits = [
      { i: 'first', t: 'source one' },
      { i: 'second', t: 'source two' },
    ]
    const result = TranslationContractValidator.validate(
      createManifestView(createRequestUnitManifest(requestedUnits)),
      snapshot,
      snapshot.parserEvidence,
    )

    expect(result).toMatchObject({
      isValid: false,
      missingUnitIds: ['first'],
      duplicateUnitIds: ['second'],
      unknownUnitIds: ['unknown'],
      orderingFacts: { mode: 'IDENTITY', isInRequestOrder: false },
      cardinality: { expectedCount: 2, receivedCount: 3 },
      parserEvidence: { repaired: true },
    })
    expect(result.violations.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'DUPLICATE_RESPONSE_ID',
      'EMPTY_TRANSLATED_TEXT',
      'UNKNOWN_RESPONSE_ID',
      'INVALID_TRANSLATED_TEXT',
      'CARDINALITY_MISMATCH',
      'MISSING_REQUESTED_UNITS',
    ]))
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.units[0])).toBe(true)
    expect(snapshot.units[2].translatedText).toBe(nestedText)
    expect(Object.isFrozen(nestedText)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result.validatedUnits).toEqual([
      { requestIndex: 0, unitId: 'first', violationCodes: ['MISSING_REQUESTED_UNIT'] },
      { requestIndex: 1, unitId: 'second', violationCodes: ['DUPLICATE_RESPONSE_ID', 'EMPTY_TRANSLATED_TEXT'] },
    ])
  })

  it('validates string arrays positionally', () => {
    const requestedUnits = ['source one', 'source two']
    const result = TranslationContractValidator.validate(
      createManifestView(createRequestUnitManifest(requestedUnits)),
      createParserSnapshot(['one', 'two']),
      undefined,
    )

    expect(result).toMatchObject({
      isValid: true,
      orderingFacts: { mode: 'POSITIONAL', isInRequestOrder: true },
    })
    expect(result.validatedUnits).toEqual([
      { requestIndex: 0, unitId: 'unit-0', translatedText: 'one', violationCodes: [] },
      { requestIndex: 1, unitId: 'unit-1', translatedText: 'two', violationCodes: [] },
    ])
  })

  it('reports observational facts for mixed identity, surplus, and invalid text candidates', () => {
    const requestedUnits = [{ id: 'x', text: 'A' }, { id: 'y', text: 'B' }]
    const result = TranslationContractValidator.validate(
      createManifestView(createRequestUnitManifest(requestedUnits)),
      createParserSnapshot([
        { id: 0, text: 'AA' },
        { id: 'y', text: null },
        { id: 'extra', text: [] },
        { text: 'missing-id' },
      ]),
    )

    expect(result.violations.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'UNKNOWN_RESPONSE_ID',
      'INVALID_TRANSLATED_TEXT',
      'MISSING_RESPONSE_ID',
      'CARDINALITY_MISMATCH',
    ]))
  })
})

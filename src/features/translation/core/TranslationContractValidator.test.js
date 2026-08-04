import { describe, expect, it } from 'vitest'
import { createParserSnapshot } from '../providers/utils/ParserSnapshot.js'
import { createManifestView, createRequestUnitManifest } from '../ir/RequestUnitManifest.js'
import { TranslationContractValidator } from './TranslationContractValidator.js'

describe('TranslationContractValidator', () => {
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

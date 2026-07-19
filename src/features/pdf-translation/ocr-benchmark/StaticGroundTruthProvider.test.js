import { describe, expect, it } from 'vitest'
import { StaticGroundTruthProvider } from './StaticGroundTruthProvider.js'

describe('StaticGroundTruthProvider', () => {
  it('returns its supplied reference text', () => {
    expect(new StaticGroundTruthProvider('reference text').getReferenceText()).toBe('reference text')
  })

  it('rejects non-string reference text', () => {
    expect(() => new StaticGroundTruthProvider(null)).toThrow(TypeError)
  })
})

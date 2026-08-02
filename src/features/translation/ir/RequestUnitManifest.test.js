import { describe, expect, it } from 'vitest'
import { createManifestView, createRequestUnitManifest, MappingStrategy } from './RequestUnitManifest.js'

describe('RequestUnitManifest', () => {
  it('creates a frozen execution-owned identity manifest', () => {
    const manifest = createRequestUnitManifest(['one', 'two'])

    expect(manifest).toEqual({
      units: [
        { unitId: 'unit-0', requestIndex: 0 },
        { unitId: 'unit-1', requestIndex: 1 },
      ],
      declaredMappingStrategy: MappingStrategy.POSITIONAL_ONLY,
    })
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.units)).toBe(true)
    expect(Object.isFrozen(manifest.units[0])).toBe(true)
  })

  it('creates frozen batch views with stable manifest unit identities', () => {
    const manifest = createRequestUnitManifest([{ id: 'first' }, { id: 'second' }, { id: 'third' }])
    const firstBatch = createManifestView(manifest, [0, 1])
    const secondBatch = createManifestView(manifest, [2])

    expect(firstBatch.declaredMappingStrategy).toBe(MappingStrategy.IDENTITY_REQUIRED)
    expect(firstBatch.units[0]).toBe(manifest.units[0])
    expect(secondBatch.units[0]).toBe(manifest.units[2])
    expect(secondBatch.units[0]).toEqual({ unitId: 'third', requestIndex: 2 })
    expect(Object.isFrozen(firstBatch)).toBe(true)
    expect(Object.isFrozen(firstBatch.units)).toBe(true)
  })
})

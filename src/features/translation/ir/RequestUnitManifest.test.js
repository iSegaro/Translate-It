import { describe, expect, it } from 'vitest'
import { createManifestView, createManifestViewFromUnits, createRequestUnitManifest, MappingStrategy } from './RequestUnitManifest.js'

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

  it('rejects invalid direct views without cloning manifest units', () => {
    const manifest = createRequestUnitManifest(['one', 'two'])

    expect(createManifestView(null)).toBeNull()
    expect(createManifestView({ units: manifest.units, declaredMappingStrategy: 'invalid' })).toBeNull()
    expect(createManifestViewFromUnits(null, manifest.units)).toBeNull()
    expect(createManifestViewFromUnits({ declaredMappingStrategy: 'invalid' }, manifest.units)).toBeNull()
    expect(createManifestViewFromUnits(manifest, [manifest.units[0], manifest.units[0]])).toBeNull()
    expect(createManifestViewFromUnits(manifest, [{ unitId: 'invalid', requestIndex: 2 }])).toBeNull()
    const view = createManifestViewFromUnits(manifest, [manifest.units[1]])
    expect(view?.units[0]).toBe(manifest.units[1])
    expect(view?.declaredMappingStrategy).toBe(manifest.declaredMappingStrategy)
  })
})

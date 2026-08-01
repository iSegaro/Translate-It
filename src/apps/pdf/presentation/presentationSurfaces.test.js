import { describe, expect, it } from 'vitest'

import { createPresentationSurfaces } from './presentationSurfaces.js'

describe('Presentation Surfaces', () => {
  it('creates frozen adapter registry and stateful surface adapters', () => {
    const surfaces = createPresentationSurfaces()

    expect(Object.isFrozen(surfaces)).toBe(true)
    expect(Object.isFrozen(surfaces.adapters)).toBe(true)
    expect(surfaces.adapters.banner).toBe(surfaces.banner)
    expect(surfaces.adapters['progress-bar']).toBe(surfaces.progress)
    expect(typeof surfaces.adapters.toast.dispatch).toBe('function')
  })
})

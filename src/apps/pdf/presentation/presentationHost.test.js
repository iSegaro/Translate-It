import { describe, expect, it } from 'vitest'

import { DomainEvents } from './domainEvents.js'
import { createPresentationHost } from './presentationHost.js'
import { createPresentationSurfaces } from './presentationSurfaces.js'

function createHost() {
  return createPresentationHost({ surfaces: createPresentationSurfaces() })
}

describe('Presentation Host', () => {
  it('exposes frozen presentation entry point and state snapshots', () => {
    const presentation = createHost()

    expect(Object.isFrozen(presentation)).toBe(true)
    expect(presentation.progressState.value.operation.running).toBe(false)
    expect(presentation.bannerState.value.notification).toBeNull()
  })

  it('synchronizes progress state only when adapter version changes', () => {
    const presentation = createHost()
    const initial = presentation.progressState.value

    presentation.present(DomainEvents.translationStarted())
    const running = presentation.progressState.value
    presentation.present(DomainEvents.translationStarted())

    expect(running).not.toBe(initial)
    expect(running.operation).toMatchObject({ running: true, title: 'Translating visible pages' })
    expect(presentation.progressState.value).toBe(running)
  })

  it('synchronizes banner state for outcome results', () => {
    const presentation = createHost()

    presentation.present(DomainEvents.comparisonFailed({ id: 'comparison:1', error: 'Failed' }))

    expect(presentation.bannerState.value.notification).toMatchObject({
      id: 'comparison:1', variant: 'error', message: 'Failed'
    })
  })
})

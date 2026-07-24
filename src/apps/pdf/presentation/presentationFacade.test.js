import { describe, expect, it, vi } from 'vitest'

import { DomainEvents } from './domainEvents.js'
import { createPresentationFacade } from './presentationFacade.js'

describe('Presentation Facade', () => {
  it('presents a Domain Result through the matching adapter', () => {
    const toast = { dispatch: vi.fn() }
    const presentation = createPresentationFacade({ adapters: { toast } })

    presentation.present(DomainEvents.exportCompleted({ format: 'txt' }))

    expect(toast.dispatch).toHaveBeenCalledWith({
      intent: 'acknowledgement', severity: 'success', message: 'TXT exported successfully'
    })
  })

  it('notifies post-dispatch observers with the Presentation Intent', () => {
    const onPresented = vi.fn()
    const presentation = createPresentationFacade({
      adapters: { toast: { dispatch: vi.fn() } },
      onPresented
    })

    presentation.present(DomainEvents.exportFailed({ error: 'Disk full' }))

    expect(onPresented).toHaveBeenCalledWith({
      intent: 'acknowledgement', severity: 'error', message: 'Disk full'
    })
  })

  it('does not dispatch or notify for unknown Domain Results', () => {
    const toast = { dispatch: vi.fn() }
    const onPresented = vi.fn()
    const presentation = createPresentationFacade({ adapters: { toast }, onPresented })

    presentation.present({ name: 'unknown' })

    expect(toast.dispatch).not.toHaveBeenCalled()
    expect(onPresented).not.toHaveBeenCalled()
  })

  it('returns the adapter result', () => {
    const result = { accepted: true }
    const presentation = createPresentationFacade({
      adapters: { toast: { dispatch: () => result } }
    })

    expect(presentation.present(DomainEvents.exportCompleted({ format: 'txt' }))).toBe(result)
  })

  it('exports a frozen facade', () => {
    expect(Object.isFrozen(createPresentationFacade())).toBe(true)
  })
})

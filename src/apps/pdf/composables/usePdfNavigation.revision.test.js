import { beforeEach, describe, expect, it, vi } from 'vitest'

const nextTickCallbacks = vi.hoisted(() => [])

vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal()),
  nextTick: (callback) => {
    nextTickCallbacks.push(callback)
    return Promise.resolve()
  }
}))

const { ref } = await import('vue')
const { usePdfNavigation } = await import('./usePdfNavigation.js')

describe('usePdfNavigation navigation revision', () => {
  beforeEach(() => {
    nextTickCallbacks.length = 0
  })

  it('keeps navigation state owned by latest deferred page navigation', async () => {
    const session = {
      documentGeneration: 1,
      totalPages: 10,
      loadOutline: vi.fn().mockResolvedValue(null),
      resolveDestination: vi.fn()
    }
    const navigation = usePdfNavigation(ref({ scrollToPage: vi.fn() }), ref(null), ref('original'))
    await navigation.attachDocument(session)

    navigation.navigateToPage(5)
    navigation.navigateToPage(10)

    await nextTickCallbacks[0]()
    expect(navigation.isNavigating.value).toBe(true)

    await nextTickCallbacks[1]()
    expect(navigation.isNavigating.value).toBe(false)
  })
})

import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { usePdfNavigation } from './usePdfNavigation.js'

function createDeferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('usePdfNavigation', () => {
  it('rejects a stale outline and commits the replacement outline', async () => {
    const firstOutline = createDeferred()
    const secondOutline = createDeferred()
    const session = {
      documentGeneration: 1,
      loadOutline: vi.fn()
        .mockReturnValueOnce(firstOutline.promise)
        .mockReturnValueOnce(secondOutline.promise),
      resolveDestination: vi.fn()
    }
    const navigation = usePdfNavigation(ref(null), ref(null), ref('original'))

    const firstAttach = navigation.attachDocument(session)
    navigation.detachDocument()
    session.documentGeneration = 2
    const secondAttach = navigation.attachDocument(session)
    firstOutline.resolve([{ title: 'A', dest: [1] }])
    await firstAttach

    expect(navigation.outline.value).toBeNull()
    expect(navigation.hasOutline.value).toBe(false)

    const replacementOutline = [{ title: 'B', dest: [2] }]
    secondOutline.resolve(replacementOutline)
    await secondAttach

    expect(navigation.outline.value).toEqual(replacementOutline)
    expect(navigation.hasOutline.value).toBe(true)
  })
})

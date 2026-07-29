import { nextTick, ref } from 'vue'
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

  it('does not navigate a replacement document from a stale bookmark', async () => {
    const destination = createDeferred()
    const viewer = { scrollToPage: vi.fn() }
    const session = {
      documentGeneration: 1,
      totalPages: 10,
      loadOutline: vi.fn().mockResolvedValue(null),
      resolveDestination: vi.fn(() => destination.promise)
    }
    const navigation = usePdfNavigation(ref(viewer), ref(null), ref('original'))
    await navigation.attachDocument(session)

    const navigating = navigation.navigateToDestination('chapter-a')
    navigation.detachDocument()
    session.documentGeneration = 2
    await navigation.attachDocument(session)
    destination.resolve({ type: 'page', pageNumber: 5 })
    await navigating

    expect(navigation.currentPage.value).toBe(0)
    expect(viewer.scrollToPage).not.toHaveBeenCalled()
    expect(navigation.isNavigating.value).toBe(false)
  })

  it('keeps latest bookmark navigation when earlier resolution finishes later', async () => {
    const pageFive = createDeferred()
    const pageTen = createDeferred()
    const viewer = { scrollToPage: vi.fn() }
    const session = {
      documentGeneration: 1,
      totalPages: 10,
      loadOutline: vi.fn().mockResolvedValue(null),
      resolveDestination: vi.fn((destination) => destination === 'page-5' ? pageFive.promise : pageTen.promise)
    }
    const navigation = usePdfNavigation(ref(viewer), ref(null), ref('original'))
    await navigation.attachDocument(session)

    const firstNavigation = navigation.navigateToDestination('page-5')
    const secondNavigation = navigation.navigateToDestination('page-10')
    pageTen.resolve({ type: 'page', pageNumber: 10 })
    await secondNavigation
    pageFive.resolve({ type: 'page', pageNumber: 5 })
    await firstNavigation

    expect(navigation.currentPage.value).toBe(10)
    expect(viewer.scrollToPage).toHaveBeenCalledTimes(1)
    expect(viewer.scrollToPage).toHaveBeenCalledWith(10, { left: undefined, top: undefined, zoom: undefined })
  })

  it('lets direct page navigation supersede a pending bookmark', async () => {
    const bookmark = createDeferred()
    const viewer = { scrollToPage: vi.fn() }
    const session = {
      documentGeneration: 1,
      totalPages: 10,
      loadOutline: vi.fn().mockResolvedValue(null),
      resolveDestination: vi.fn(() => bookmark.promise)
    }
    const navigation = usePdfNavigation(ref(viewer), ref(null), ref('original'))
    await navigation.attachDocument(session)

    const bookmarkNavigation = navigation.navigateToDestination('chapter-a')
    navigation.navigateToPage(8)
    bookmark.resolve({ type: 'page', pageNumber: 5 })
    await bookmarkNavigation

    expect(navigation.currentPage.value).toBe(8)
    expect(viewer.scrollToPage).toHaveBeenCalledTimes(1)
    expect(viewer.scrollToPage).toHaveBeenCalledWith(8, {})
  })

  it('does not cache a stale page resolution after replacement', async () => {
    const firstResolution = createDeferred()
    const secondResolution = createDeferred()
    const session = {
      documentGeneration: 1,
      totalPages: 20,
      loadOutline: vi.fn().mockResolvedValue([{ title: 'Chapter', dest: 'chapter' }]),
      resolveDestination: vi.fn(() => (
        session.documentGeneration === 1 ? firstResolution.promise : secondResolution.promise
      ))
    }
    const navigation = usePdfNavigation(ref(null), ref(null), ref('original'))
    await navigation.attachDocument(session)
    navigation.currentPage.value = 10
    await nextTick()

    navigation.detachDocument()
    session.documentGeneration = 2
    await navigation.attachDocument(session)
    navigation.currentPage.value = 10
    await nextTick()

    secondResolution.resolve({ type: 'page', pageNumber: 5 })
    await nextTick()
    await Promise.resolve()
    firstResolution.resolve({ type: 'page', pageNumber: 20 })
    await Promise.resolve()

    navigation.currentPage.value = 11
    await nextTick()
    await Promise.resolve()

    expect(navigation.activeOutlineDest.value).toBe('chapter')
    expect(session.resolveDestination).toHaveBeenCalledTimes(2)
  })
})

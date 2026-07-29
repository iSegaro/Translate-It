import { describe, expect, it, vi } from 'vitest'
import { PdfDestinationResolver } from './PdfDestinationResolver.js'

function createDeferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createContext(pdfDocument, documentGeneration, isDocumentGenerationCurrent) {
  return {
    pdfDocument,
    totalPages: 10,
    documentGeneration,
    isDocumentGenerationCurrent
  }
}

describe('PdfDestinationResolver', () => {
  it('does not cache a stale named destination after replacement', async () => {
    const destination = createDeferred()
    const resolver = new PdfDestinationResolver()
    let currentGeneration = 1
    const isCurrent = generation => generation === currentGeneration
    const documentA = { getDestination: vi.fn(() => destination.promise) }
    const documentB = { getDestination: vi.fn().mockResolvedValue(null) }

    const resolvingA = resolver.resolveDestination({
      ...createContext(documentA, currentGeneration, isCurrent),
      destination: 'chapter'
    })
    currentGeneration = 2
    resolver.clearCaches()
    destination.resolve(null)
    await resolvingA

    await expect(resolver.resolveDestination({
      ...createContext(documentB, currentGeneration, isCurrent),
      destination: 'chapter'
    })).resolves.toBeNull()
    expect(documentB.getDestination).toHaveBeenCalledOnce()
  })

  it('does not cache a stale page index after replacement', async () => {
    const pageIndex = createDeferred()
    const resolver = new PdfDestinationResolver()
    const pageRef = { num: 7, gen: 0 }
    let currentGeneration = 1
    const isCurrent = generation => generation === currentGeneration
    const documentA = { getPageIndex: vi.fn(() => pageIndex.promise) }
    const documentB = { getPageIndex: vi.fn().mockResolvedValue(1) }

    const resolvingA = resolver.resolveDestination({
      ...createContext(documentA, currentGeneration, isCurrent),
      destination: [pageRef, 'Fit']
    })
    currentGeneration = 2
    resolver.clearCaches()
    pageIndex.resolve(4)
    await resolvingA

    await expect(resolver.resolveDestination({
      ...createContext(documentB, currentGeneration, isCurrent),
      destination: [pageRef, 'Fit']
    })).resolves.toMatchObject({ type: 'page', pageNumber: 2 })
    expect(documentB.getPageIndex).toHaveBeenCalledOnce()
  })

  it('caches current-generation named destinations and page indexes', async () => {
    const resolver = new PdfDestinationResolver()
    const isCurrent = () => true
    const pageRef = { num: 3, gen: 0 }
    const document = {
      getDestination: vi.fn().mockResolvedValue(null),
      getPageIndex: vi.fn().mockResolvedValue(3)
    }
    const context = createContext(document, 1, isCurrent)

    await resolver.resolveDestination({ ...context, destination: 'chapter' })
    await resolver.resolveDestination({ ...context, destination: 'chapter' })
    await resolver.resolveDestination({ ...context, destination: [pageRef, 'Fit'] })
    await resolver.resolveDestination({ ...context, destination: [pageRef, 'Fit'] })

    expect(document.getDestination).toHaveBeenCalledOnce()
    expect(document.getPageIndex).toHaveBeenCalledOnce()
  })
})

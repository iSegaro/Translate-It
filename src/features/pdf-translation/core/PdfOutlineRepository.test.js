import { describe, expect, it, vi } from 'vitest'
import { PdfOutlineRepository } from './PdfOutlineRepository.js'

function createDeferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('PdfOutlineRepository', () => {
  it('does not cache an outline after its document generation changes', async () => {
    const outline = createDeferred()
    const repository = new PdfOutlineRepository()
    const pdfDocument = { getOutline: vi.fn(() => outline.promise) }
    let currentGeneration = 1

    const loading = repository.load({
      pdfDocument,
      documentGeneration: currentGeneration,
      isDocumentGenerationCurrent: generation => generation === currentGeneration
    })
    currentGeneration = 2
    outline.resolve([{ title: 'A', dest: [1] }])

    await expect(loading).resolves.toBeNull()
    expect(repository.get()).toBeNull()
  })
})

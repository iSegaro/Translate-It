import { beforeEach, describe, expect, it, vi } from 'vitest'

const instances = []

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  TextLayerBuilder: class MockTextLayerBuilder {
    constructor(options) {
      this.options = options
      this.cancel = vi.fn()
      this.render = vi.fn(async ({ viewport }) => {
        this.options.onAppend?.(document.createElement('div'))
        this.viewport = viewport
      })
      instances.push(this)
    }
  }
}))

const { PdfTextLayerRenderer } = await import('./PdfTextLayerRenderer.js')

describe('PdfTextLayerRenderer', () => {
  beforeEach(() => {
    instances.length = 0
  })

  it('renders text layer content and appends the official text layer container', async () => {
    const container = document.createElement('div')
    container.replaceChildren = vi.fn()
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      streamTextContent: vi.fn()
    }
    const viewport = { scale: 1 }

    await renderer.render(page, viewport)

    expect(instances).toHaveLength(1)
    expect(instances[0].render).toHaveBeenCalledWith({ viewport })
    expect(container.replaceChildren).toHaveBeenCalled()
  })

  it('clear cancels any active builder and empties the container', async () => {
    const container = document.createElement('div')
    container.replaceChildren = vi.fn()
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      streamTextContent: vi.fn()
    }

    await renderer.render(page, { scale: 1 })
    renderer.clear()

    expect(instances[0].cancel).toHaveBeenCalled()
    expect(container.replaceChildren).toHaveBeenCalledTimes(3)
  })

  it('destroy is safe when called without a prior render', () => {
    const container = document.createElement('div')
    container.replaceChildren = vi.fn()
    const renderer = new PdfTextLayerRenderer(container)

    expect(() => renderer.destroy()).not.toThrow()
    expect(container.replaceChildren).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'

const { PdfTextLayerRenderer } = await import('./PdfTextLayerRenderer.js')

describe('PdfTextLayerRenderer', () => {
  it('renders text layer content from getTextContent items', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Hello', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 },
          { str: 'World', transform: [1, 0, 0, 1, 70, 20], width: 50, height: 12 }
        ]
      })
    }

    await renderer.render(page, { scale: 1 })

    expect(page.getTextContent).toHaveBeenCalledOnce()
    expect(container.children.length).toBe(1)
    const layerDiv = container.firstChild
    expect(layerDiv.className).toBe('textLayer')
    expect(layerDiv.children.length).toBe(2)
    expect(layerDiv.children[0].textContent).toBe('Hello')
    expect(layerDiv.children[1].textContent).toBe('World')
  })

  it('applies CSS transform from item transform array', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Test', transform: [2, 0, 0, 2, 10, 20], width: 100, height: 24 }
        ]
      })
    }

    await renderer.render(page, { scale: 1 })

    const span = container.querySelector('span')
    expect(span.style.transform).toBe('matrix(2, 0, 0, 2, 10, 20)')
    expect(span.style.width).toBe('100px')
    expect(span.style.height).toBe('24px')
  })

  it('skips empty text items', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: '', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 },
          { str: '  ', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 },
          { str: 'Real text', transform: [1, 0, 0, 1, 10, 20], width: 80, height: 12 }
        ]
      })
    }

    await renderer.render(page, { scale: 1 })

    const layerDiv = container.querySelector('.textLayer')
    expect(layerDiv.children.length).toBe(1)
    expect(layerDiv.children[0].textContent).toBe('Real text')
  })

  it('clear empties the container', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: 'Hello', transform: [1, 0, 0, 1, 0, 0], width: 50, height: 12 }]
      })
    }

    await renderer.render(page, { scale: 1 })
    expect(container.children.length).toBe(1)

    renderer.clear()
    expect(container.children.length).toBe(0)
  })

  it('destroy is safe without prior render', () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    expect(() => renderer.destroy()).not.toThrow()
    expect(renderer.container).toBeNull()
  })

  it('handles empty text content gracefully', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({ items: [] })
    }

    await renderer.render(page, { scale: 1 })
    expect(container.children.length).toBe(0)
  })
})

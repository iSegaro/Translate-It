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

    await renderer.render(page, { transform: [1, 0, 0, 1, 0, 0] })

    expect(page.getTextContent).toHaveBeenCalledOnce()
    const layerDiv = container.querySelector('.textLayer')
    expect(layerDiv).not.toBeNull()
    expect(layerDiv.children.length).toBe(2)
    expect(layerDiv.children[0].textContent).toBe('Hello')
    expect(layerDiv.children[1].textContent).toBe('World')
  })

  it('applies viewport transform to item transforms via matrix multiplication', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Test', transform: [1, 0, 0, 1, 100, 200], width: 50, height: 12 }
        ]
      })
    }

    await renderer.render(page, { transform: [2, 0, 0, 2, 0, 0] })

    const span = container.querySelector('span')
    expect(span.style.transform).toBe('matrix(2, 0, 0, 2, 200, 400)')
  })

  it('scales width and height by viewport scale', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Scaled', transform: [1, 0, 0, 1, 0, 0], width: 100, height: 20 }
        ]
      })
    }

    await renderer.render(page, { transform: [2, 0, 0, 3, 0, 0] })

    const span = container.querySelector('span')
    expect(span.style.width).toBe('200px')
    expect(span.style.height).toBe('60px')
  })

  it('handles translated viewport offsets', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Offset', transform: [1, 0, 0, 1, 0, 0], width: 50, height: 12 }
        ]
      })
    }

    await renderer.render(page, { transform: [1, 0, 0, 1, 50, 100] })

    const span = container.querySelector('span')
    expect(span.style.transform).toBe('matrix(1, 0, 0, 1, 50, 100)')
  })

  it('handles combined scale and translate', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'Combined', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 }
        ]
      })
    }

    await renderer.render(page, { transform: [2, 0, 0, 2, 30, 40] })

    const span = container.querySelector('span')
    expect(span.style.transform).toBe('matrix(2, 0, 0, 2, 50, 80)')
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

    await renderer.render(page, { transform: [1, 0, 0, 1, 0, 0] })

    const layerDiv = container.querySelector('.textLayer')
    expect(layerDiv.children.length).toBe(1)
    expect(layerDiv.children[0].textContent).toBe('Real text')
  })

  it('handles missing item.transform gracefully', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'No transform', width: 50, height: 12 }
        ]
      })
    }

    await renderer.render(page, { transform: [2, 0, 0, 2, 0, 0] })

    const span = container.querySelector('span')
    expect(span).not.toBeNull()
    expect(span.textContent).toBe('No transform')
  })

  it('handles missing viewport.transform gracefully', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'No viewport', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 }
        ]
      })
    }

    await renderer.render(page, {})

    const span = container.querySelector('span')
    expect(span).not.toBeNull()
    expect(span.style.transform).toBe('matrix(1, 0, 0, 1, 10, 20)')
  })

  it('clear empties the container', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: 'Hello', transform: [1, 0, 0, 1, 0, 0], width: 50, height: 12 }]
      })
    }

    await renderer.render(page, { transform: [1, 0, 0, 1, 0, 0] })
    expect(container.querySelector('.textLayer')).not.toBeNull()

    renderer.clear()
    expect(container.querySelector('.textLayer')).toBeNull()
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

    await renderer.render(page, { transform: [1, 0, 0, 1, 0, 0] })
    expect(container.querySelector('.textLayer')).toBeNull()
  })

  it('preserves .textLayer class for PdfSelectionBridge compatibility', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: 'Select me', transform: [1, 0, 0, 1, 0, 0], width: 80, height: 12 }]
      })
    }

    await renderer.render(page, { transform: [1, 0, 0, 1, 0, 0] })

    const layerDiv = container.querySelector('.textLayer')
    expect(layerDiv).not.toBeNull()
    expect(layerDiv.querySelector('span').textContent).toBe('Select me')
  })
})

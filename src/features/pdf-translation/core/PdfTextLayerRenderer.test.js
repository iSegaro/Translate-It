import { describe, expect, it, vi } from 'vitest'

const { PdfTextLayerRenderer } = await import('./PdfTextLayerRenderer.js')

function createTextContent(items) {
  return { items }
}

describe('PdfTextLayerRenderer', () => {
  it('renders supplied canonical text content', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const textContent = createTextContent([
      { str: 'Hello', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 },
      { str: 'World', transform: [1, 0, 0, 1, 70, 20], width: 50, height: 12 }
    ])

    await renderer.render({ pageNumber: 1, viewport: { scale: 1 }, textContent })

    const spans = container.querySelectorAll('span')
    expect(spans).toHaveLength(2)
    expect(spans[0].textContent).toBe('Hello')
    expect(spans[1].textContent).toBe('World')
  })

  it('never calls page.getTextContent when a page is passed', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)
    const page = { getTextContent: vi.fn() }

    await renderer.render({ pageNumber: 1, viewport: { scale: 1 }, page })

    expect(page.getTextContent).not.toHaveBeenCalled()
    expect(container.querySelector('.textLayer')).toBeNull()
  })

  it('clears a previous layer when canonical text content is unavailable', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    await renderer.render({
      viewport: { scale: 1 },
      textContent: createTextContent([{ str: 'Old', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 }])
    })
    await renderer.render({ viewport: { scale: 1 }, textContent: null })

    expect(container.querySelector('.textLayer')).toBeNull()
  })

  it('positions spans using viewport geometry', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    await renderer.render({
      viewport: { scale: 1, rawDims: { pageWidth: 800, pageHeight: 600, pageX: 0, pageY: 0 } },
      textContent: createTextContent([{ str: 'Hello', transform: [1, 0, 0, 1, 100, 200], width: 50, height: 12 }])
    })

    const span = container.querySelector('span')
    expect(parseFloat(span.style.left)).toBeCloseTo(12.5, 1)
    expect(parseFloat(span.style.top)).toBeCloseTo(66.53, 1)
    expect(span.style.getPropertyValue('--font-height')).toMatch(/^\d+\.\d+px$/)
  })

  it('applies rotation and preserves text direction', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    await renderer.render({
      viewport: { scale: 1 },
      textContent: createTextContent([{ str: 'سلام', dir: 'rtl', transform: [0, 1, -1, 0, 10, 20], width: 50, height: 12 }])
    })

    const span = container.querySelector('span')
    expect(span.dir).toBe('rtl')
    expect(span.style.getPropertyValue('--rotate')).toMatch(/deg$/)
  })

  it('skips empty text items', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    await renderer.render({
      viewport: { scale: 1 },
      textContent: createTextContent([
        { str: '', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 },
        { str: '  ', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 },
        { str: 'Real text', transform: [1, 0, 0, 1, 10, 20], width: 80, height: 12 }
      ])
    })

    expect(container.querySelectorAll('span')).toHaveLength(1)
  })

  it('registers and removes the selection sentinel with its layer', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    await renderer.render({
      viewport: { scale: 1 },
      textContent: createTextContent([{ str: 'Selectable', transform: [1, 0, 0, 1, 10, 20], width: 80, height: 12 }])
    })

    const layer = container.querySelector('.textLayer')
    const sentinel = layer.querySelector('.endOfContent')
    expect(sentinel).not.toBeNull()

    renderer.clear()
    expect(container.querySelector('.textLayer')).toBeNull()
    expect(sentinel.isConnected).toBe(false)
  })

  it('keeps latest supplied content after sequential renders', async () => {
    const container = document.createElement('div')
    const renderer = new PdfTextLayerRenderer(container)

    await renderer.render({
      viewport: { scale: 1 },
      textContent: createTextContent([{ str: 'Old', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 }])
    })
    await renderer.render({
      viewport: { scale: 1 },
      textContent: createTextContent([{ str: 'Current', transform: [1, 0, 0, 1, 10, 20], width: 50, height: 12 }])
    })

    expect(container.querySelectorAll('span')).toHaveLength(1)
    expect(container.querySelector('span').textContent).toBe('Current')
  })

  it('destroy is safe without a previous render', () => {
    const renderer = new PdfTextLayerRenderer(document.createElement('div'))

    expect(() => renderer.destroy()).not.toThrow()
    expect(renderer.container).toBeNull()
  })
})

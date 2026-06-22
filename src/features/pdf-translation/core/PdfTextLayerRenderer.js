const CSS_CLASS = 'textLayer'

export class PdfTextLayerRenderer {
  constructor(container) {
    this.container = container
    this.textDivs = []
  }

  async render(page, viewport) {
    if (!this.container || !page || !viewport) return

    this.clear()

    const textContent = await page.getTextContent()
    if (!textContent?.items?.length) return

    const layerDiv = document.createElement('div')
    layerDiv.className = CSS_CLASS

    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue

      const span = document.createElement('span')
      span.textContent = item.str

      if (item.transform) {
        const [scaleX, skewX, skewY, scaleY, tx, ty] = item.transform
        span.style.transform = `matrix(${scaleX}, ${skewY}, ${skewX}, ${scaleY}, ${tx}, ${ty})`
      }

      if (item.width > 0) {
        span.style.width = `${item.width}px`
      }

      if (item.height > 0) {
        span.style.height = `${item.height}px`
      }

      layerDiv.appendChild(span)
      this.textDivs.push(span)
    }

    this.container.appendChild(layerDiv)
  }

  clear() {
    this.textDivs = []

    if (this.container) {
      this.container.replaceChildren()
    }
  }

  destroy() {
    this.clear()
    this.container = null
  }
}

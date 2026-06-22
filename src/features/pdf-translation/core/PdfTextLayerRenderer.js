const CSS_CLASS = 'textLayer'

function multiplyMatrices(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ]
}

const IDENTITY = [1, 0, 0, 1, 0, 0]

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

    const viewportMatrix = viewport?.transform || IDENTITY

    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue

      const span = document.createElement('span')
      span.textContent = item.str

      const itemMatrix = item.transform || IDENTITY
      const finalMatrix = multiplyMatrices(viewportMatrix, itemMatrix)

      span.style.transform = `matrix(${finalMatrix[0]}, ${finalMatrix[1]}, ${finalMatrix[2]}, ${finalMatrix[3]}, ${finalMatrix[4]}, ${finalMatrix[5]})`

      if (item.width > 0) {
        span.style.width = `${item.width * Math.abs(viewportMatrix[0])}px`
      }

      if (item.height > 0) {
        span.style.height = `${item.height * Math.abs(viewportMatrix[3])}px`
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

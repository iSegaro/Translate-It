import {
  registerPdfTextLayerSelectionShell,
  unregisterPdfTextLayerSelectionShell
} from './PdfTextLayerSelectionShell.js'

const CSS_CLASS = 'textLayer'

const IDENTITY = [1, 0, 0, 1, 0, 0]

const ASCENT_RATIO = 0.8

function multiplyTransform(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

export class PdfTextLayerRenderer {
  constructor(container) {
    this.container = container
    this.textDivs = []
    this.textLayer = null
    this._renderSeq = 0
  }

  async render(page, viewport, containerWidth, containerHeight) {
    if (!this.container || !page || !viewport) return

    this.clear()
    const renderSeq = ++this._renderSeq

    const textContent = await page.getTextContent({
      includeMarkedContent: true,
      disableNormalization: true
    })
    if (renderSeq !== this._renderSeq) return
    if (!textContent?.items?.length) return

    const layerDiv = document.createElement('div')
    layerDiv.className = CSS_CLASS

    const totalScale = viewport.scale || 1
    const rawDims = viewport.rawDims || null
    const pageX = rawDims?.pageX || 0
    const pageY = rawDims?.pageY || 0
    const rawPageWidth = rawDims?.pageWidth || (viewport.width / totalScale)
    const rawPageHeight = rawDims?.pageHeight || (viewport.height / totalScale)

    const refWidth = containerWidth ? containerWidth / totalScale : rawPageWidth
    const refHeight = containerHeight ? containerHeight / totalScale : rawPageHeight

    const pageHeight = rawPageHeight

    const pageTransform = [1, 0, 0, -1, -pageX, pageY + pageHeight]

    const styles = textContent.styles || {}
    const spans = []
    const itemMeta = []

    for (const item of textContent.items) {
      if (item.str === undefined) continue
      if (!item.str || !item.str.trim()) continue

      const itemTransform = item.transform || IDENTITY
      const tx = multiplyTransform(pageTransform, itemTransform)

      let angle = Math.atan2(tx[1], tx[0])
      if (item.vertical) {
        angle += Math.PI / 2
      }

      const fontHeight = Math.hypot(tx[2], tx[3])
      const fontAscent = fontHeight * ASCENT_RATIO

      let left, top
      if (angle === 0) {
        left = tx[4]
        top = tx[5] - fontAscent
      } else {
        left = tx[4] + fontAscent * Math.sin(angle)
        top = tx[5] - fontAscent * Math.cos(angle)
      }

      const fontStyle = styles[item.fontName] || {}
      const fontFamily = fontStyle.fontFamily || 'sans-serif'

      const span = document.createElement('span')
      span.setAttribute('role', 'presentation')
      span.textContent = item.str
      span.dir = item.dir || 'ltr'

      const spanStyle = span.style
      spanStyle.left = `${(100 * (left - pageX) / refWidth).toFixed(2)}%`
      spanStyle.top = `${(100 * top / refHeight).toFixed(2)}%`
      spanStyle.setProperty('--font-height', `${fontHeight.toFixed(2)}px`)
      spanStyle.fontFamily = fontFamily

      if (angle !== 0) {
        spanStyle.setProperty('--rotate', `${(angle * 180 / Math.PI).toFixed(2)}deg`)
      }

      spans.push(span)
      layerDiv.appendChild(span)

      itemMeta.push({
        pdfWidth: item.width * totalScale,
        str: item.str
      })
    }

    if (renderSeq !== this._renderSeq) return

    this.container.appendChild(layerDiv)
    this.textLayer = layerDiv
    this.textDivs = spans

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i]
      const { pdfWidth, str } = itemMeta[i]
      if (pdfWidth <= 0) continue
      if (str.length <= 1) continue

      const renderedWidth = span.getBoundingClientRect().width
      if (renderedWidth <= 0) continue

      const scaleX = pdfWidth / renderedWidth
      if (Math.abs(scaleX - 1) > 0.01) {
        span.style.transform = `scaleX(${scaleX.toFixed(4)}) ${span.style.transform || ''}`.trim()
      }
    }

    registerPdfTextLayerSelectionShell(layerDiv)
  }

  clear() {
    this._renderSeq++

    if (this.textLayer) {
      unregisterPdfTextLayerSelectionShell(this.textLayer)
    }

    this.textDivs = []
    this.textLayer = null
    if (this.container) {
      this.container.replaceChildren()
    }
  }

  destroy() {
    this.clear()
    this.container = null
  }
}

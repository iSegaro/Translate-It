const RTL_PATTERN = /[\u0591-\u05FF\u0600-\u06FF\u0700-\u074F]/g

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isRtl(text) {
  if (!text) return false
  const rtlCount = (text.match(RTL_PATTERN) || []).length
  const ltrCount = (text.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length
  return rtlCount > ltrCount
}

function nlToBr(text) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

const ROLE_TO_MARKDOWN = Object.freeze({
  heading: (text) => `## ${text}`,
  'list-item': (text) => `- ${text}`,
  caption: (text) => `*${text}*`,
  'table-region': (text) => text,
  paragraph: (text) => text
})

function escapeMarkdown(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function formatBlockAsMarkdown(block) {
  const formatter = ROLE_TO_MARKDOWN[block.role]
  if (formatter) {
    return formatter(escapeMarkdown(block.translatedText))
  }

  return escapeMarkdown(block.translatedText)
}

export function buildTxtOutput({ documentTitle, blocks }) {
  if (!blocks.length) return ''

  const lines = []

  if (documentTitle) {
    lines.push(documentTitle)
    lines.push('='.repeat(documentTitle.length))
    lines.push('')
  }

  let currentPage = 0

  for (const block of blocks) {
    if (block.pageNumber !== currentPage) {
      currentPage = block.pageNumber
      if (currentPage > 1) {
        lines.push('')
      }
      lines.push(`--- Page ${currentPage} ---`)
      lines.push('')
    }

    lines.push(block.translatedText)
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function buildMarkdownOutput({ documentTitle, blocks }) {
  if (!blocks.length) return ''

  const lines = []

  if (documentTitle) {
    lines.push(`# ${documentTitle}`)
    lines.push('')
  }

  let currentPage = 0

  for (const block of blocks) {
    if (block.pageNumber !== currentPage) {
      currentPage = block.pageNumber
      if (currentPage > 1) {
        lines.push('')
      }
      lines.push(`---`)
      lines.push('')
      lines.push(`### Page ${currentPage}`)
      lines.push('')
    }

    lines.push(formatBlockAsMarkdown(block))
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function buildHtmlOutput({ documentTitle, pages }) {
  if (!pages || !pages.length) return ''

  const title = escapeHtml(documentTitle || 'Translated PDF')

  const pageSections = pages.map((page) => {
    const bgImg = page.canvasDataUrl
      ? `<img class="page-bg" src="${page.canvasDataUrl}" alt="Page ${page.pageNumber}" />`
      : ''

    const blockDivs = page.blocks.map((block) => {
      const bbox = block.boundingBox
      if (!bbox) return ''

      const left = (bbox.x * page.scale)
      const top = (bbox.y * page.scale)
      const width = (bbox.width * page.scale)
      const height = (bbox.height * page.scale)

      const dir = isRtl(block.translatedText) ? ' dir="rtl"' : ''
      const fontFamily = block.fontFamily ? `font-family: ${escapeHtml(block.fontFamily)};` : ''
      const fontSize = `font-size: ${block.fontSize * page.scale}px;`

      return `      <div class="block"${dir} style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; min-height: ${height}px; ${fontSize}${fontFamily} line-height: 1.35; padding: 2px 4px; background: rgba(255,255,255,0.92); border-radius: 2px; box-sizing: border-box; overflow: hidden; color: #1a1a1a; white-space: pre-wrap; word-break: break-word;">${nlToBr(block.translatedText)}</div>`
    }).join('\n')

    return `    <div class="page" style="position: relative; width: ${page.displayWidth}px; height: ${page.displayHeight}px; margin: 0 auto 24px; background: #f5f7fb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.12);">
${bgImg}
${blockDivs}
    </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #e8ecf1; padding: 32px 16px; color: #1a1a1a; }
  .page-bg { display: block; width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0; }
  h1 { text-align: center; margin-bottom: 24px; font-size: 22px; color: #333; }
  .note { text-align: center; font-size: 12px; color: #888; margin-bottom: 20px; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="note">Exported from Translate It &mdash; complex table/cell-perfect layout is deferred to a future phase.</p>
${pageSections}
</body>
</html>`
}

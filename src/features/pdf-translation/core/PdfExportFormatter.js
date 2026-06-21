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

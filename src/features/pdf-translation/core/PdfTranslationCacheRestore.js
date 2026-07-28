import { isCompatibleEntry } from './PdfTranslationCompatibility.js'
import { normalizeStructuredCells } from './PdfStructuredCells.js'

export { normalizeStructuredCells } from './PdfStructuredCells.js'

function deriveTranslatedTextFromStructuredCells(translatedCells = []) {
  if (!Array.isArray(translatedCells) || translatedCells.length === 0) return ''

  const lines = []
  for (const line of translatedCells) {
    if (!line || typeof line !== 'object' || !Array.isArray(line.cells)) continue
    const cells = line.cells.filter((cell) => typeof cell === 'string' && cell.length > 0)
    if (cells.length > 0) {
      lines.push(cells.join(' '))
    }
  }

  return lines.join('\n').trim()
}

export function restoreCachedPdfTranslations({
  session,
  cacheTranslations = {},
  sourceBlocks = [],
  settings = {}
} = {}) {
  const restoredBlockIds = []

  if (!session || !cacheTranslations || sourceBlocks.length === 0) {
    return { restoredBlockIds, restoredCount: 0 }
  }

  for (const block of sourceBlocks) {
    if (!block?.id) continue

    const currentState = session.getBlockTranslationState(block.id)
    if (currentState.status === 'translated' || currentState.status === 'loading') continue

    const entry = cacheTranslations[block.id]
    if (!isCompatibleEntry(entry, block, settings)) continue

    const normalizedTranslatedCells = normalizeStructuredCells(entry.translatedCells)
    const translatedText = (typeof entry.translatedText === 'string' && entry.translatedText.trim().length > 0)
      ? entry.translatedText
      : deriveTranslatedTextFromStructuredCells(normalizedTranslatedCells || [])

    if (!translatedText) continue

    const nextState = {
      translatedText,
      status: 'translated',
      provider: entry.provider || '',
      sourceLanguage: entry.sourceLanguage || '',
      targetLanguage: entry.targetLanguage || '',
      sourceTextHash: entry.sourceTextHash,
      translationSettingsHash: entry.translationSettingsHash || '',
      error: null
    }

    if (normalizedTranslatedCells) {
      nextState.translatedCells = normalizedTranslatedCells
    }

    session.setBlockTranslationState(block.id, nextState)
    restoredBlockIds.push(block.id)
  }

  return { restoredBlockIds, restoredCount: restoredBlockIds.length }
}

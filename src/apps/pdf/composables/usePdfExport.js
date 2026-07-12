import { computed, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfExportCollector } from '@/features/pdf-translation/core/PdfExportCollector.js'
import { buildTxtOutput, buildMarkdownOutput, buildHtmlOutput } from '@/features/pdf-translation/core/PdfExportFormatter.js'
import { downloadFile, buildExportFilename } from '@/features/pdf-translation/core/PdfFileDownloader.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfExport')
const collector = new PdfExportCollector(pdfDocumentSession)

export function usePdfExport(translationTick) {
  const exportError = ref('')

  const exportStats = computed(() => {
    translationTick?.value
    return collector.getExportStats()
  })

  const canExport = computed(() => exportStats.value.hasTranslatedBlocks)

  async function exportTxt() {
    try {
      exportError.value = ''

      const blocks = await collector.collectTranslatedBlocks()
      if (blocks.length === 0) {
        exportError.value = 'No translated blocks to export.'
        return false
      }

      const title = collector.getDocumentTitle()
      const content = buildTxtOutput({ documentTitle: title, blocks })
      const filename = buildExportFilename(title, 'txt')

      downloadFile(content, filename, 'text/plain')
      logger.info('PDF exported as TXT:', { filename, blockCount: blocks.length })
      return true
    } catch (error) {
      logger.error('Failed to export PDF as TXT:', error)
      exportError.value = error?.message || 'Failed to export as TXT.'
      return false
    }
  }

  async function exportMarkdown() {
    try {
      exportError.value = ''

      const blocks = await collector.collectTranslatedBlocks()
      if (blocks.length === 0) {
        exportError.value = 'No translated blocks to export.'
        return false
      }

      const title = collector.getDocumentTitle()
      const content = buildMarkdownOutput({ documentTitle: title, blocks })
      const filename = buildExportFilename(title, 'md')

      downloadFile(content, filename, 'text/markdown')
      logger.info('PDF exported as Markdown:', { filename, blockCount: blocks.length })
      return true
    } catch (error) {
      logger.error('Failed to export PDF as Markdown:', error)
      exportError.value = error?.message || 'Failed to export as Markdown.'
      return false
    }
  }

  function clearExportError() {
    exportError.value = ''
  }

  async function exportHtml(canvasDataUrls = new Map()) {
    try {
      exportError.value = ''

      const pages = await collector.collectSpatialBlocks(canvasDataUrls)
      if (pages.length === 0) {
        exportError.value = 'No translated blocks to export.'
        return false
      }

      const title = collector.getDocumentTitle()
      const content = buildHtmlOutput({ documentTitle: title, pages })
      const filename = buildExportFilename(title, 'html')

      downloadFile(content, filename, 'text/html')
      logger.info('PDF exported as HTML:', { filename, pageCount: pages.length })
      return true
    } catch (error) {
      logger.error('Failed to export PDF as HTML:', error)
      exportError.value = error?.message || 'Failed to export as HTML.'
      return false
    }
  }

  return {
    exportStats,
    canExport,
    exportError,
    exportTxt,
    exportMarkdown,
    exportHtml,
    clearExportError
  }
}

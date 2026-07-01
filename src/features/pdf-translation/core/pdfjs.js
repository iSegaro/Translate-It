import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

export const { AnnotationType } = pdfjsLib
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'pdfjs')
let configured = false

export function ensurePdfJsConfigured() {
  if (!configured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    configured = true
    logger.debug('PDF.js worker configured:', pdfWorkerUrl)
  }

  return pdfjsLib
}

export function getPdfWorkerUrl() {
  return pdfWorkerUrl
}

export async function loadPdfDocumentFromFile(file) {
  const pdfjs = ensurePdfJsConfigured()
  const objectUrl = URL.createObjectURL(file)

  try {
    const loadingTask = pdfjs.getDocument({
      url: objectUrl,
      withCredentials: false,
      stopAtErrors: true,
      useSystemFonts: true,
      isEvalSupported: false
    })

    const document = await loadingTask.promise
    return { document, loadingTask, objectUrl }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

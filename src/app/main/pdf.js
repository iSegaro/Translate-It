import { createApp } from 'vue'
import { pinia } from '@/store'
import PdfApp from '@/apps/pdf/PdfApp.vue'
import '@/assets/styles/main.scss'
import 'pdfjs-dist/web/pdf_viewer.css'
import { setupGlobalErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals } from '@/shared/error-management/windowErrorHandlers.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { configureVueForCSP } from '@/shared/vue/vue-utils.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'pdf-entry')

async function initializeApp() {
  try {
    document.body.classList.add('pdf-context')

    setupWindowErrorHandlers('pdf')

    if (!ExtensionContextManager.isValidSync()) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }

    setupBrowserAPIGlobals()

    const app = configureVueForCSP(createApp(PdfApp))
    app.use(pinia)
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'pdf'

    setupGlobalErrorHandler(app, 'pdf')
    app.mount('#app')
    logger.info('PDF viewer app mounted successfully')
  } catch (error) {
    logger.error('Failed to initialize PDF viewer app:', error)

    const appElement = document.getElementById('app')
    if (appElement) {
      appElement.textContent = ''

      const errorDiv = document.createElement('div')
      errorDiv.style.cssText = 'padding: 24px; color: #ef4444; text-align: center; font-family: sans-serif;'
      errorDiv.textContent = 'Failed to load PDF Viewer. Please try reloading the page.'
      appElement.appendChild(errorDiv)
    }
  }
}

const appElement = document.getElementById('app')
if (appElement && !appElement.__vue_app__) {
  initializeApp()
}

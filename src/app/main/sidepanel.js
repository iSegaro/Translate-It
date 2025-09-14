import { createApp } from 'vue'
import { pinia } from '@/store'
import SidepanelApp from '@/apps/sidepanel/SidepanelApp.vue'
import '@/assets/styles/main.scss'
import browser from 'webextension-polyfill'
import { MessagingContexts } from '@/shared/messaging/core/MessagingCore.js'
import { setupGlobalErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals } from '@/shared/error-management/windowErrorHandlers.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { configureVueForCSP } from '@/shared/vue/vue-utils.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'sidepanel-main')

// Initialize the sidepanel application
async function initializeApp() {
  try {
    logger.debug('🚀 Starting sidepanel app initialization...')
    
    // Add sidepanel context class to body
    document.body.classList.add('sidepanel-context')
    logger.debug('✅ Added sidepanel-context class to body')
    
    // Setup global error handlers before anything else
    setupWindowErrorHandlers('sidepanel')
    
    // Check extension context validity
    if (!ExtensionContextManager.isValidSync()) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }

    // Setup browser API globals for compatibility
    setupBrowserAPIGlobals()
    
    logger.debug('🌐 Browser API globals configured')

    // Debug browser API availability for i18n
    logger.debugLazy(() => [
      '🔍 Browser API Debug Info:',
      {
        'browser.runtime': !!browser.runtime,
        'browser.runtime.getURL': !!browser.runtime?.getURL,
        'browserAPI.i18n': !!browser.i18n,
        'browserAPI.i18n.getMessage': !!browser.i18n?.getMessage,
        'window.browser.i18n': !!window.browser.i18n,
        'chrome.i18n (native)': !!chrome?.i18n
      }
    ])

    // Import unified i18n plugin after browser API is ready and globally available
    logger.debug('📦 Importing unified i18n plugin...')
    const { default: i18n } = await import('@/utils/i18n/plugin.js')
    logger.debug('✅ unified i18n plugin imported successfully')

    // Create Vue app
    logger.debug('🎨 Creating Vue app...')
    const app = configureVueForCSP(createApp(SidepanelApp))
    logger.debug('✅ Vue app created successfully')

    // Use plugins (order matters: pinia first, then i18n)
    logger.debug('🔌 Installing Pinia...')
    app.use(pinia)
    logger.debug('✅ Pinia installed')
    
    logger.debug('🔌 Installing i18n...')
    app.use(i18n)
    logger.debug('✅ i18n installed')

    // Global properties for extension context and messaging
    logger.debug('⚙️ Setting global properties...')
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'sidepanel'
    app.config.globalProperties.$messagingContext = MessagingContexts.SIDEPANEL
    logger.debug('✅ Global properties configured')

    // Setup unified error handling
    logger.debug('🛡️ Setting up unified error handler...')
    setupGlobalErrorHandler(app, 'sidepanel')

    // Mount the app
    logger.debug('🎯 Mounting Vue app to #app...')
    app.mount('#app')
    logger.debug('🎉 Sidepanel app mounted successfully!')
  } catch (error) {
    logger.error('Failed to initialize sidepanel app:', error)
    logger.error('Error stack:', error.stack)
    
    // Show simple error UI using DOM methods
    const appElement = document.getElementById('app')
    appElement.textContent = '' // Clear existing content

    const errorDiv = document.createElement('div')
    errorDiv.style.cssText = 'padding: 16px; color: red; font-family: monospace;'

    const title = document.createElement('h3')
    title.textContent = 'Failed to load sidepanel'
    errorDiv.appendChild(title)

    const errorText = document.createElement('p')
    errorText.textContent = `Error: ${error.message}`
    errorDiv.appendChild(errorText)

    const instruction = document.createElement('p')
    instruction.textContent = 'Please check the browser console for more details.'
    errorDiv.appendChild(instruction)

    const reloadBtn = document.createElement('button')
    reloadBtn.textContent = 'Reload'
    reloadBtn.style.cssText = 'padding: 8px 16px; margin-top: 8px;'
    reloadBtn.addEventListener('click', () => location.reload())
    errorDiv.appendChild(reloadBtn)

    appElement.appendChild(errorDiv)
  }
}

// Initialize the app
initializeApp()

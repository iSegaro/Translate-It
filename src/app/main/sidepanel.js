import { createApp } from 'vue'
import { pinia } from '@/store'
import SidepanelApp from '@/views/sidepanel/SidepanelLayout.vue'
import '@/main.scss'
import browser from 'webextension-polyfill'
import { MessagingContexts } from '../../messaging/core/MessagingCore'
import { setupGlobalErrorHandler } from '@/composables/useErrorHandler.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'sidepanel');

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    logger.debug('🚀 Starting sidepanel app initialization...')
    
    // Wait for browser API to be ready
    logger.debug('⏳ Waiting for browser API to be ready...')
    
    logger.debug('✅ browser API is ready')

    // Ensure browser API is globally available for i18n plugin
    if (typeof window !== 'undefined') {
      window.browser = browser;
      window.chrome = browser; // Some plugins expect chrome object
      
      // Debug: Check if i18n is available
      logger.debug('🔍 Checking i18n availability:', {
        'browserAPI.i18n': !!browser.i18n,
        'browserAPI.i18n.getMessage': !!browser.i18n?.getMessage,
        'window.browser.i18n': !!window.browser.i18n,
        'chrome.i18n (native)': !!chrome?.i18n
      });
    }

    // Import i18n plugin after browser API is ready and globally available
    logger.debug('📦 Importing i18n plugin...')
    const { default: i18n } = await import('vue-plugin-webextension-i18n')
    logger.debug('✅ i18n plugin imported successfully')

    // Create Vue app
    logger.debug('🎨 Creating Vue app...')
    const app = createApp(SidepanelApp)

    // Use Pinia for state management
    logger.debug('🔌 Installing Pinia...')
    app.use(pinia)
    logger.debug('✅ Pinia installed')
    
    logger.debug('🔌 Installing i18n...')
    app.use(i18n)
    logger.debug('✅ i18n installed')

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = MessagingContexts.SIDEPANEL

    // Setup unified error handling
    setupGlobalErrorHandler(app, 'sidepanel')

    // Mount the app
    app.mount('#app')
  } catch (error) {
    logger.error('Failed to initialize sidepanel app:', error)
    // Show error UI
    document.getElementById('app').innerHTML = '<div style="padding: 16px; color: red;">Failed to load extension sidepanel. Please try reloading.</div>'
  }
}

// Initialize the app
const appElement = document.getElementById('app')
if (appElement && !appElement.__vue_app__) {
  initializeApp()
}

// Lazy loading functions for advanced features
export const loadAdvancedFeatures = async () => {
  const [capture, tts, history, subtitle] = await Promise.all([
    import('@/store/modules/capture.js'),
    import('@/store/modules/tts.js'),
    import('@/store/modules/history.js'),
    import('@/store/modules/subtitle.js')
  ])
  return { capture, tts, history, subtitle }
}

export const loadProviderFeatures = async () => {
  // Providers are now handled by the background service worker
  // UI contexts use TranslationClient for messaging
  return { aiProviders: null, freeProviders: null }
}

// Progressive loading after initial render
setTimeout(async () => {
  try {
    // Load translation features first
    const { loadTranslationFeatures } = await import('@/app/main/popup.js')
    await loadTranslationFeatures()
    
    // Then load advanced features
    await loadAdvancedFeatures()
  } catch (error) {
    logger.error('Failed to preload features:', error)
  }
}, 200)
import { createApp } from 'vue'
import i18n, { setI18nLocale } from '@/plugins/i18n'
import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '@/store'
import OptionsApp from '@/apps/options/OptionsApp.vue'
import '@/main.scss'
import browser from 'webextension-polyfill'
import DOMPurify from 'dompurify'
import { setupGlobalErrorHandler } from '@/composables/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals } from '@/shared/error-management/windowErrorHandlers.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'options');

// Import route components (lazy loaded)
const LanguagesTab = () => import('@/apps/options/tabs/LanguagesTab.vue')
const ActivationTab = () => import('@/apps/options/tabs/ActivationTab.vue')
const PromptTab = () => import('@/apps/options/tabs/PromptTab.vue')
const ApiTab = () => import('@/apps/options/tabs/ApiTab.vue')
const ImportExportTab = () => import('@/apps/options/tabs/ImportExportTab.vue')
const AdvanceTab = () => import('@/apps/options/tabs/AdvanceTab.vue')
const HelpTab = () => import('@/apps/options/tabs/HelpTab.vue')
const About = () => import('@/apps/options/About.vue')

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    logger.debug('🚀 Starting options app initialization...')
    
    // Add options context class to body
    document.body.classList.add('options-context')
    logger.debug('✅ Added options-context class to body')
    
    // Setup global error handlers before anything else
    setupWindowErrorHandlers('options')
    
    // Wait for browser API to be ready
    logger.debug('⏳ Waiting for browser API to be ready...')
    
    logger.debug('✅ browser API is ready')

    // Setup browser API globals
    setupBrowserAPIGlobals()

    // مقداردهی اولیه locale بر اساس تنظیمات کاربر
    let userLocale = 'en';
    try {
      const settings = await browser.storage.local.get('APPLICATION_LOCALIZE');
      if (settings && settings.APPLICATION_LOCALIZE) {
        // Normalize locale code
        const LANGUAGE_MAP = {
          'English': 'en',
          'Farsi': 'fa',
          'فارسی': 'fa',
          'en': 'en',
          'fa': 'fa'
        }
        userLocale = LANGUAGE_MAP[settings.APPLICATION_LOCALIZE] || settings.APPLICATION_LOCALIZE || 'en';
      }
    } catch (e) {
      logger.warn('Failed to get APPLICATION_LOCALIZE from storage:', e);
    }
    await setI18nLocale(userLocale);
    logger.debug('✅ vue-i18n plugin locale set:', userLocale)

    // Create router
    logger.debug('🛣️ Creating Vue router...')
    const router = createRouter({
      history: createWebHashHistory(),
      routes: [
        { path: '/', redirect: '/languages' },
        { path: '/languages', component: LanguagesTab, name: 'languages' },
        { path: '/activation', component: ActivationTab, name: 'activation' },
        { path: '/prompt', component: PromptTab, name: 'prompt' },
        { path: '/api', component: ApiTab, name: 'api' },
        { path: '/import-export', component: ImportExportTab, name: 'import-export' },
        { path: '/advance', component: AdvanceTab, name: 'advance' },
        { path: '/help', component: HelpTab, name: 'help' },
        { path: '/about', component: About, name: 'about' }
      ]
    })
    logger.debug('✅ Router created successfully')

    // Create Vue app
    logger.debug('🎨 Creating Vue app...')
    const app = createApp(OptionsApp)
    logger.debug('✅ Vue app created successfully')
    
    // Add detailed debugging
    app.config.performance = true
    logger.debug('🔍 Vue performance tracking enabled')

    // Use plugins (order matters: i18n before router)
    logger.debug('🔌 Installing Pinia...')
    app.use(pinia)
    logger.debug('✅ Pinia installed')
    
    logger.debug('🔌 Installing i18n...')
    app.use(i18n)
    logger.debug('✅ i18n installed')
    
    logger.debug('🔌 Installing Router...')
    app.use(router)
    logger.debug('✅ Router installed')

    // Global properties for extension context
    logger.debug('⚙️ Setting global properties...')
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'options'
    
    // i18n is now provided by the unified vue-i18n plugin
    logger.debug('✅ i18n global property will be available after plugin installation')

    // Setup unified error handling
    logger.debug('🛡️ Setting up unified error handler...')
    setupGlobalErrorHandler(app, 'options')

    // Mount the app
    logger.debug('🎯 Mounting Vue app to #app...')
    app.mount('#app')
    logger.debug('🎉 Options app mounted successfully!')
  } catch (error) {
    logger.error('Failed to initialize options app:', error)
    logger.error('Error stack:', error.stack)
    
    // Show detailed error UI
    document.getElementById('app').innerHTML = DOMPurify.sanitize(`
      <div style="padding: 16px; color: red; font-family: monospace;">
        <h3>Failed to load extension options</h3>
        <details>
          <summary>Error Details (Click to expand)</summary>
          <pre style="white-space: pre-wrap; margin-top: 8px; background: #f5f5f5; padding: 8px; border-radius: 4px; color: black;">
Error: ${error.message}

Stack: ${error.stack}
          </pre>
        </details>
        <p>Please check the browser console for more details.</p>
        <button onclick="location.reload()" style="padding: 8px 16px; margin-top: 8px;">Reload</button>
      </div>
    `)
  }
}

// Initialize the app
initializeApp()

// Fallback mechanism for debugging
setTimeout(() => {
  const appElement = document.getElementById('app')
  if (appElement && appElement.innerHTML.includes('Failed to load extension options')) {
    logger.debug('⚠️ App failed to initialize, checking potential issues...')
    
    // Check if required APIs are available
    logger.debug('🔍 browser API check:')
    logger.debug('- typeof chrome:', typeof chrome)
    logger.debug('- typeof browser:', typeof browser)
    logger.debug('- chrome.runtime:', chrome?.runtime)
    logger.debug('- chrome.storage:', chrome?.storage)
    
    // Check if DOM is ready
    logger.debug('🔍 DOM check:')
    logger.debug('- document.readyState:', document.readyState)
    logger.debug('- #app element:', document.getElementById('app'))
    
    // Show simple recovery UI
    appElement.innerHTML = DOMPurify.sanitize(`
      <div style="padding: 20px; max-width: 600px; margin: 40px auto; border: 2px solid #e74c3c; border-radius: 8px; background: #fff;">
        <h2 style="color: #e74c3c; margin-top: 0;">Extension Loading Issue</h2>
        <p>The Vue.js application failed to initialize. This might be due to:</p>
        <ul style="text-align: left;">
          <li>browser extension API not ready</li>
          <li>Content Security Policy restrictions</li>
          <li>Missing dependencies or imports</li>
          <li>Timing issues with async initialization</li>
        </ul>
        <p><strong>Check the browser console for detailed error messages.</strong></p>
        <div style="margin-top: 20px;">
          <button onclick="location.reload()" style="padding: 10px 20px; margin-right: 10px; border: none; background: #3498db; color: white; border-radius: 4px; cursor: pointer;">Reload Page</button>
          <button onclick="browser.runtime.openOptionsPage()" style="padding: 10px 20px; border: none; background: #95a5a6; color: white; border-radius: 4px; cursor: pointer;">Open New Options Tab</button>
        </div>
      </div>
    `)
  }
}, 2000)

// Note: loadSettingsModules moved to @/utils/settings-modules.js to avoid circular imports
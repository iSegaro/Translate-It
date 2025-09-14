import { createApp } from 'vue'
import i18n, { setI18nLocale } from '@/utils/i18n/plugin.js'
import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '@/store'
import OptionsApp from '@/apps/options/OptionsApp.vue'
import '@/assets/styles/main.scss'
import browser from 'webextension-polyfill'
import DOMPurify from 'dompurify'
import { setupGlobalErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals } from '@/shared/error-management/windowErrorHandlers.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { configureVueForCSP } from '@/shared/vue/vue-utils.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'options');

// Import route components (lazy loaded)
const LanguagesTab = () => import('@/apps/options/tabs/LanguagesTab.vue')
const AppearanceTab = () => import('@/apps/options/tabs/AppearanceTab.vue')
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
        { path: '/appearance', component: AppearanceTab, name: 'appearance' },
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
    const app = configureVueForCSP(createApp(OptionsApp))
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
    
    // Show detailed error UI using DOM methods
    const appElement = document.getElementById('app');
    appElement.innerHTML = ''; // Clear existing content

    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 16px; color: red; font-family: monospace;';

    const h3 = document.createElement('h3');
    h3.textContent = 'Failed to load extension options';
    errorDiv.appendChild(h3);

    const details = document.createElement('details');

    const summary = document.createElement('summary');
    summary.textContent = 'Error Details (Click to expand)';
    details.appendChild(summary);

    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space: pre-wrap; margin-top: 8px; background: #f5f5f5; padding: 8px; border-radius: 4px; color: black;';
    pre.textContent = `Error: ${error.message}\n\nStack: ${error.stack}`;
    details.appendChild(pre);

    errorDiv.appendChild(details);

    const p = document.createElement('p');
    p.textContent = 'Please check the browser console for more details.';
    errorDiv.appendChild(p);

    const button = document.createElement('button');
    button.style.cssText = 'padding: 8px 16px; margin-top: 8px;';
    button.textContent = 'Reload';
    button.addEventListener('click', () => location.reload());
    errorDiv.appendChild(button);

    appElement.appendChild(errorDiv)
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
    
    // Show simple recovery UI using DOM methods
    appElement.innerHTML = ''; // Clear existing content

    const containerDiv = document.createElement('div');
    containerDiv.style.cssText = 'padding: 20px; max-width: 600px; margin: 40px auto; border: 2px solid #e74c3c; border-radius: 8px; background: #fff;';

    const h2 = document.createElement('h2');
    h2.style.cssText = 'color: #e74c3c; margin-top: 0;';
    h2.textContent = 'Extension Loading Issue';
    containerDiv.appendChild(h2);

    const p1 = document.createElement('p');
    p1.textContent = 'The Vue.js application failed to initialize. This might be due to:';
    containerDiv.appendChild(p1);

    const ul = document.createElement('ul');
    ul.style.textAlign = 'left';

    const li1 = document.createElement('li');
    li1.textContent = 'browser extension API not ready';
    ul.appendChild(li1);

    const li2 = document.createElement('li');
    li2.textContent = 'Content Security Policy restrictions';
    ul.appendChild(li2);

    const li3 = document.createElement('li');
    li3.textContent = 'Missing dependencies or imports';
    ul.appendChild(li3);

    const li4 = document.createElement('li');
    li4.textContent = 'Timing issues with async initialization';
    ul.appendChild(li4);

    containerDiv.appendChild(ul);

    const p2 = document.createElement('p');
    p2.innerHTML = '<strong>Check the browser console for detailed error messages.</strong>';
    containerDiv.appendChild(p2);

    const buttonDiv = document.createElement('div');
    buttonDiv.style.marginTop = '20px';

    const reloadButton = document.createElement('button');
    reloadButton.style.cssText = 'padding: 10px 20px; margin-right: 10px; border: none; background: #3498db; color: white; border-radius: 4px; cursor: pointer;';
    reloadButton.textContent = 'Reload Page';
    reloadButton.addEventListener('click', () => location.reload());
    buttonDiv.appendChild(reloadButton);

    const openButton = document.createElement('button');
    openButton.style.cssText = 'padding: 10px 20px; border: none; background: #95a5a6; color: white; border-radius: 4px; cursor: pointer;';
    openButton.textContent = 'Open New Options Tab';
    openButton.addEventListener('click', () => browser.runtime.openOptionsPage());
    buttonDiv.appendChild(openButton);

    containerDiv.appendChild(buttonDiv);
    appElement.appendChild(containerDiv)
  }
}, 2000)

// Note: loadSettingsModules moved to @/utils/settings-modules.js to avoid circular imports
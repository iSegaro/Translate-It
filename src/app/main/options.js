import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '@/store'
import OptionsApp from '@/views/options/OptionsApp.vue'
import '@/main.scss'
import { browserAPIReady } from '@/utils/browser-polyfill.js'

// Import route components (lazy loaded)
const LanguagesTab = () => import('@/views/options/tabs/LanguagesTab.vue')
const ActivationTab = () => import('@/views/options/tabs/ActivationTab.vue')
const PromptTab = () => import('@/views/options/tabs/PromptTab.vue')
const ApiTab = () => import('@/views/options/tabs/ApiTab.vue')
const ImportExportTab = () => import('@/views/options/tabs/ImportExportTab.vue')
const AdvanceTab = () => import('@/views/options/tabs/AdvanceTab.vue')
const HelpTab = () => import('@/views/options/tabs/HelpTab.vue')
const About = () => import('@/views/options/About.vue')

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    console.log('🚀 Starting options app initialization...')
    
    // Wait for browser API to be ready
    console.log('⏳ Waiting for browser API to be ready...')
    const browserAPI = await browserAPIReady
    console.log('✅ Browser API is ready')

    // Ensure browser API is globally available for i18n plugin
    if (typeof window !== 'undefined') {
      window.browser = browserAPI;
      window.chrome = browserAPI; // Some plugins expect chrome object
      
      // Debug: Check if i18n is available
      console.log('🔍 Checking i18n availability:', {
        'browserAPI.i18n': !!browserAPI.i18n,
        'browserAPI.i18n.getMessage': !!browserAPI.i18n?.getMessage,
        'window.browser.i18n': !!window.browser.i18n,
        'chrome.i18n (native)': !!chrome?.i18n
      });
    }

    // Import i18n plugin after browser API is ready and globally available
    console.log('📦 Importing i18n plugin...')
    const { default: i18n } = await import('vue-plugin-webextension-i18n')
    console.log('✅ i18n plugin imported successfully')

    // Create router
    console.log('🛣️ Creating Vue router...')
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
    console.log('✅ Router created successfully')

    // Create Vue app
    console.log('🎨 Creating Vue app...')
    const app = createApp(OptionsApp)
    console.log('✅ Vue app created successfully')

    // Use plugins
    console.log('🔌 Installing Pinia...')
    app.use(pinia)
    console.log('✅ Pinia installed')
    
    console.log('🔌 Installing Router...')
    app.use(router)
    console.log('✅ Router installed')
    
    console.log('🔌 Installing i18n...')
    app.use(i18n)
    console.log('✅ i18n installed')

    // Global properties for extension context
    console.log('⚙️ Setting global properties...')
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'options'

    // Error handling
    console.log('🛡️ Setting up error handler...')
    app.config.errorHandler = (err, instance, info) => {
      console.error('Options Vue Error:', err, info)
      
      // Send error to background script for logging
      try {
        browser.runtime.sendMessage({
          action: 'LOG_ERROR',
          data: {
            error: err.message,
            context: 'options',
            info
          }
        })
      } catch (e) {
        console.error('Failed to send error to background:', e)
      }
    }

    // Mount the app
    console.log('🎯 Mounting Vue app to #app...')
    app.mount('#app')
    console.log('🎉 Options app mounted successfully!')
  } catch (error) {
    console.error('Failed to initialize options app:', error)
    console.error('Error stack:', error.stack)
    
    // Show detailed error UI
    document.getElementById('app').innerHTML = `
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
    `
  }
}

// Initialize the app
initializeApp()

// Fallback mechanism for debugging
setTimeout(() => {
  const appElement = document.getElementById('app')
  if (appElement && appElement.innerHTML.includes('Failed to load extension options')) {
    console.log('⚠️ App failed to initialize, checking potential issues...')
    
    // Check if required APIs are available
    console.log('🔍 Browser API check:')
    console.log('- typeof chrome:', typeof chrome)
    console.log('- typeof browser:', typeof browser)
    console.log('- chrome.runtime:', chrome?.runtime)
    console.log('- chrome.storage:', chrome?.storage)
    
    // Check if DOM is ready
    console.log('🔍 DOM check:')
    console.log('- document.readyState:', document.readyState)
    console.log('- #app element:', document.getElementById('app'))
    
    // Show simple recovery UI
    appElement.innerHTML = `
      <div style="padding: 20px; max-width: 600px; margin: 40px auto; border: 2px solid #e74c3c; border-radius: 8px; background: #fff;">
        <h2 style="color: #e74c3c; margin-top: 0;">Extension Loading Issue</h2>
        <p>The Vue.js application failed to initialize. This might be due to:</p>
        <ul style="text-align: left;">
          <li>Browser extension API not ready</li>
          <li>Content Security Policy restrictions</li>
          <li>Missing dependencies or imports</li>
          <li>Timing issues with async initialization</li>
        </ul>
        <p><strong>Check the browser console for detailed error messages.</strong></p>
        <div style="margin-top: 20px;">
          <button onclick="location.reload()" style="padding: 10px 20px; margin-right: 10px; border: none; background: #3498db; color: white; border-radius: 4px; cursor: pointer;">Reload Page</button>
          <button onclick="chrome.runtime.openOptionsPage()" style="padding: 10px 20px; border: none; background: #95a5a6; color: white; border-radius: 4px; cursor: pointer;">Open New Options Tab</button>
        </div>
      </div>
    `
  }
}, 2000)

// Lazy loading functions for options-specific features
export const loadSettingsModules = async () => {
  const [providers, import_export, backup] = await Promise.all([
    import('@/store/modules/providers.js'),
    import('@/store/modules/import-export.js'),
    import('@/store/modules/backup.js')
  ])
  return { providers, import_export, backup }
}

// Preload essential modules
setTimeout(async () => {
  try {
    await loadSettingsModules()
  } catch (error) {
    console.error('Failed to preload settings modules:', error)
  }
}, 100)
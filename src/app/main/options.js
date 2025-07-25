import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '@/store'
import OptionsApp from '@/views/options/OptionsApp.vue'
import '@/main.scss'
import { browserAPIReady } from '@/utils/browser-polyfill.js'

// Import route components (lazy loaded)
const GeneralSettings = () => import('@/views/options/GeneralSettings.vue')
const ProviderSettings = () => import('@/views/options/ProviderSettings.vue')
const AdvancedSettings = () => import('@/views/options/AdvancedSettings.vue')
const About = () => import('@/views/options/About.vue')

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Wait for browser API to be ready
    await browserAPIReady

    // Create router
    const router = createRouter({
      history: createWebHashHistory(),
      routes: [
        { path: '/', redirect: '/general' },
        { path: '/general', component: GeneralSettings, name: 'general' },
        { path: '/providers', component: ProviderSettings, name: 'providers' },
        { path: '/advanced', component: AdvancedSettings, name: 'advanced' },
        { path: '/about', component: About, name: 'about' }
      ]
    })

    // Create Vue app
    const app = createApp(OptionsApp)

    // Use plugins
    app.use(pinia)
    app.use(router)

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'options'

    // Error handling
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
    app.mount('#app')
  } catch (error) {
    console.error('Failed to initialize options app:', error)
    // Show error UI
    document.getElementById('app').innerHTML = '<div style="padding: 16px; color: red;">Failed to load extension options. Please try reloading.</div>'
  }
}

// Initialize the app
initializeApp()

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
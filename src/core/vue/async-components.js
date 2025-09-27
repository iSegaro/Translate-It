// Vue component async loader for optimized loading
import { defineAsyncComponent } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js'

const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'async-components')

// Component categories for different loading strategies
const COMPONENT_CATEGORIES = {
  CRITICAL: [], // Load immediately
  DEFERRED: [   // Load after initial render
    'TranslationWindow',
    'TranslationResult',
    'TranslationControls'
  ],
  LAZY: [       // Load on demand
    'SettingsPanel',
    'HistoryPanel',
    'ProviderSettings',
    'FontSelector',
    'LanguageSelector'
  ],
  RARELY_USED: [ // Load only when explicitly needed
    'AdvancedSettings',
    'DebugPanel',
    'StatisticsPanel'
  ]
}

// Async component with loading states
export function createAsyncComponent(loader, options = {}) {
  return defineAsyncComponent({
    loader,
    loadingComponent: options.loadingComponent || null,
    errorComponent: options.errorComponent || null,
    delay: options.delay || 200,
    timeout: options.timeout || 10000,
    suspensible: options.suspensible !== false
  })
}

// Create component importers for better code splitting
export const componentImporters = {
  // Translation components
  TranslationWindow: () => import('@/components/content/TranslationWindow.vue'),
  TranslationResult: () => import('@/components/content/TranslationResult.vue'),
  TranslationControls: () => import('@/components/content/TranslationControls.vue'),

  // Settings components
  SettingsPanel: () => import('@/components/content/SettingsPanel.vue'),
  ProviderSettings: () => import('@/components/settings/ProviderSettings.vue'),

  // UI components
  FontSelector: () => import('@/components/base/FontSelector.vue'),
  LanguageSelector: () => import('@/components/base/LanguageSelector.vue'),

  // Advanced components
  AdvancedSettings: () => import('@/components/settings/AdvancedSettings.vue'),
  DebugPanel: () => import('@/components/debug/DebugPanel.vue'),
  StatisticsPanel: () => import('@/components/statistics/StatisticsPanel.vue')
}

// Preload components strategically
export function preloadComponents(category) {
  const components = COMPONENT_CATEGORIES[category] || []

  switch (category) {
    case 'DEFERRED':
      // Preload after initial render
      setTimeout(() => {
        components.forEach(name => {
          if (componentImporters[name]) {
            componentImporters[name]()
              .catch(error => {
                // Use ErrorHandler for component preload errors
                const errorHandler = ErrorHandler.getInstance();
                errorHandler.handle(error, {
                  context: `component-preload-${name}`,
                  isSilent: true, // Preload failures are not critical
                  showToast: false
                });

                logger.warn(`Failed to preload ${name}:`, error);
              })
          }
        })
      }, 1000)
      break

    case 'LAZY':
      // Preload when user is likely to need them
      setTimeout(() => {
        components.forEach(name => {
          if (componentImporters[name]) {
            componentImporters[name]()
              .catch(error => {
                // Use ErrorHandler for component preload errors
                const errorHandler = ErrorHandler.getInstance();
                errorHandler.handle(error, {
                  context: `component-preload-${name}`,
                  isSilent: true, // Preload failures are not critical
                  showToast: false
                });

                logger.warn(`Failed to preload ${name}:`, error);
              })
          }
        })
      }, 3000)
      break
  }
}

// Create async components for export
export const AsyncComponents = {
  // Create async versions of all components
  ...Object.keys(componentImporters).reduce((acc, name) => {
    acc[name] = createAsyncComponent(componentImporters[name], {
      delay: COMPONENT_CATEGORIES.DEFERRED.includes(name) ? 0 : 200,
      timeout: 10000
    })
    return acc
  }, {})
}

// Component preloader for smart loading
export class ComponentPreloader {
  constructor() {
    this.preloadedComponents = new Set()
  }

  async preload(name) {
    if (this.preloadedComponents.has(name)) return

    try {
      await componentImporters[name]()
      this.preloadedComponents.add(name)
    } catch (error) {
      // Use ErrorHandler for component preload errors
      const errorHandler = ErrorHandler.getInstance();
      errorHandler.handle(error, {
        context: `component-preload-${name}`,
        isSilent: true, // Component preload failures are not critical
        showToast: false
      });

      logger.warn(`Failed to preload component ${name}:`, error)
    }
  }

  preloadByCategory(category) {
    preloadComponents(category)
  }

  preloadOnInteraction() {
    // Preload components when user interacts
    const interactions = ['click', 'focus', 'scroll']

    interactions.forEach(event => {
      document.addEventListener(event, () => {
        this.preloadByCategory('LAZY')
      }, { once: true, passive: true })
    })
  }
}

// Export singleton instance
export const componentPreloader = new ComponentPreloader()
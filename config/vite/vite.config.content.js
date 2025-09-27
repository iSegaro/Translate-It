import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Specialized configuration for content scripts to handle Vue styles in Shadow DOM
export const createContentConfig = (browser) => {
  const baseConfig = createBaseConfig(browser)
  const isProduction = process.env.NODE_ENV === 'production'
  
  return defineConfig({
    ...baseConfig,
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // Allow translate-it- prefixed custom elements for CSP compatibility
            isCustomElement: (tag) => tag.startsWith('translate-it-'),
            whitespace: 'preserve'
          }
        },
        // Enable CSS extraction for Shadow DOM injection
        style: {
          injectTo: 'head',
          // Process Vue styles to be injectable
          preprocessLang: 'css'
        }
      }),
      // Custom plugin to extract Vue component styles
      {
        name: 'vue-shadow-dom-styles',
        generateBundle(options, bundle) {
          // Extract CSS from Vue components and make it available as modules
          const cssFiles = Object.keys(bundle).filter(file => file.endsWith('.css'))
          
          for (const cssFile of cssFiles) {
            const cssContent = bundle[cssFile].source || ''
            
            // Create a JS module that exports the CSS as a string
            const jsModuleName = cssFile.replace('.css', '.css.js')
            
            this.emitFile({
              type: 'asset',
              fileName: jsModuleName,
              source: `export default ${JSON.stringify(cssContent)};`
            })
          }
        }
      }
    ],

    build: {
      ...baseConfig.build,
      // Ensure CSS is not split for content scripts
      cssCodeSplit: false,
      
      rollupOptions: {
        ...baseConfig.build.rollupOptions,
        output: {
          ...baseConfig.build.rollupOptions.output,
          // Content script chunks - new lazy loading architecture
          manualChunks: (id) => {
            // Content script entry point
            if (id.includes('src/core/content-scripts/index')) {
              return 'content/content-entry';
            }
            if (id.includes('src/core/content-scripts/ContentScriptCore')) {
              return 'content/content-core';
            }
            if (id.includes('src/core/content-scripts/chunks/lazy-vue-app')) {
              return 'content/content-vue';
            }
            if (id.includes('src/core/content-scripts/chunks/lazy-features')) {
              return 'content/content-features-core';
            }
            if (id.includes('src/core/content-scripts/chunks/lazy-text-selection')) {
              return 'content/content-text-selection';
            }
            if (id.includes('src/core/content-scripts/chunks/lazy-windows-manager')) {
              return 'content/content-windows-manager';
            }
            if (id.includes('src/core/content-scripts/chunks/lazy-text-field-icon')) {
              return 'content/content-text-field-icon';
            }

            // Vendor chunks for content scripts
            if (id.includes('node_modules')) {
              if (id.includes('vue') && !id.includes('vue-router')) {
                return 'content/vendor/vue-core';
              }
              if (id.includes('vue-router')) {
                return 'content/vendor/vue-router';
              }
              if (id.includes('pinia')) {
                return 'content/vendor/vue-core';
              }
              if (id.includes('@vueuse')) {
                return 'content/vendor/vue-utils';
              }
              return 'content/vendor/vendor';
            }

            // Component chunks for content scripts
            if (id.includes('src/components') && (id.includes('content') || id.includes('shared'))) {
              return 'content/components';
            }

            // Utility chunks for content scripts
            if (id.includes('src/utils') && !id.includes('src/utils/i18n/locales')) {
              return 'content/utils';
            }

            // Store chunks for content scripts
            if (id.includes('src/store')) {
              return 'content/store';
            }

            // Return undefined to let Vite handle other chunks normally
            return undefined;
          },
          // Custom asset handling for CSS in content scripts
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.')
            const ext = info[info.length - 1]

            if (/\.(css)$/i.test(assetInfo.name)) {
              // Keep CSS files accessible for inline import
              return 'css/[name].[ext]'
            }

            return baseConfig.build.rollupOptions.output.assetFileNames(assetInfo)
          },
          // Custom chunk file names for content scripts
          chunkFileNames: (chunkInfo) => {
            if (chunkInfo.name.startsWith('content/')) {
              return 'js/[name].[hash].js';
            }
            return baseConfig.build.rollupOptions.output.chunkFileNames || 'js/[name].[hash].js';
          }
        }
      }
    },

    // CSS configuration optimized for Shadow DOM
    css: {
      ...baseConfig.css,
      // Enable extraction of Vue component styles
      extract: {
        filename: 'css/vue-components.css'
      },
      postcss: {
        plugins: [
          // Ensure styles work in Shadow DOM context
          {
            postcssPlugin: 'shadow-dom-compatibility',
            Once(root) {
              // Add :host selector support if needed
              root.walkRules(rule => {
                if (rule.selector.includes('.v-')) {
                  // Vue scoped styles - ensure they work in Shadow DOM
                  rule.selector = rule.selector.replace(/^(\s*)/, '$1:host ')
                }
              })
            }
          }
        ]
      }
    }
  })
}

export default createContentConfig('chrome')
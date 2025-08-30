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
            isCustomElement: (tag) => false,
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
          // Custom asset handling for CSS in content scripts
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.')
            const ext = info[info.length - 1]
            
            if (/\.(css)$/i.test(assetInfo.name)) {
              // Keep CSS files accessible for inline import
              return 'css/[name].[ext]'
            }
            
            return baseConfig.build.rollupOptions.output.assetFileNames(assetInfo)
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
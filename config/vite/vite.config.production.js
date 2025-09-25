import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import analyzerPkg from 'rollup-plugin-analyzer'
const analyzer = analyzerPkg.default || analyzerPkg

export default defineConfig({
  plugins: [
    vue(),
    // Bundle analyzer plugins (only in analyze mode)
    ...(process.env.ANALYZE_BUNDLE ? [
      visualizer({
        filename: 'dist-vue/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap'
      }),
      analyzer({
        summaryOnly: true,
        limit: 10
      })
    ] : [])
  ],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src'),
      '@components': resolve(__dirname, '../../src/components'),
      '@views': resolve(__dirname, '../../src/views'),
      '@store': resolve(__dirname, '../../src/store'),
      '@composables': resolve(__dirname, '../../src/composables'),
      '@utils': resolve(__dirname, '../../src/utils'),
      '@providers': resolve(__dirname, '../../src/providers'),
      '@assets': resolve(__dirname, '../../src/assets')
    }
  },

  build: {
    outDir: 'dist-vue',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, '../../popup.html'),
        sidepanel: resolve(__dirname, '../../sidepanel.html'),
        options: resolve(__dirname, '../../options.html')
      },
      
      external: [
        'webextension-polyfill'
      ],
      
      output: {
        // Advanced manual chunk configuration for production
        manualChunks: (id) => {
          // Vendor chunks - separate by library
          if (id.includes('node_modules')) {
            if (id.includes('vue') && !id.includes('vue-router')) {
              return 'vue-core'
            }
            if (id.includes('pinia')) {
              return 'vue-core'
            }
            if (id.includes('@vueuse')) {
              return 'vue-utils'
            }
            if (id.includes('vue-router')) {
              return 'vue-router'
            }
            // Other small libraries grouped together
            return 'vendor'
          }
          
          // Provider chunks - lazy loaded
          if (id.includes('src/providers/implementations')) {
            const providerMatch = id.match(/implementations\/(.+?)Provider/)
            if (providerMatch) {
              return `provider-${providerMatch[1].toLowerCase()}`
            }
            return 'providers'
          }
          
          if (id.includes('src/providers')) {
            return 'providers-core'
          }

          // Provider chunks - lazy loaded (highest priority)
          if (id.includes('src/features/translation/providers/') && !id.includes('ProviderFactory') && !id.includes('ProviderRegistry') && !id.includes('register-providers')) {
            const providerMatch = id.match(/providers\/(.+?)\.js/)
            if (providerMatch) {
              const providerName = providerMatch[1].toLowerCase()
              return `provider-${providerName}`
            }
            return 'providers'
          }

          // Feature-based chunks
          if (id.includes('src/features/screen-capture') || id.includes('ScreenCapture')) {
            return 'feature-capture'
          }

          if (id.includes('src/features/element-selection') || id.includes('SelectElement')) {
            return 'feature-element-selection'
          }

          if (id.includes('src/features/iframe-support') || id.includes('IFrame')) {
            return 'feature-iframe'
          }

          if (id.includes('src/features/text-actions') || id.includes('TextActions')) {
            return 'feature-text-actions'
          }

          if (id.includes('src/features/tts') || id.includes('TTS') || id.includes('speech')) {
            return 'feature-tts'
          }
          
          // Component chunks
          if (id.includes('src/components/base')) {
            return 'components-base'
          }
          
          if (id.includes('src/components/feature')) {
            return 'components-feature'
          }
          
          if (id.includes('src/components/content')) {
            return 'components-content'
          }
          
          // Utils splitting - organized by functionality
          if (id.includes('src/utils')) {
            // Text processing utilities
            if (id.includes('utils/rendering') || id.includes('utils/text')) {
              return 'utils-text'
            }

            // i18n and language utilities (heaviest)
            if (id.includes('utils/i18n') || id.includes('utils/languages')) {
              return 'utils-i18n'
            }

            // Browser-specific utilities
            if (id.includes('utils/browser')) {
              return 'utils-browser'
            }

            // UI utilities
            if (id.includes('utils/ui')) {
              return 'utils-ui'
            }

            // Security and storage utilities
            if (id.includes('utils/secureStorage') || id.includes('utils/security')) {
              return 'utils-security'
            }

            // Provider and HTML generation utilities
            if (id.includes('utils/provider') || id.includes('utils/html')) {
              return 'utils-provider'
            }

            // Small core utilities (messaging, etc.)
            return 'utils-core'
          }
          
          // Store chunks
          if (id.includes('src/store')) {
            return 'store'
          }
        },
        
        // Optimized chunk naming for production
        chunkFileNames: (chunkInfo) => {
          const name = chunkInfo.name || 'chunk'
          const hash = '[hash:8]'
          
          // Different paths for different chunk types
          if (name.startsWith('vue-') || name === 'vendor') {
            return `js/vendor/${name}.${hash}.js`
          }

          if (name.startsWith('provider-')) {
            return `js/providers/${name}.${hash}.js`
          }
          
          if (name.startsWith('feature-')) {
            return `js/features/${name}.${hash}.js`
          }
          
          if (name.startsWith('components-')) {
            return `js/components/${name}.${hash}.js`
          }

          if (name.startsWith('utils-')) {
            return `js/utils/${name}.${hash}.js`
          }

          return `js/${name}.${hash}.js`
        },
        
        // Optimized asset naming
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          const name = info.slice(0, -1).join('.')
          const hash = '[hash:8]'
          
          if (/\.(css)$/i.test(assetInfo.name)) {
            return `css/${name}.${hash}.${ext}`
          }
          
          if (/\.(png|jpe?g|svg|gif|webp|avif)$/i.test(assetInfo.name)) {
            return `images/${name}.${hash}.${ext}`
          }
          
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return `fonts/${name}.${hash}.${ext}`
          }
          
          return `assets/${name}.${hash}.${ext}`
        }
      },
      
      // Advanced tree shaking configuration
      treeshake: {
        moduleSideEffects: (id) => {
          // Allow side effects for CSS files and polyfills
          if (id.includes('.css') || id.includes('polyfill')) {
            return true
          }
          // No side effects for most modules
          return false
        },
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
        annotations: true
      }
    },
    
    // Production optimizations
    target: 'esnext',
    
    // Chunk size warnings
    chunkSizeWarningLimit: 50, // 50KB warning threshold for production
    
    // Advanced minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.warn'],
        passes: 2
      },
      mangle: {
        safari10: true,
        properties: {
          regex: /^_/
        }
      },
      format: {
        comments: false
      }
    },
    
    // No source maps in production
    sourcemap: false,
    
    // CSS optimization
    cssCodeSplit: true,
    cssMinify: true,
    
    // Asset optimization
    assetsInlineLimit: 4096, // 4KB inline limit
    
    // Report compressed size
    reportCompressedSize: true
  },
  
  // Production CSS optimization
  css: {
    devSourcemap: false,
    preprocessorOptions: {
      scss: {
        // Remove unused CSS variables in production
        outputStyle: 'compressed'
      }
    }
  },
  
  // Define production constants
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    'process.env.NODE_ENV': '"production"'
  },
  
  // Optimize dependencies for production
  optimizeDeps: {
    include: [
      'vue',
      'pinia'
    ],
    exclude: [
      // Exclude provider implementations for lazy loading
      'src/features/translation/providers/GoogleTranslate.js',
      'src/features/translation/providers/OpenAI.js',
      'src/features/translation/providers/Gemini.js',
      'src/features/translation/providers/DeepSeek.js',
      'src/features/translation/providers/YandexTranslate.js',
      'src/features/translation/providers/BingTranslate.js',
      'src/features/translation/providers/OpenRouter.js',
      'src/features/translation/providers/WebAI.js',
      'src/features/translation/providers/CustomProvider.js',
      'src/features/translation/providers/BrowserAPI.js',
      // Exclude large features for code splitting
      'src/features/screen-capture',
      'src/features/element-selection',
      'src/features/iframe-support',
      // Exclude utils modules for lazy loading and code splitting
      'src/utils/i18n',
      'src/utils/browser',
      'src/utils/rendering',
      'src/utils/ui',
      'src/utils/secureStorage.js',
      'src/utils/providerHtmlGenerator.js'
    ]
  },
  
  // Advanced esbuild options
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
    treeShaking: true
  }
})
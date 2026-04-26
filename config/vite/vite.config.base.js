import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import babel from '@rollup/plugin-babel'
// import enhancedTreeShaking from './plugins/enhanced-tree-shaking.js'

// Base configuration shared across all builds
export const createBaseConfig = (browser, options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production'
  const isDevelopment = !isProduction
  const isWatchMode = process.env.VITE_WATCH_MODE === 'true'

  console.log(`🔧 Creating base config for ${browser} (${isProduction ? 'production' : 'development'} mode)${isWatchMode ? ' [WATCH MODE]' : ''}`);

  return defineConfig({
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // Allow translate-it- prefixed custom elements for CSP compatibility
            isCustomElement: (tag) => tag.startsWith('translate-it-'),
            // Compile templates at build time to avoid runtime innerHTML usage
            whitespace: 'preserve',
            // Disable runtime compilation for CSP compliance
            isRuntimeTemplateCompiled: true
          }
        }
      }),
      babel({
        babelHelpers: 'bundled',
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }]
        ]
      }),
      // enhancedTreeShaking({
      //   include: ['src/**/*.{js,vue}'],
      //   exclude: ['node_modules/**']
      // }),
      ...(options.extraPlugins || [])
    ],

    // browser-specific definitions  
    define: {
      __BROWSER__: JSON.stringify(browser),
      __BUILD_YEAR__: new Date().getFullYear(),
      __IS_PRODUCTION__: isProduction,
      __IS_DEVELOPMENT__: isDevelopment,
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: false, // Disable devtools to avoid eval
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
      'process.env.BROWSER': `"${browser}"`,
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
      ...(options.extraDefines || {})
    },
    
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src'),
        '@components': resolve(process.cwd(), 'src/components'),
        '@views': resolve(process.cwd(), 'src/apps'),
        '@store': resolve(process.cwd(), 'src/store'),
        '@composables': resolve(process.cwd(), 'src/composables'),
        '@utils': resolve(process.cwd(), 'src/utils'),
        '@providers': resolve(process.cwd(), 'src/features/translation/providers'),
        '@assets': resolve(process.cwd(), 'src/assets')
      }
    },

    build: {
      outDir: options.outDir || `dist/${browser}`,
      emptyOutDir: true,
      // Force clean rebuild in watch mode
      watch: isWatchMode ? {
        clearScreen: false
      } : undefined,
      rollupOptions: {
        
        output: {
          // Optimized chunk strategy: Let Vite handle the complex dependency graph
          // while keeping heavy third-party libs and data separate.
          manualChunks: (id) => {
            // 1. Vendor Chunks (Third-party libraries)
            if (id.includes('node_modules')) {
              if (id.includes('vue') && !id.includes('vue-router')) {
                return 'vendor/vue-core'
              }
              if (id.includes('vue-router')) {
                return 'vendor/vue-router'
              }
              if (id.includes('pinia')) {
                return 'vendor/vue-core'
              }
              if (id.includes('@vueuse')) {
                return 'vendor/vue-utils'
              }
              return 'vendor/vendor'
            }
            
            // 2. Heavy Background Providers
            if (id.includes('src/core/background/providers/')) {
              const providerMatch = id.match(/providers\/(.+?)Provider/)
              if (providerMatch) {
                return `background/provider-${providerMatch[1].toLowerCase()}`
              }
            }

            // 3. Independent Feature Modules (Lazy by nature)
            if (id.includes('src/capture') || id.includes('ScreenCapture')) {
              return 'features/feature-capture'
            }
            if (id.includes('src/subtitle') || id.includes('Subtitle')) {
              return 'features/feature-subtitle'
            }

            // 4. Large Language Data (Keeps the main bundle small)
            if (id.includes('src/utils/i18n/locales/')) {
              const localeMatch = id.match(/locales\/([a-z0-9-]+)\.json$/);
              if (localeMatch) return `locales/${localeMatch[1]}`;
            }
            if (id.includes('languages.js')) {
              if (id.includes('translation')) return 'languages/translation-data';
              if (id.includes('tts')) return 'languages/tts-data';
            }

            // Note: We removed manual chunks for core logic (store, shared comps, utils)
            // to allow Vite to resolve circular dependencies correctly.
          },
          
          chunkFileNames: 'js/[name].[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.')
            const ext = info[info.length - 1]
            
            if (/\.(css)$/i.test(assetInfo.name)) {
              return 'css/[name].[hash].[ext]'
            }
            
            if (/\.(png|jpe?g|svg|gif|webp|avif)$/i.test(assetInfo.name)) {
              return 'images/[name].[hash].[ext]'
            }
            
            if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
              return 'fonts/[name].[hash].[ext]'
            }
            
            return 'assets/[name].[hash].[ext]'
          }
        }
      },
      
      target: 'esnext',
      minify: (isProduction && !isWatchMode) ? 'terser' : false,
      terserOptions: (isProduction && !isWatchMode) ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.warn', 'console.error']
        },
        mangle: {
          safari10: true,
          reserved: ['safeConsole', 'SafeConsole']
        },
        format: {
          comments: false
        }
      } : undefined,
      
      sourcemap: isDevelopment,
      chunkSizeWarningLimit: browser === 'chrome' ? 100 : 200, 
      
      cssCodeSplit: false,
      cssMinify: isProduction,
      assetsInlineLimit: 4096,
      reportCompressedSize: isProduction
    },

    css: {
      devSourcemap: isDevelopment,
      preprocessorOptions: {
        scss: {
          outputStyle: isProduction ? 'compressed' : 'expanded'
        }
      }
    },
    
    server: {
      port: browser === 'chrome' ? 3000 : 3001,
      open: false,
      cors: true,
      fs: {
        strict: false
      },
      watch: {
        usePolling: false,
        interval: 100
      }
    },

    optimizeDeps: {
      include: [
        'vue',
        'pinia',
        '@vueuse/core'
      ],
      exclude: [
        'src/core/background/providers',
        'src/providers/implementations',
        'src/capture',
        'src/subtitle'
      ],
      force: isWatchMode
    },
    
    esbuild: {
      drop: (isProduction && !isWatchMode) ? ['console', 'debugger'] : [],
      legalComments: 'none',
      treeShaking: true
    }
  })
}

// Default export for compatibility
export default createBaseConfig('vue')
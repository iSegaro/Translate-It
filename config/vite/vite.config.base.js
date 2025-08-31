import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import babel from '@rollup/plugin-babel'

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
            // Disable eval for Chrome MV3 compatibility
            isCustomElement: (tag) => false,
            // Compile templates at build time
            whitespace: 'preserve'
          }
        }
      }),
      babel({
        babelHelpers: 'bundled',
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }]
        ]
      }),
      ...(options.extraPlugins || [])
    ],

    // browser-specific definitions  
    define: {
      __BROWSER__: JSON.stringify(browser),
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
        '@providers': resolve(process.cwd(), 'src/providers'),
        '@assets': resolve(process.cwd(), 'src/assets')
      }
    },

    build: {
      outDir: options.outDir || `dist/${browser}`,
      emptyOutDir: true,
      // Force clean rebuild in watch mode
      watch: isWatchMode ? {
        include: ['src/**/*', 'html/**/*', 'public/**/*'],
        exclude: ['node_modules/**', 'dist/**'],
        clearScreen: false
      } : undefined,
      rollupOptions: {
        
        output: {
          // Base chunk strategy
          manualChunks: (id) => {
            // Vendor chunks
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
            
            // Background provider chunks (only in background bundle)
            if (id.includes('src/background/providers/')) {
              const providerMatch = id.match(/providers\/(.+?)Provider/)
              if (providerMatch) {
                return `background/provider-${providerMatch[1].toLowerCase()}`
              }
              return 'background/providers'
            }
            
            // UI provider registry (lightweight)
            if (id.includes('src/core/provider-registry')) {
              return 'core/provider-registry'
            }
            
            // Legacy providers (should not be used in UI contexts)
            if (id.includes('src/providers')) {
              return 'legacy/providers-core'
            }
            
            // Component chunks
            if (id.includes('src/components/base')) {
              return 'components/components-base'
            }
            
            if (id.includes('src/components/feature')) {
              return 'components/components-feature'
            }
            
            if (id.includes('src/components/content')) {
              return 'components/components-content'
            }
            
            // Feature chunks
            if (id.includes('src/capture') || id.includes('ScreenCapture')) {
              return 'features/feature-capture'
            }
            
            if (id.includes('src/subtitle') || id.includes('Subtitle')) {
              return 'features/feature-subtitle'
            }
            
            if (id.includes('src/utils/tts') || id.includes('TTS')) {
              return 'features/feature-tts'
            }
            
            // Utility chunks
            if (id.includes('src/utils')) {
              return 'utils/utils'
            }
            
            // Store chunks
            if (id.includes('src/store')) {
              return 'store/store'
            }
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
          pure_funcs: ['console.log', 'console.debug', 'console.info']
        },
        mangle: {
          safari10: true
        },
        format: {
          comments: false
        }
      } : undefined,
      
      sourcemap: isDevelopment,
      chunkSizeWarningLimit: browser === 'chrome' ? 100 : 200, // Chrome has stricter limits
      
      // CSS optimization - disable code splitting for content scripts to ensure proper Shadow DOM injection
      cssCodeSplit: false,
      cssMinify: isProduction,
      
      // Asset optimization
      assetsInlineLimit: 4096,
      
      // Report compressed size in production
      reportCompressedSize: isProduction
    },

    // CSS preprocessing
    css: {
      devSourcemap: isDevelopment,
      preprocessorOptions: {
        scss: {
          outputStyle: isProduction ? 'compressed' : 'expanded'
        }
      }
    },
    
    
    // Development server
    server: {
      port: browser === 'chrome' ? 3000 : 3001,
      open: false,
      cors: true
    },
    
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'vue',
        'pinia',
        '@vueuse/core'
      ],
      exclude: [
        // Exclude background providers (not used in UI contexts)
        'src/background/providers',
        // Exclude legacy providers
        'src/providers/implementations',
        // Exclude large features for code splitting
        'src/capture',
        'src/subtitle'
      ],
      // Disable caching in watch mode for better reliability
      force: isWatchMode
    },
    
    // ESBuild options
    esbuild: {
      drop: (isProduction && !isWatchMode) ? ['console', 'debugger'] : [],
      legalComments: 'none',
      treeShaking: true
    }
  })
}

// Default export for compatibility
export default createBaseConfig('vue')
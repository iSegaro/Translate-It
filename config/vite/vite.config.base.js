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
            if (id.includes('src/core/background/providers/')) {
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
              // Split FontSelector and font detector into separate chunk
              if (id.includes('FontSelector') || id.includes('SystemFontDetector')) {
                return 'components/components-fonts'
              }
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

            // API settings - split into separate chunk
            if (id.includes('src/apps/options/tabs/ApiTab') ||
                id.includes('OpenAIOptions') ||
                id.includes('GoogleOptions') ||
                id.includes('GeminiOptions') ||
                id.includes('ClaudeOptions') ||
                id.includes('GroqOptions') ||
                id.includes('DeepSeekOptions') ||
                id.includes('MistralOptions') ||
                id.includes('PerplexityOptions') ||
                id.includes('LLaMAOptions')) {
              return 'features/api-settings'
            }
            
            // Utility chunks - more granular splitting
            if (id.includes('src/utils')) {
              // Special handling for locale files - create separate chunks
              if (id.includes('src/utils/i18n/locales')) {
                const localeMatch = id.match(/locales\/([a-z]{2,3})\.json$/);
                if (localeMatch) {
                  return `locales/${localeMatch[1]}`;
                }
                return 'utils/locales-other';
              }

              // I18n utilities - more granular splitting
              if (id.includes('src/utils/i18n')) {
                // Language loaders - separate chunks for different language types
                if (id.includes('LanguagePackLoader')) {
                  return 'languages/loader-main';
                }
                if (id.includes('TranslationLanguageLoader')) {
                  return 'languages/loader-translation';
                }
                if (id.includes('InterfaceLanguageLoader')) {
                  return 'languages/loader-interface';
                }
                if (id.includes('TtsLanguageLoader')) {
                  return 'languages/loader-tts';
                }
                // Main i18n functionality
                if (id.includes('i18n.js')) {
                  return 'utils/i18n-main';
                }
                // Translation languages (65+ languages)
                if (id.includes('languages.js') && id.includes('translation')) {
                  return 'languages/translation-data';
                }
                // TTS languages (~80 languages)
                if (id.includes('languages.js') && id.includes('tts')) {
                  return 'languages/tts-data';
                }
                // Interface languages (currently 2 languages)
                if (id.includes('languages.js') && id.includes('interface')) {
                  return 'languages/interface-data';
                }
                // Language detection utilities
                if (id.includes('LanguageDetector')) {
                  return 'languages/detection';
                }
                // Helper functions
                if (id.includes('helper.js')) {
                  return 'utils/i18n-helper';
                }
                // Plugin and utilities
                if (id.includes('plugin.js') || id.includes('localization.js') ||
                    id.includes('langUtils.js') || id.includes('vue-i18n-macro.js')) {
                  return 'utils/i18n-utils';
                }
                return 'utils/i18n-core';
              }

              // Browser utilities
              if (id.includes('src/utils/browser')) {
                return 'utils/browser';
              }

              // UI utilities
              if (id.includes('src/utils/ui')) {
                return 'utils/ui';
              }

              // Rendering utilities
              if (id.includes('src/utils/rendering')) {
                return 'utils/rendering';
              }

              // Security utilities
              if (id.includes('src/utils/secureStorage')) {
                return 'utils/security';
              }

              // Messaging utilities
              if (id.includes('src/utils/messaging')) {
                return 'utils/messaging';
              }

              // Provider utilities
              if (id.includes('src/utils/providerHtmlGenerator')) {
                return 'utils/provider';
              }

              // Utils factory itself (keep separate as it's the entry point)
              if (id.includes('src/utils/UtilsFactory')) {
                return 'utils/factory';
              }

              return 'utils/core';
            }
            
            // Store chunks
            if (id.includes('src/store')) {
              return 'store/store'
            }

            // Content script chunks - ultra-aggressive splitting
            if (id.includes('src/core/content-scripts/index')) {
              // Main entry point - ultra minimal (<5KB)
              return 'content/content-entry';
            }

            if (id.includes('src/core/content-scripts/ContentScriptCore')) {
              // Core infrastructure only - split from features
              return 'content/content-core';
            }

            // Ultra-aggressive feature splitting - each major system in its own chunk
            if (id.includes('src/features/windows/managers/WindowsManager')) {
              return 'content/features/windows-manager';
            }

            if (id.includes('src/features/text-selection/core/SelectionManager')) {
              return 'content/features/selection-manager';
            }

            if (id.includes('src/features/element-selection/SelectElementManager')) {
              return 'content/features/element-selection-manager';
            }

            if (id.includes('src/features/text-field-interaction')) {
              return 'content/features/text-field-interaction';
            }

            if (id.includes('src/handlers/content/ContentMessageHandler')) {
              return 'content/features/message-handler';
            }

            if (id.includes('src/core/managers/content/FeatureManager')) {
              return 'content/features/feature-manager';
            }

            if (id.includes('src/core/content-scripts/chunks/lazy-vue-app')) {
              // Vue app - keep separate but optimize
              return 'content/content-vue';
            }

            if (id.includes('src/core/content-scripts/chunks/lazy-features')) {
              // Lazy loading utilities only
              return 'content/content-lazy-utils';
            }

            if (id.includes('src/core/content-scripts/legacy-handlers')) {
              // Legacy fallback handlers
              return 'content/content-legacy';
            }

            // Additional content script chunking - force separation of all large modules
            if (id.includes('src/apps/content/ContentApp')) {
              return 'content/apps/content-app-main';
            }

            if (id.includes('src/apps/content/')) {
              return 'content/apps/content-apps';
            }

            if (id.includes('src/components/content/TranslationWindow')) {
              return 'content/components/translation-window';
            }

            if (id.includes('src/components/content/')) {
              return 'content/components/content-components';
            }

            if (id.includes('@/apps/content/') || id.includes('@/components/content/')) {
              return 'content/content-ui';
            }

            // Vue apps and components - more granular splitting
            if (id.includes('src/components/shared/') || id.includes('src/apps/popup/')) {
              return 'content/vue-shared';
            }

            if (id.includes('src/apps/options/')) {
              return 'content/vue-options';
            }

            // Specific feature components
            if (id.includes('src/features/shortcuts/')) {
              return 'content/features/shortcuts';
            }

            if (id.includes('src/features/tts/')) {
              return 'content/features/tts';
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
        // Exclude core background providers (not used in UI contexts)
        'src/core/background/providers',
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
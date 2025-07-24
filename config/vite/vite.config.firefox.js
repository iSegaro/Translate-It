import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import webExtension from 'vite-plugin-web-extension'
import fs from 'fs-extra'
import { resolve } from 'path'
import { generateValidatedManifest } from '../manifest-generator.js'

const baseConfig = createBaseConfig('firefox')

// Firefox script polyfill stub (ESM) for service worker and content scripts
const polyfillPath = resolve(process.cwd(), 'public', 'browser-polyfill.esm.js')

// Merge with base config
export default defineConfig({
  ...baseConfig,
  
  // Firefox-specific build definitions
  define: {
    ...baseConfig.define,
    __BROWSER__: JSON.stringify('firefox'),
    __MANIFEST_VERSION__: 3
  },
  
  build: {
    ...baseConfig.build,
    outDir: 'dist/firefox'
  },
  
  plugins: [
    ...(baseConfig.plugins || []),
    
    webExtension({
      // Generate dynamic manifest for Firefox
      manifest: async () => {
        console.log('🦊 Generating Firefox manifest...');
        const manifest = generateValidatedManifest('firefox');
        console.log('✅ Firefox manifest generated and validated');
        return manifest;
      },
      
      // Firefox HTML config
      htmlViteConfig: {
        ...baseConfig,
        resolve: {
          ...baseConfig.resolve,
          alias: {
            ...baseConfig.resolve.alias,
            'webextension-polyfill': polyfillPath
          }
        }
      },
      
      // Firefox script config
      scriptViteConfig: {
        plugins: baseConfig.plugins,
        resolve: {
          ...baseConfig.resolve,
          alias: {
            ...baseConfig.resolve.alias,
            'webextension-polyfill': polyfillPath
          }
        },
        build: {
          ...baseConfig.build,
          outDir: 'dist/firefox',
          emptyOutDir: false,
          rollupOptions: {
            external: [/^browser-polyfill\.js$/],
            output: { format: 'es' }
          }
        }
      },
      
      // Copy additional resources for Firefox
      transformManifest: async (manifest) => {
        const outDir = 'dist/firefox'
        await fs.ensureDir(outDir)
        
        // Write manifest to disk
        const manifestFile = resolve(outDir, 'manifest.json')
        await fs.writeJson(manifestFile, manifest, { spaces: 2 })
        
        // Copy icons directory
        const iconsDir = resolve(process.cwd(), 'icons')
        if (await fs.pathExists(iconsDir)) {
          await fs.copy(iconsDir, resolve(outDir, 'icons'))
          console.log('📋 Copied icons for Firefox build');
        }
        
        // Copy localization files
        const localesDir = resolve(process.cwd(), '_locales')
        if (await fs.pathExists(localesDir)) {
          await fs.copy(localesDir, resolve(outDir, '_locales'))
          console.log('🌐 Copied localization files for Firefox build');
        }
        
        // Copy browser polyfill
        const polyfillSrc = resolve(process.cwd(), 'public', 'browser-polyfill.js')
        if (await fs.pathExists(polyfillSrc)) {
          await fs.copy(polyfillSrc, resolve(outDir, 'browser-polyfill.js'))
          console.log('🔗 Copied browser polyfill for Firefox build');
        }
        
        console.log('✅ Firefox build resources copied successfully');
        return manifest;
      },
      // Disable automatic browser launch in dev mode to avoid connection errors
      disableAutoLaunch: true
    })
  ],
  server: {
    port: 3001,
    strictPort: true,
    hmr: {
      port: 3001,
    },
  },
})

import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import webExtension from 'vite-plugin-web-extension'
import fs from 'fs-extra'
import { resolve } from 'path'
import { generateValidatedManifest } from '../manifest-generator.js'

const baseConfig = createBaseConfig('chrome')

// Always point script polyfill to the ESM stub in public
const polyfillPath = resolve(process.cwd(), 'public', 'browser-polyfill.esm.js')

// Merge with base config (omit base rollupOptions for script build compatibility)
const { rollupOptions: _, ...baseBuild } = baseConfig.build
export default defineConfig({
  ...baseConfig,
  // Alias webextension-polyfill to ESM wrapper for UI and script builds
  resolve: {
    alias: {
      ...baseConfig.resolve.alias
    }
  },
  build: baseBuild,
  plugins: [
    ...(baseConfig.plugins || []),
    webExtension({
      // Generate dynamic manifest for Chrome
      manifest: async () => {
        console.log('🚀 Generating Chrome manifest...');
        const manifest = generateValidatedManifest('chrome');
        console.log('✅ Chrome manifest generated and validated');
        return manifest;
      },
      // Use base config for HTML entry builds, but alias polyfill to ESM UMD bundle in node_modules
      htmlViteConfig: {
        ...baseConfig,
        resolve: {
          ...baseConfig.resolve
        },
        build: {
          ...baseConfig.build,
          rollupOptions: {
            ...baseConfig.build?.rollupOptions,
            external: [/^browser-polyfill\.js$/]
          }
        }
      },
      scriptViteConfig: {
        plugins: baseConfig.plugins,
        resolve: {
          ...baseConfig.resolve
        },
        build: {
          // Use same outDir as HTML build; omit base rollupOptions to avoid inlineDynamicImports error
          ...baseBuild,
          emptyOutDir: false,
          outDir: baseBuild.outDir,
          rollupOptions: {
            output: { format: 'es' }
          }
        }
      },
      // Write generated manifest.json to disk for dev mode to enable extension auto-install
      transformManifest: async (manifest) => {
        const outDir = baseConfig.build?.outDir || 'dist/chrome'
        await fs.ensureDir(outDir)
        const file = resolve(outDir, 'manifest.json')
        await fs.writeJson(file, manifest, { spaces: 2 })
        if (process.env.NODE_ENV !== 'production') {
          const root = process.cwd()
          // Copy localization messages for dev mode
          const localesDir = resolve(root, '_locales')
          console.log('Copying locales...');
          if (await fs.pathExists(localesDir)) {
            await fs.copy(localesDir, resolve(outDir, '_locales'))
            console.log('Locales copied.');
          } else {
            console.log('Locales directory not found.');
          }
          // Copy browser-polyfill for service worker & content scripts
          const polyfillSrc = resolve(root, 'public', 'browser-polyfill.js')
          console.log('Copying browser-polyfill...');
          if (await fs.pathExists(polyfillSrc)) {
            await fs.copy(polyfillSrc, resolve(outDir, 'browser-polyfill.js'))
            console.log('Browser-polyfill copied.');
          } else {
            console.log('Browser-polyfill not found.');
          }
          // Copy icons directory for extension icons
          const iconsDir = resolve(root, 'icons')
          console.log('Copying icons...');
          if (await fs.pathExists(iconsDir)) {
            await fs.copy(iconsDir, resolve(outDir, 'icons'))
            console.log('Icons copied.');
          } else {
            console.log('Icons directory not found.');
          }
          // Copy generated CSS assets to extension root (e.g. for content scripts)
          const cssDir = resolve(outDir, 'css')
          console.log('Copying CSS assets...');
          if (await fs.pathExists(cssDir)) {
            for (const file of await fs.readdir(cssDir)) {
              if (file.endsWith('.css')) {
                await fs.copy(resolve(cssDir, file), resolve(outDir, file))
                console.log(`Copied CSS file: ${file}`);
              }
            }
            console.log('CSS assets copied.');
          } else {
            const rootCss = resolve(root, 'dist/translate-it.css')
            if (await fs.pathExists(rootCss)) {
              await fs.copy(rootCss, resolve(outDir, 'translate-it.css'))
              console.log('Copied root CSS file.');
            } else {
              console.log('CSS directory and root CSS file not found.');
            }
          }
        }
        return manifest
      },
      // Disable automatic browser launch in dev mode to avoid connection errors
      disableAutoLaunch: true
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
})

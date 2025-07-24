import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import webExtension from 'vite-plugin-web-extension'
const baseConfig = createBaseConfig('chrome')

// Merge with base config
export default defineConfig({
  ...baseConfig,
  plugins: [
    ...(baseConfig.plugins || []),
    webExtension({
      manifest: './public/manifest.js',
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
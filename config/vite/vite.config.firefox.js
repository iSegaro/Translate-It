import { defineConfig } from 'vite'
import { createBaseConfig } from './vite.config.base.js'
import { crx } from '@crxjs/vite-plugin'
import manifest from '../../src/manifest.firefox.json' with { type: 'json' }

// Merge with base config
export default defineConfig({
  ...createBaseConfig('firefox'),
  plugins: [
    ...(createBaseConfig('firefox').plugins || []),
    crx({ manifest }),
  ],
  server: {
    port: 3001,
    strictPort: true,
    hmr: {
      port: 3001,
    },
  },
})
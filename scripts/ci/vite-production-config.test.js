import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('production Vite configuration', () => {
  it('loads as native Node ESM with repository-rooted aliases and HTML inputs', () => {
    const configUrl = pathToFileURL(resolve(import.meta.dirname, '../../config/vite/vite.config.production.js')).href
    const { stderr, status, stdout } = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      `const { default: config } = await import(${JSON.stringify(configUrl)}); console.log(JSON.stringify({ alias: config.resolve.alias, input: config.build.rollupOptions.input }))`
    ], { encoding: 'utf8' })

    expect(status, stderr).toBe(0)
    const { alias, input } = JSON.parse(stdout)
    const root = resolve(import.meta.dirname, '../..')

    expect(alias).toEqual({
      '@': resolve(root, 'src'),
      '@components': resolve(root, 'src/components'),
      '@views': resolve(root, 'src/views'),
      '@store': resolve(root, 'src/store'),
      '@composables': resolve(root, 'src/composables'),
      '@utils': resolve(root, 'src/utils'),
      '@providers': resolve(root, 'src/providers'),
      '@assets': resolve(root, 'src/assets')
    })
    expect(input).toEqual({
      popup: resolve(root, 'popup.html'),
      sidepanel: resolve(root, 'sidepanel.html'),
      options: resolve(root, 'options.html')
    })
  })
})

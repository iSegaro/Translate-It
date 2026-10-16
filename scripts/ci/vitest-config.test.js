import { describe, expect, it } from 'vitest'
import { globSync } from 'glob'
import { resolve } from 'node:path'
import config from '../../vitest.config.js'

describe('Vitest configuration paths and discovery', () => {
  it('keeps configuration paths rooted at the repository and discovers both test groups', () => {
    const { test } = config
    const root = resolve(import.meta.dirname, '../..')

    expect(test.root).toBe(root)
    expect(test.setupFiles).toEqual([resolve(root, 'tests/setup.js')])
    expect(test.coverage.reportsDirectory).toBe(resolve(root, 'tests/coverage'))

    expect(test.alias).toEqual({
      '@': resolve(root, 'src'),
      '@components': resolve(root, 'src/components'),
      '@views': resolve(root, 'src/apps'),
      '@store': resolve(root, 'src/store'),
      '@composables': resolve(root, 'src/composables'),
      '@utils': resolve(root, 'src/utils'),
      '@providers': resolve(root, 'src/features/translation/providers'),
      '@assets': resolve(root, 'src/assets'),
      '@shared': resolve(root, 'src/shared'),
      '@features': resolve(root, 'src/features'),
      '@core': resolve(root, 'src/core'),
    })

    const discovered = test.include.flatMap(pattern => globSync(pattern, { cwd: test.root }))
    expect(discovered).toContain('src/core/helpers.test.js')
    expect(discovered).toContain('scripts/ci/vitest-config.test.js')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..')
const scssPath = resolve(here, 'PopupHeader.scss')

const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) {
      return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    }
    return null
  }
}]

/**
 * PopupHeader.scss is a plain SCSS import (not `<style scoped>`, not
 * CSS-Modules), so theme hooks must be ordinary selectors. This pins the
 * selector contract without asserting computed styles.
 */
describe('PopupHeader.scss dark contract', () => {
  it('uses plain theme hooks (no :global() passthrough)', () => {
    const source = readFileSync(scssPath, 'utf8')

    expect(source).not.toContain(':global(')
    expect(source).toContain('.theme-dark &')
  })

  it('compiles to reachable dark selectors carrying the contract', () => {
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    expect(css).not.toContain(':global(')
    expect(css).toContain('.theme-dark .ti-header-toolbar')
    expect(css).toContain('--ti-action-icon: #fff')
    expect(css).toContain('--ti-action-icon-hover: color-mix(in srgb, #fff 82%, var(--color-warning) 18%)')
    expect(css).toContain('--ti-action-hover-bg: #424242')
    expect(css).toContain('--ti-action-active-bg: #555555')
    expect(css).toContain('border-inline-start-color: rgba(255, 255, 255, 0.1)')
  })
})

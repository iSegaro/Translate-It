import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const scssPath = resolve(here, 'LiveDubbingControl.scss')

/* ── Feedback text logical alignment (RTL) ────────────────────────────
   Status/unavailable/error text carries `dir="auto"` in the template, so
   the styles must use logical `text-align: start` (never hardcoded
   left/right) for Persian/Arabic to align to the start edge. */

describe('LiveDubbingControl.scss feedback alignment', () => {
  const source = readFileSync(scssPath, 'utf8')

  it.each([
    '.ti-live-dubbing-control-status',
    '.ti-live-dubbing-control-unavailable',
    '.ti-live-dubbing-control-error',
  ])('%s uses logical text-align: start', (selector) => {
    const block = source.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{[^}]*\\}`))?.[0]
    expect(block).toBeTruthy()
    expect(block).toContain('text-align: start')
  })

  it('feedback blocks use no hardcoded left/right alignment', () => {
    const { css } = compile()
    for (const selector of [
      '.ti-live-dubbing-control-status',
      '.ti-live-dubbing-control-unavailable',
      '.ti-live-dubbing-control-error',
    ]) {
      const block = css.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{[^}]*\\}`))?.[0]
      expect(block).toBeTruthy()
      expect(block).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})

function compile() {
  return sass.compile(scssPath)
}

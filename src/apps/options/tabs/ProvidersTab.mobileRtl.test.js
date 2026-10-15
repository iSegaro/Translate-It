import { describe, expect, it } from 'vitest'
import * as sass from 'sass'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../../..')
const scssPath = resolve(here, 'ProvidersTab.scss')
const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    return null
  },
}]

const compiledCss = () => sass.compile(scssPath, { importers: scssImporters }).css

describe('ProvidersTab custom-list mobile drawer cascade', () => {
  it('wins the desktop drawer width and stacks picker/Add in mobile LTR and RTL', () => {
    const css = compiledCss()
    const mediaIndex = css.lastIndexOf('@media (max-width: 768px)')
    expect(mediaIndex).toBeGreaterThan(-1)
    const mobileCss = css.slice(mediaIndex)

    const desktopDrawer = css.match(/\.providers-tab \.custom-list-drawer\s*\{[^}]*\}/)?.[0]
    const desktopRtl = css.match(/\.providers-tab \.custom-list-drawer\.rtl\s*\{[^}]*\}/)?.[0]
    expect(desktopDrawer).toContain('width: 480px;')
    expect(desktopDrawer).toContain('max-width: 90vw;')
    expect(desktopRtl).toContain('left: 0;')
    expect(desktopRtl).not.toContain('width:')

    expect(mobileCss).toMatch(/\.providers-tab \.custom-list-drawer\s*\{\s*width:\s*100%;\s*max-width:\s*100%;\s*\}/)
    expect(mobileCss).toMatch(/\.providers-tab \.custom-list-add-row\s*\{\s*flex-direction:\s*column;\s*align-items:\s*stretch;/)
    expect(mobileCss).toMatch(/\.providers-tab \.custom-list-drawer\.rtl \.custom-list-add-row\s*\{\s*flex-direction:\s*column;/)
    expect(mobileCss).toMatch(/\.custom-list-add-row \.custom-list-add-btn\s*\{\s*width:\s*100%;/)

    // The mobile alignment selector exactly matches desktop LTR specificity;
    // later source order makes stretch win. Desktop RTL row-reverse has greater
    // specificity for direction, so verify its separate stronger override.
    const desktopRow = css.match(/\.providers-tab \.custom-list-add-row\s*\{[^}]*align-items:\s*center;[^}]*\}/)?.[0]
    const mobileRow = mobileCss.match(/\.providers-tab \.custom-list-add-row\s*\{[^}]*align-items:\s*stretch;[^}]*\}/)?.[0]
    const desktopRtlRule = css.match(/\.providers-tab\s+\.custom-list-drawer\.rtl\s+\.custom-list-add-row\s*\{\s*flex-direction:\s*row-reverse;/)?.[0]
    const mobileDrawerRule = mobileCss.match(/\.providers-tab \.custom-list-drawer\s*\{\s*width:\s*100%;\s*max-width:\s*100%;/)
    const mobileRtlRule = mobileCss.match(/\.providers-tab \.custom-list-drawer\.rtl \.custom-list-add-row\s*\{\s*flex-direction:\s*column;/)?.[0]
    expect(desktopRow).toBeTruthy()
    expect(mobileRow).toBeTruthy()
    expect(desktopRow.split('{')[0]).toBe(mobileRow.split('{')[0])
    expect(css.indexOf(mobileRow)).toBeGreaterThan(css.indexOf(desktopRow))
    expect(mobileDrawerRule).toBeTruthy()
    expect(mobileRtlRule).toBeTruthy()
    expect(desktopRtlRule).toBeTruthy()
    expect(css.indexOf(desktopRtlRule)).toBeLessThan(mediaIndex)
    expect(mobileCss.indexOf(mobileRtlRule)).toBeGreaterThan(mobileDrawerRule.index)
  })
})

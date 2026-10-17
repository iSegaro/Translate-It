import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguageDropdown from './LanguageDropdown.vue'

describe('LanguageDropdown', () => {
  it('marks beta in native option text and associates validation with the select', () => {
    const wrapper = mount(LanguageDropdown, {
      props: {
        id: 'TARGET_LANGUAGE',
        modelValue: 'zh-hans',
        type: 'target',
        betaLabel: 'Beta',
        error: 'Not supported',
        languages: [{ code: 'zh-hans', name: 'Chinese (Simplified)', isBeta: true }],
      },
    })
    expect(wrapper.get('option').text()).toBe('Chinese (Simplified) (Beta)')
    expect(wrapper.get('select').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('select').attributes('aria-describedby')).toBe('TARGET_LANGUAGE-error')
    expect(wrapper.get('#TARGET_LANGUAGE-error').text()).toBe('Not supported')
  })

  it('renders Source and Target with errors without extraneous-attribute warnings (LanguagesTab pattern)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const Parent = {
        components: { LanguageDropdown },
        template: `
          <LanguageDropdown id="SOURCE_LANGUAGE" model-value="en" type="source" beta-label="Beta" error="Source error" :languages="[{ code: 'en', name: 'English' }]" />
          <LanguageDropdown id="TARGET_LANGUAGE" model-value="fa" type="target" beta-label="Beta" error="Target error" :languages="[{ code: 'fa', name: 'Persian', isBeta: true }]" />
        `,
      }
      const wrapper = mount(Parent)
      expect(wrapper.findAll('select.language-dropdown')).toHaveLength(2)
      expect(wrapper.get('#SOURCE_LANGUAGE-error').text()).toBe('Source error')
      expect(wrapper.get('#TARGET_LANGUAGE-error').text()).toBe('Target error')
      const extraneous = warn.mock.calls.filter(args =>
        args.some(arg => typeof arg === 'string' && arg.includes('Extraneous'))
      )
      expect(extraneous).toEqual([])
    } finally {
      warn.mockRestore()
    }
  })

  it('LanguagesTab passes no class to either LanguageDropdown (regression guard)', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/options/tabs/LanguagesTab.vue'),
      'utf8'
    )
    const usages = source.split('<LanguageDropdown')
    // Both Source and Target instances must be present
    expect(usages.length).toBe(3)
    for (const chunk of usages.slice(1)) {
      const tag = chunk.slice(0, chunk.indexOf('/>'))
      expect(tag).not.toContain('class=')
    }
  })
})

import { describe, expect, it } from 'vitest'
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
})

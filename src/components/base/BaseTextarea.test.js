import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseTextarea from './BaseTextarea.vue'

describe('BaseTextarea password masking', () => {
  it('masks each line without changing line breaks and exposes visibility state accessibly', async () => {
    const wrapper = mount(BaseTextarea, {
      props: {
        modelValue: 'first-secret\nsecond',
        passwordMask: true,
        showLabel: 'Show key',
        hideLabel: 'Hide key',
        ariaLabel: 'API key'
      }
    })
    const field = wrapper.find('textarea')

    expect(field.element.value).toBe('••••••••••••\n••••••')
    expect(field.classes()).toContain('ti-textarea--password')
    expect(field.attributes('aria-label')).toBe('API key')
    const toggle = wrapper.find('.ti-textarea__toggle-visibility')
    expect(toggle.attributes('aria-label')).toBe('Show key')
    expect(toggle.attributes('aria-pressed')).toBe('false')

    await toggle.trigger('click')
    expect(field.element.value).toBe('first-secret\nsecond')
    expect(field.classes()).not.toContain('ti-textarea--password')
    expect(toggle.attributes('aria-label')).toBe('Hide key')
    expect(toggle.attributes('aria-pressed')).toBe('true')
  })

  it('inserts pasted multiline text at the selection while masked', async () => {
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'before-after', passwordMask: true }
    })
    const field = wrapper.find('textarea').element
    field.setSelectionRange(6, 12)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type) => type === 'text/plain' ? '-first-key\nsecond-key' : '' }
    })

    field.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['before-first-key\nsecond-key'])
    expect(wrapper.emitted('input')).toHaveLength(1)
  })
})

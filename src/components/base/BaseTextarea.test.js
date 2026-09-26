import { describe, expect, it, vi } from 'vitest'
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
    const cursorSpy = vi.spyOn(field, 'setSelectionRange')
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type) => type === 'text/plain' ? '-first-key\nsecond-key' : '' }
    })

    field.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([['before-first-key\nsecond-key']])
    expect(wrapper.emitted('input')).toHaveLength(1)
    expect(cursorSpy).toHaveBeenCalledWith(27, 27)
  })

  it('ignores masked paste without clipboardData and preserves the selection', async () => {
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'before-after', passwordMask: true }
    })
    const field = wrapper.find('textarea').element
    const initialDisplay = field.value
    field.setSelectionRange(6, 12)
    const event = new Event('paste', { bubbles: true, cancelable: true })

    field.dispatchEvent(event)
    if (!event.defaultPrevented) {
      field.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertFromPaste' }))
      field.value = 'before-after'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.props('modelValue')).toBe('before-after')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('input')).toBeUndefined()
    expect(field.value).toBe(initialDisplay)
  })

  it('emits nothing for masked paste without clipboardData at a collapsed cursor', async () => {
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'before-after', passwordMask: true }
    })
    const field = wrapper.find('textarea').element
    const initialDisplay = field.value
    field.setSelectionRange(6, 6)
    const event = new Event('paste', { bubbles: true, cancelable: true })

    field.dispatchEvent(event)
    if (!event.defaultPrevented) {
      field.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertFromPaste' }))
      field.value = 'before-after'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.props('modelValue')).toBe('before-after')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('input')).toBeUndefined()
    expect(field.value).toBe(initialDisplay)
  })

  it('leaves paste native when masked value is revealed', async () => {
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'before-after', passwordMask: true }
    })
    await wrapper.find('.ti-textarea__toggle-visibility').trigger('click')
    const field = wrapper.find('textarea').element
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '-key' }
    })

    field.dispatchEvent(event)
    if (!event.defaultPrevented) {
      field.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertFromPaste' }))
      field.value = 'before-key-after'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([['before-key-after']])
    expect(wrapper.emitted('input')).toHaveLength(1)
  })

  it('leaves paste native when unmasked', async () => {
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'before-after' }
    })
    const field = wrapper.find('textarea').element
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '-key' }
    })

    field.dispatchEvent(event)
    if (!event.defaultPrevented) {
      field.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertFromPaste' }))
      field.value = 'before-key-after'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([['before-key-after']])
    expect(wrapper.emitted('input')).toHaveLength(1)
  })
})

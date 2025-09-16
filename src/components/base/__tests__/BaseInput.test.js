import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import BaseInput from '../BaseInput.vue'

describe('BaseInput', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(BaseInput)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('.ti-input-wrapper').exists()).toBe(true)
  })

  it('renders label when provided', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Test Label' }
    })
    
    const label = wrapper.find('label')
    expect(label.exists()).toBe(true)
    expect(label.text()).toContain('Test Label')
  })

  it('shows required indicator when required', () => {
    const wrapper = mount(BaseInput, {
      props: { 
        label: 'Test Label',
        required: true 
      }
    })
    
    expect(wrapper.find('.ti-input__required').exists()).toBe(true)
    expect(wrapper.find('.ti-input__required').text()).toBe('*')
  })

  it('binds v-model correctly', async () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: 'initial value',
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e })
      }
    })
    
    expect(wrapper.find('input').element.value).toBe('initial value')
    
    await wrapper.find('input').setValue('new value')
    expect(wrapper.props('modelValue')).toBe('new value')
  })

  it('applies input type correctly', () => {
    const wrapper = mount(BaseInput, {
      props: { type: 'password' }
    })
    expect(wrapper.find('input').attributes('type')).toBe('password')
  })

  it('shows placeholder text', () => {
    const wrapper = mount(BaseInput, {
      props: { placeholder: 'Enter text here' }
    })
    
    expect(wrapper.find('input').attributes('placeholder')).toBe('Enter text here')
  })

  it('displays error message', () => {
    const wrapper = mount(BaseInput, {
      props: { error: 'This field is required' }
    })
    
    expect(wrapper.find('.ti-input__error').exists()).toBe(true)
    expect(wrapper.find('.ti-input__error').text()).toBe('This field is required')
  })

  it('displays hint message when no error', () => {
    const wrapper = mount(BaseInput, {
      props: { hint: 'Enter at least 3 characters' }
    })
    
    expect(wrapper.find('.ti-input__hint').exists()).toBe(true)
    expect(wrapper.find('.ti-input__hint').text()).toBe('Enter at least 3 characters')
  })

  it('prioritizes error over hint', () => {
    const wrapper = mount(BaseInput, {
      props: { 
        error: 'Error message',
        hint: 'Hint message'
      }
    })
    
    expect(wrapper.find('.ti-input__error').exists()).toBe(true)
    expect(wrapper.find('.hint-text').exists()).toBe(false)
  })

  it('applies disabled state correctly', () => {
    const wrapper = mount(BaseInput, {
      props: { disabled: true }
    })
    
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })

  it('applies readonly state correctly', () => {
    const wrapper = mount(BaseInput, {
      props: { readonly: true }
    })
    
    expect(wrapper.find('input').attributes('readonly')).toBeDefined()
  })

  it('emits focus and blur events', async () => {
    const wrapper = mount(BaseInput)
    
    await wrapper.find('input').trigger('focus')
    expect(wrapper.emitted('focus')).toBeTruthy()
    
    await wrapper.find('input').trigger('blur')
    expect(wrapper.emitted('blur')).toBeTruthy()
  })

  it('generates unique id for input and label association', () => {
    const wrapper1 = mount(BaseInput, {
      props: { label: 'Label 1' }
    })
    const wrapper2 = mount(BaseInput, {
      props: { label: 'Label 2' }
    })
    
    const input1Id = wrapper1.find('input').attributes('id')
    const input2Id = wrapper2.find('input').attributes('id')
    const label1For = wrapper1.find('label').attributes('for')
    const label2For = wrapper2.find('label').attributes('for')
    
    expect(input1Id).toBeDefined()
    expect(input2Id).toBeDefined()
    expect(input1Id).not.toBe(input2Id)
    expect(input1Id).toBe(label1For)
    expect(input2Id).toBe(label2For)
  })
})
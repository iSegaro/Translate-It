import { mount } from '@vue/test-utils'
import { describe, it, expect, afterEach } from 'vitest'
import BaseModal from '../BaseModal.vue'

describe('BaseModal', () => {
  let wrapper

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  it('renders modal when modelValue is true', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: true },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    // Modal should be rendered via teleport
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
  })

  it('does not render modal when modelValue is false', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: false },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('renders title when provided', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        title: 'Test Modal'
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    expect(wrapper.text()).toContain('Test Modal')
  })

  it('renders default slot content', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: true },
      slots: {
        default: '<div class="modal-content">Modal body content</div>'
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    expect(wrapper.text()).toContain('Modal body content')
  })

  it('renders footer slot when provided', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: true },
      slots: {
        footer: '<div class="modal-footer-content">Footer content</div>'
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    expect(wrapper.text()).toContain('Footer content')
  })

  it('applies size classes correctly', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        size: 'lg'
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    expect(wrapper.find('.size-lg').exists()).toBe(true)
  })

  it('applies fullscreen class when fullscreen prop is true', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        fullscreen: true
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    expect(wrapper.find('.fullscreen').exists()).toBe(true)
  })

  it('hides close button when closable is false', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        title: 'Test',
        closable: false
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    // Should not find close button when closable is false
    expect(wrapper.findAll('button').length).toBe(0)
  })

  it('does not close when modal container is clicked', async () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        closeOnOverlay: true
      },
      global: {
        stubs: {
          teleport: false
        }
      }
    })
    
    const container = wrapper.find('.modal-container')
    if (container.exists()) {
      await container.trigger('click')
      // Should not emit close event when clicking container
      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    }
  })
})
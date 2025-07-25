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
      attachTo: document.body
    })
    
    // Modal should be rendered via teleport
    expect(document.body.querySelector('.modal-overlay')).not.toBeNull()
  })

  it('does not render modal when modelValue is false', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: false },
      attachTo: document.body
    })
    
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })

  it('renders title when provided', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        title: 'Test Modal'
      },
      attachTo: document.body
    })
    
    expect(document.body.textContent).toContain('Test Modal')
  })

  it('renders default slot content', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: true },
      slots: {
        default: '<div class="modal-content">Modal body content</div>'
      },
      attachTo: document.body
    })
    
    expect(document.body.textContent).toContain('Modal body content')
  })

  it('renders footer slot when provided', () => {
    wrapper = mount(BaseModal, {
      props: { modelValue: true },
      slots: {
        footer: '<div class="modal-footer-content">Footer content</div>'
      },
      attachTo: document.body
    })
    
    expect(document.body.textContent).toContain('Footer content')
  })

  it('applies size classes correctly', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        size: 'lg'
      },
      attachTo: document.body
    })
    
    expect(document.body.querySelector('.size-lg')).not.toBeNull()
  })

  it('applies fullscreen class when fullscreen prop is true', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        fullscreen: true
      },
      attachTo: document.body
    })
    
    expect(document.body.querySelector('.fullscreen')).not.toBeNull()
  })

  it('hides close button when closable is false', () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        title: 'Test',
        closable: false
      },
      attachTo: document.body
    })
    
    // Should not find close button when closable is false
    expect(document.body.querySelector('.close-button')).toBeNull()
  })

  it('does not close when modal container is clicked', async () => {
    wrapper = mount(BaseModal, {
      props: { 
        modelValue: true,
        closeOnOverlay: true
      },
      attachTo: document.body
    })
    
    const container = document.body.querySelector('.modal-container')
    if (container) {
      await container.click() // Trigger click directly on the native DOM element
      // Should not emit close event when clicking container
      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    }
  })
})
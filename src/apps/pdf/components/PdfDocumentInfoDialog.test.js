import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfDocumentInfoDialog from './PdfDocumentInfoDialog.vue'

vi.mock('@/components/base/BaseModal.vue', () => ({
  default: {
    name: 'BaseModal',
    template: `
      <div v-if="modelValue" class="mock-base-modal">
        <div class="mock-modal-title">{{ title }}</div>
        <slot />
      </div>
    `,
    props: ['modelValue', 'title', 'size', 'closable', 'closeOnOverlay', 'closeOnEscape', 'fullscreen', 'scrollLock', 'mobileBehavior'],
    emits: ['update:modelValue', 'close', 'open'],
  },
}))

describe('PdfDocumentInfoDialog', () => {
  it('renders title and rows when open', () => {
    const wrapper = mount(PdfDocumentInfoDialog, {
      props: {
        modelValue: true,
        rows: [
          { label: 'File Name', value: 'test.pdf' },
          { label: 'Pages', value: '42' },
        ],
      },
    })

    expect(wrapper.find('.mock-modal-title').text()).toBe('PDF Information')
    expect(wrapper.findAll('.pdf-info-row')).toHaveLength(2)
    expect(wrapper.text()).toContain('test.pdf')
    expect(wrapper.text()).toContain('42')
  })

  it('renders nothing when closed', () => {
    const wrapper = mount(PdfDocumentInfoDialog, {
      props: {
        modelValue: false,
        rows: [],
      },
    })

    expect(wrapper.find('.mock-modal-title').exists()).toBe(false)
  })

  it('renders rows passed as props', () => {
    const wrapper = mount(PdfDocumentInfoDialog, {
      props: {
        modelValue: true,
        rows: [
          { label: 'File Name', value: 'test.pdf' },
          { label: 'Pages', value: '42' },
        ],
      },
    })

    expect(wrapper.findAll('.pdf-info-row')).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfDropzone from './PdfDropzone.vue'

describe('PdfDropzone', () => {
  it('renders the empty slot when no document is loaded', () => {
    const wrapper = mount(PdfDropzone, {
      props: {
        hasDocument: false,
        isDragOver: false
      },
      slots: {
        empty: '<div class="empty-state">Empty</div>',
        document: '<div class="document-state">Document</div>'
      }
    })

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.document-state').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('pdf-dropzone--document')
  })

  it('applies document-mode styling when a document is loaded', () => {
    const wrapper = mount(PdfDropzone, {
      props: {
        hasDocument: true,
        isDragOver: false
      },
      slots: {
        empty: '<div class="empty-state">Empty</div>',
        document: '<div class="document-state">Document</div>'
      }
    })

    expect(wrapper.find('.document-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    expect(wrapper.classes()).toContain('pdf-dropzone--document')
  })

  it('requests open pdf when empty dropzone is clicked', async () => {
    const wrapper = mount(PdfDropzone, {
      props: {
        hasDocument: false,
        isDragOver: false
      },
      slots: {
        empty: '<div class="empty-state">Empty</div>'
      }
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('request-open-pdf')).toHaveLength(1)
  })
})

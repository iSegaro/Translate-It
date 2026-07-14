import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfOcrConsentPrompt from './PdfOcrConsentPrompt.vue'

describe('PdfOcrConsentPrompt', () => {
  it('shows captured OCR batch size', () => {
    const wrapper = mount(PdfOcrConsentPrompt, {
      props: {
        visible: true,
        pageCount: 2
      }
    })

    expect(wrapper.text()).toContain('2 scanned pages are currently visible.')
    expect(wrapper.text()).toContain('OCR can extract selectable text from these pages. Run OCR?')
  })
})

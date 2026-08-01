import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfTranslatedBlock from './PdfTranslatedBlock.vue'

describe('PdfTranslatedBlock', () => {
  const defaultBlock = {
    id: 'block-1',
    text: 'Hello world',
    role: 'paragraph',
    pageNumber: 1
  }

  const defaultTranslationState = {
    status: 'idle',
    translatedText: '',
    error: null
  }

  it('renders original text when status is idle', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: { ...defaultTranslationState, status: 'idle' }
      }
    })

    expect(wrapper.text()).toContain('Hello world')
    expect(wrapper.classes()).toContain('pdf-translated-block--idle')
  })

  it('renders translated text when status is translated', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'translated',
          translatedText: 'Hola mundo'
        }
      }
    })

    expect(wrapper.text()).toContain('Hola mundo')
    expect(wrapper.classes()).toContain('pdf-translated-block--translated')
  })

  it('renders loading indicator when status is loading', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: { ...defaultTranslationState, status: 'loading' }
      }
    })

    expect(wrapper.text()).toContain('Translating...')
    expect(wrapper.classes()).toContain('pdf-translated-block--loading')
    expect(wrapper.find('.pdf-translated-block__spinner').exists()).toBe(true)
  })

  it('renders error message when status is error', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'error',
          error: 'Provider limit reached'
        }
      }
    })

    expect(wrapper.text()).toContain('Provider limit reached')
    expect(wrapper.classes()).toContain('pdf-translated-block--error')
  })

  it('renders default error message when error is null', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'error',
          error: null
        }
      }
    })

    expect(wrapper.text()).toContain('Translation failed')
  })

  it('applies role-based classes', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: { ...defaultBlock, role: 'heading' },
        translationState: defaultTranslationState
      }
    })

    expect(wrapper.classes()).toContain('pdf-translated-block--heading')
  })

  it('sets dir attribute for RTL translated text', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'translated',
          translatedText: 'مرحبا بالعالم'
        }
      }
    })

    expect(wrapper.attributes('dir')).toBe('rtl')
  })

  it('sets dir attribute for LTR translated text', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'translated',
          translatedText: 'Hello world'
        }
      }
    })

    expect(wrapper.attributes('dir')).toBe('ltr')
  })

  it('does not set dir when status is idle', () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: defaultTranslationState
      }
    })

    expect(wrapper.attributes('dir')).toBeUndefined()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfTranslatedBlock from './PdfTranslatedBlock.vue'

const presentPdfTranslationErrorMock = vi.hoisted(() => vi.fn(async (detail) => {
  if (detail.failureReason === 'cancelled') return { kind: 'silent' }
  if (['CONTEXT', 'EXTENSION_CONTEXT_INVALIDATED', 'TRANSLATION_CANCELLED'].includes(detail.errorDetails?.type)) return { kind: 'silent' }
  if (detail.errorDetails) return { kind: 'display', message: 'Localized block error' }
  if (detail.translationDomain) return { kind: 'display', message: 'Generic block error' }
  return { kind: 'legacy' }
}))

vi.mock('../presentation/PdfTranslationErrorPresenter.js', () => ({
  presentPdfTranslationError: presentPdfTranslationErrorMock,
}))

describe('PdfTranslatedBlock', () => {
  beforeEach(() => vi.clearAllMocks())

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

  it('renders generic safe message for string-only translation error', async () => {
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

    await vi.waitFor(() => expect(wrapper.text()).toContain('Generic block error'))
    expect(wrapper.text()).not.toContain('Provider limit reached')
    expect(wrapper.classes()).toContain('pdf-translated-block--error')
  })

  it('renders generic safe message for empty response without DTO', async () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'error',
          error: 'Empty translation result',
          failureReason: 'empty-response',
        }
      }
    })

    await vi.waitFor(() => expect(wrapper.find('.pdf-translated-block__error').text()).toBe('Generic block error'))
    expect(wrapper.text()).not.toContain('Empty translation result')
  })

  it('renders safe structured block error instead of raw provider text', async () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'error',
          error: 'raw provider response with model list',
          errorDetails: { message: 'raw diagnostic', type: 'MODEL_NOT_FOUND' },
        }
      }
    })

    await vi.waitFor(() => expect(wrapper.find('.pdf-translated-block__error').text()).toBe('Localized block error'))
    expect(wrapper.text()).not.toContain('raw provider response')
    expect(wrapper.text()).not.toContain('raw diagnostic')
  })

  it('uses block-owned errorDetails rather than summary-like data', async () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'error',
          error: 'block legacy error',
          errorDetails: { message: 'block diagnostic', type: 'API_KEY_INVALID' },
        }
      }
    })

    await vi.waitFor(() => expect(wrapper.find('.pdf-translated-block__error').text()).toBe('Localized block error'))
    expect(presentPdfTranslationErrorMock).toHaveBeenCalledWith(expect.objectContaining({
      error: 'block legacy error',
      errorDetails: { message: 'block diagnostic', type: 'API_KEY_INVALID' },
    }))
  })

  it('does not expose structured cancellation diagnostics', async () => {
    const wrapper = mount(PdfTranslatedBlock, {
      props: {
        block: defaultBlock,
        translationState: {
          ...defaultTranslationState,
          status: 'error',
          error: 'raw cancellation diagnostic',
          errorDetails: { message: 'raw cancellation diagnostic', type: 'TRANSLATION_CANCELLED' },
        }
      }
    })

    await vi.waitFor(() => expect(wrapper.find('.pdf-translated-block__error').text()).toBe(''))
    expect(wrapper.text()).not.toContain('raw cancellation diagnostic')
  })

  it('renders generic error message when error is null', async () => {
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

    await vi.waitFor(() => expect(wrapper.text()).toContain('Generic block error'))
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

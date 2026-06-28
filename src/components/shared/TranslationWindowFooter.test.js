import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TranslationWindowFooter from './TranslationWindowFooter.vue'

describe('TranslationWindowFooter', () => {
  it('renders the target language label', () => {
    const wrapper = mount(TranslationWindowFooter, {
      props: {
        targetLanguageLabel: 'Persian (Farsi)',
        showTargetLanguage: true,
        showRetry: false,
        theme: 'dark'
      }
    })

    const label = wrapper.get('[data-testid="translation-window-footer-target-language"]')
    expect(label.text()).toBe('Persian (Farsi)')
  })

  it('hides when there is no target language and retry is disabled', () => {
    const wrapper = mount(TranslationWindowFooter, {
      props: {
        targetLanguageLabel: '',
        showTargetLanguage: true,
        showRetry: false,
        theme: 'dark'
      }
    })

    expect(wrapper.find('[data-testid="translation-window-footer"]').exists()).toBe(false)
  })

  it('renders an icon-only retry button and emits retry', async () => {
    const wrapper = mount(TranslationWindowFooter, {
      props: {
        targetLanguageLabel: 'Japanese',
        showTargetLanguage: true,
        showRetry: true,
        retryTitle: 'action_retry',
        retryAriaLabel: 'action_retry',
        theme: 'dark'
      }
    })

    const retryButton = wrapper.get('[data-testid="translation-window-footer-retry"]')
    expect(retryButton.text().trim()).toBe('')
    expect(retryButton.find('img.ti-footer-action-icon').exists()).toBe(true)

    await retryButton.trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[]])
  })
})

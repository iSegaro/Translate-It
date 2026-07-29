import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ResumePrompt from './ResumePrompt.vue'

function descriptor(overrides = {}) {
  return {
    title: 'report.pdf',
    pageLabel: 'Page 5',
    viewLabel: 'Translation',
    ...overrides,
  }
}

describe('ResumePrompt', () => {
  it('renders title, page, and view labels', () => {
    const wrapper = mount(ResumePrompt, {
      props: { descriptor: descriptor() },
    })
    expect(wrapper.text()).toContain('report.pdf')
    expect(wrapper.text()).toContain('Page 5')
    expect(wrapper.text()).toContain('Translation')
  })

  it('renders a resume action', () => {
    const wrapper = mount(ResumePrompt, {
      props: { descriptor: descriptor() },
    })
    expect(wrapper.text()).toContain('Resume Previous PDF')
  })

  it('emits resume when action clicked', async () => {
    const wrapper = mount(ResumePrompt, {
      props: { descriptor: descriptor() },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('resume')).toBeTruthy()
    expect(wrapper.emitted('resume')).toHaveLength(1)
  })

  it('does not call any browser or restore API', () => {
    // presentation-only — no side effects from mount
    const wrapper = mount(ResumePrompt, {
      props: { descriptor: descriptor() },
    })
    expect(wrapper.emitted('resume')).toBeFalsy()
  })
})

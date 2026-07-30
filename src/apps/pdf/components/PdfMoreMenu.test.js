import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfMoreMenu from './PdfMoreMenu.vue'

describe('PdfMoreMenu', () => {
  async function openMenu(wrapper) {
    await wrapper.find('.pdf-toolbar__button--menu-trigger').trigger('click')
  }

  it('renders the full menu with export items when canExport is true', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: {
        fileName: 'test.pdf',
        canExport: true,
        sourceLanguage: 'en',
        targetLanguage: 'fa'
      }
    })

    await openMenu(wrapper)

    const menu = wrapper.find('.pdf-toolbar__export-menu')
    expect(menu.text()).toContain('Open PDF')
    expect(menu.text()).toContain('PDF Information')
    expect(menu.text()).toContain('Export')
    expect(menu.text()).toContain('Settings')
    expect(menu.text()).not.toContain('Clear Cache')
    expect(menu.text()).toContain('Language: EN → FA')
  })

  it('shows Clear Cache inside the Developer section when debug mode is enabled', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: {
        fileName: 'test.pdf',
        canExport: true,
        isDebugMode: true
      }
    })

    await openMenu(wrapper)

    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Clear Cache')
  })

  it('hides Clear Cache when isDebugMode is false', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: { fileName: 'test.pdf', canExport: true, isDebugMode: false }
    })

    await openMenu(wrapper)

    expect(wrapper.find('.pdf-toolbar__export-menu').text()).not.toContain('Clear Cache')
  })

  it('hides Export section when canExport is false', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: { fileName: 'test.pdf', canExport: false }
    })

    await openMenu(wrapper)

    expect(wrapper.find('.pdf-toolbar__export-menu').text()).not.toContain('Export TXT')
  })

  it('shows Loading... when isLoading is true', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: { fileName: '', isLoading: true, canExport: true }
    })

    await openMenu(wrapper)

    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Loading...')
  })

  it('disables Open PDF button when loading', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: { fileName: 'test.pdf', isLoading: true, canExport: true }
    })

    await openMenu(wrapper)

    const openButton = wrapper.findAll('button').find(b => b.text().includes('Loading...'))
    expect(openButton.element.disabled).toBe(true)
  })

  it('disables PDF Information when no file', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: { fileName: '', canExport: true }
    })

    await openMenu(wrapper)

    const infoButton = wrapper.findAll('button').find(b => b.text().includes('PDF Information'))
    expect(infoButton.element.disabled).toBe(true)
  })

  it('emits request-open-pdf on click', async () => {
    const wrapper = mount(PdfMoreMenu, {
      props: { fileName: 'test.pdf', canExport: true }
    })

    await openMenu(wrapper)

    const openButton = wrapper.findAll('button').find(b => b.text().includes('Open PDF'))
    await openButton.trigger('click')

    expect(wrapper.emitted('request-open-pdf')).toBeTruthy()
  })
})

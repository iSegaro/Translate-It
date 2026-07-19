import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfNotificationBodyRenderer from './PdfNotificationBodyRenderer.vue'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'

describe('PdfNotificationBodyRenderer', () => {
  it('dispatches registered body types to their component', () => {
    const wrapper = mount(PdfNotificationBodyRenderer, {
      props: {
        body: {
          type: PDF_NOTIFICATION_BODY_TYPE.BENCHMARK_RESULTS,
          payload: { results: [] }
        }
      }
    })

    expect(wrapper.find('.pdf-benchmark-notification').exists()).toBe(true)
  })

  it('renders nothing for unknown body types', () => {
    const wrapper = mount(PdfNotificationBodyRenderer, {
      props: {
        body: { type: 'unknown', payload: {} }
      }
    })

    expect(wrapper.find('.pdf-benchmark-notification').exists()).toBe(false)
  })
})

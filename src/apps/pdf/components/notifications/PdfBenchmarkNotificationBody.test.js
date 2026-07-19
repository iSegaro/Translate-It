import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfBenchmarkNotificationBody from './PdfBenchmarkNotificationBody.vue'

describe('PdfBenchmarkNotificationBody', () => {
  it('renders benchmark comparison details and formatted evaluation metadata', () => {
    const wrapper = mount(PdfBenchmarkNotificationBody, {
      props: {
        payload: {
          analysis: {
            winnerCandidateId: 'scale-1.5-eng',
            winner: { candidateId: 'scale-1.5-eng', reason: 'lowest-cer' },
            confidence: { highest: 95, delta: 5, comparable: true },
            output: { comparable: true, identical: false }
          },
          results: [{
            candidateId: 'scale-1.5-eng',
            configuration: { scale: 1.5, language: 'eng' },
            runtime: { latencyMs: 39 },
            output: { status: 'recognized', data: { confidence: 95 } },
            evaluation: { cer: { characterErrorRate: 0.2 } }
          }],
          totalElapsedMs: 39
        }
      }
    })

    expect(wrapper.text()).toContain('Winner scale-1.5-eng (Lowest CER)')
    expect(wrapper.text()).toContain('Confidence 95 (+5)')
    expect(wrapper.text()).toContain('OCR Output Different')
    expect(wrapper.text()).toContain('Runtime 39ms')
    expect(wrapper.text()).toContain('CER 0.200 · differences')
    expect(wrapper.text()).toContain('Total 39ms')
  })
})

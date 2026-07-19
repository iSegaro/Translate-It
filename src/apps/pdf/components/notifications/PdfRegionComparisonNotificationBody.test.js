import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfRegionComparisonNotificationBody from './PdfRegionComparisonNotificationBody.vue'

describe('PdfRegionComparisonNotificationBody', () => {
  it('renders regionComparison comparison details and formatted evaluation metadata', () => {
    const wrapper = mount(PdfRegionComparisonNotificationBody, {
      props: {
        payload: {
          analysis: {
            winnerCandidateId: 'scale-1.5-eng',
            winner: { candidateId: 'scale-1.5-eng', reason: 'lowest-cer' },
            confidence: { highest: 95, delta: 5, comparable: true },
            output: { comparable: true, identical: false }
          },
          results: [
            {
              candidateId: 'scale-1-eng',
              configuration: { scale: 1, language: 'eng' },
              runtime: { latencyMs: 189 },
              output: { status: 'recognized', data: { confidence: 69 } }
            },
            {
              candidateId: 'scale-1.5-eng',
              configuration: { scale: 1.5, language: 'eng' },
              runtime: { latencyMs: 39 },
              output: { status: 'recognized', data: { confidence: 95 } },
              evaluation: { cer: { characterErrorRate: 0.2 } }
            }
          ],
          totalElapsedMs: 39
        }
      }
    })

    expect(wrapper.text()).toContain('Winner scale-1.5-eng (Lowest CER)')
    expect(wrapper.text()).toContain('Confidence 95 (+5)')
    expect(wrapper.text()).toContain('OCR Output Different')
    expect(wrapper.findAll('th').map(header => header.text())).toEqual(['Candidate', 'Scale', 'Lang', 'Runtime', 'Confidence', 'CER', 'Result'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('189ms')
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('69')
    expect(wrapper.findAll('tbody tr')[1].text()).toContain('39ms')
    expect(wrapper.findAll('tbody tr')[1].text()).toContain('0.200')
    expect(wrapper.findAll('tbody tr')[1].text()).toContain('Winner')
    expect(wrapper.text()).toContain('Total 39ms')
  })
})

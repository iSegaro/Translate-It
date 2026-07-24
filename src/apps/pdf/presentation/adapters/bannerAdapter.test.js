import { describe, expect, it } from 'vitest'

import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'
import { createBannerAdapter } from './bannerAdapter.js'

describe('Banner Adapter', () => {
  describe('outcome intent with notification', () => {
    it('builds comparison notification body from comparison data', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        notification: {
          id: 'dev-notif:1',
          variant: 'success',
          title: 'Region Comparison complete',
          message: 'Winner: scale-1.5. Fastest: 342ms.'
        },
        comparison: {
          analysis: {},
          results: [],
          totalElapsedMs: 100
        }
      })

      const state = adapter.getState()

      expect(state.developerNotification).toBeTruthy()
      expect(state.developerNotification.id).toBe('dev-notif:1')
      expect(state.developerNotification.variant).toBe('success')
      expect(state.developerNotification.title).toBe('Region Comparison complete')
      expect(state.developerNotification.message).toBe('Winner: scale-1.5. Fastest: 342ms.')
      expect(state.developerNotification.body).toMatchObject({
        type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS,
        payload: { footer: 'Total 100ms' }
      })
    })

    it('sets developerNotification with error variant', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        notification: {
          id: 'dev-notif:2',
          variant: 'error',
          title: 'Region Comparison failed',
          message: 'All candidates rejected'
        }
      })

      const state = adapter.getState()

      expect(state.developerNotification.variant).toBe('error')
      expect(state.developerNotification.message).toBe('All candidates rejected')
    })
  })

  describe('outcome intent with partialTranslation', () => {
    it('sets translationStatus and occurrenceId', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        partialTranslation: { occurrenceId: 42 }
      })

      const state = adapter.getState()

      expect(state.translationStatus).toBe('partial')
      expect(state.translationOccurrenceId).toBe(42)
    })
  })

  describe('non-outcome intent', () => {
    it('ignores non-outcome results', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({ intent: 'acknowledgement' })
      adapter.dispatch({ intent: 'activity' })

      const state = adapter.getState()
      expect(state.version).toBe(0)
    })
  })

  describe('null/undefined', () => {
    it('ignores null', () => {
      const adapter = createBannerAdapter()
      const initial = adapter.getState()

      adapter.dispatch(null)

      expect(adapter.getState().version).toBe(initial.version)
    })
  })

  describe('accumulated state', () => {
    it('preserves both translation and notification state', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        partialTranslation: { occurrenceId: 1 }
      })
      adapter.dispatch({
        intent: 'outcome',
        notification: {
          id: 'dev-notif:3',
          variant: 'success',
          title: 'Region Comparison complete',
          message: 'Region Comparison completed.'
        }
      })

      const state = adapter.getState()

      expect(state.translationStatus).toBe('partial')
      expect(state.translationOccurrenceId).toBe(1)
      expect(state.developerNotification).toBeTruthy()
      expect(state.developerNotification.id).toBe('dev-notif:3')
    })
  })

  describe('reset', () => {
    it('restores initial state and increments version', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        partialTranslation: { occurrenceId: 1 }
      })
      const versionBefore = adapter.getState().version

      adapter.reset()

      const state = adapter.getState()

      expect(state.developerNotification).toBeNull()
      expect(state.translationStatus).toBe('idle')
      expect(state.translationOccurrenceId).toBe(0)
      expect(state.version).toBeGreaterThan(versionBefore)
    })

    it('does not increment version when already initial', () => {
      const adapter = createBannerAdapter()
      const v0 = adapter.getState().version

      adapter.reset()

      expect(adapter.getState().version).toBe(v0)
    })
  })

  describe('version', () => {
    it('increments on successful mutation', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        partialTranslation: { occurrenceId: 1 }
      })
      const v1 = adapter.getState().version
      expect(v1).toBeGreaterThan(0)

      adapter.dispatch({
        intent: 'outcome',
        notification: { id: '1', variant: 'success', title: 'T', message: 'M' }
      })
      expect(adapter.getState().version).toBeGreaterThan(v1)
    })

    it('does not increment on identical notification dispatch', () => {
      const adapter = createBannerAdapter()

      const notif = { id: '1', variant: 'success', title: 'T', message: 'M' }
      adapter.dispatch({ intent: 'outcome', notification: notif })
      const v1 = adapter.getState().version

      adapter.dispatch({ intent: 'outcome', notification: notif })

      expect(adapter.getState().version).toBe(v1)
    })

    it('does not increment on equivalent partial translation dispatch', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        intent: 'outcome',
        partialTranslation: { occurrenceId: 42 }
      })
      const v1 = adapter.getState().version

      adapter.dispatch({
        intent: 'outcome',
        partialTranslation: { occurrenceId: 42 }
      })

      expect(adapter.getState().version).toBe(v1)
    })
  })

  describe('getState', () => {
    it('returns frozen object', () => {
      const adapter = createBannerAdapter()
      expect(Object.isFrozen(adapter.getState())).toBe(true)
    })

    it('returns new reference on each call', () => {
      const adapter = createBannerAdapter()
      expect(adapter.getState()).not.toBe(adapter.getState())
    })
  })

  describe('initial state', () => {
    it('returns initial values', () => {
      const adapter = createBannerAdapter()
      const state = adapter.getState()

      expect(state.version).toBe(0)
      expect(state.developerNotification).toBeNull()
      expect(state.translationStatus).toBe('idle')
      expect(state.translationOccurrenceId).toBe(0)
    })
  })

  it('returns frozen adapter', () => {
    expect(Object.isFrozen(createBannerAdapter())).toBe(true)
  })
})

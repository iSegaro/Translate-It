import { describe, expect, it } from 'vitest'

import { COMPARISON_RESULTS, TRANSLATION_RESULTS } from '../operationResults.js'
import { createBannerAdapter } from './bannerAdapter.js'

describe('Banner Adapter', () => {
  describe('comparison-completed', () => {
    it('sets developerNotification with winner and timing details', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:1',
        summary: {
          winner: { candidateId: 'scale-1.5' },
          latency: { fastestMs: 342 }
        },
        result: {
          results: [],
          summary: { totalElapsedMs: 1200 }
        }
      })

      const state = adapter.getState()

      expect(state.developerNotification).toBeTruthy()
      expect(state.developerNotification.id).toBe('dev-notif:1')
      expect(state.developerNotification.variant).toBe('success')
      expect(state.developerNotification.title).toBe('Region Comparison complete')
      expect(state.developerNotification.message).toBe('Winner: scale-1.5. Fastest: 342ms.')
    })

    it('falls back message when no winner or timing details', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:2',
        summary: {},
        result: {
          results: [],
          summary: { totalElapsedMs: 1200 }
        }
      })

      const state = adapter.getState()

      expect(state.developerNotification.message).toBe('Region Comparison completed.')
    })

    it('includes notification body with payload', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:3',
        summary: {
          winner: { candidateId: 'scale-1' }
        },
        result: {
          results: [],
          summary: { totalElapsedMs: 500 }
        }
      })

      const { payload } = adapter.getState().developerNotification.body

      expect(payload).toBeTruthy()
      expect(payload.columns).toBeTruthy()
      expect(payload.rows).toBeTruthy()
      expect(payload.footer).toBe('Total 500ms')
    })
  })

  describe('comparison-failed', () => {
    it('sets developerNotification with error message', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        type: COMPARISON_RESULTS.FAILED,
        id: 'dev-notif:4',
        error: 'All candidates rejected'
      })

      const state = adapter.getState()

      expect(state.developerNotification).toBeTruthy()
      expect(state.developerNotification.id).toBe('dev-notif:4')
      expect(state.developerNotification.variant).toBe('error')
      expect(state.developerNotification.title).toBe('Region Comparison failed')
      expect(state.developerNotification.message).toBe('All candidates rejected')
    })

    it('falls back message when no error provided', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        type: COMPARISON_RESULTS.FAILED,
        id: 'dev-notif:5'
      })

      const state = adapter.getState()

      expect(state.developerNotification.message).toBe('Region Comparison failed. Please try again.')
    })
  })

  describe('translation-partial', () => {
    it('sets translationStatus and occurrenceId', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({
        type: TRANSLATION_RESULTS.PARTIAL,
        occurrenceId: 42
      })

      const state = adapter.getState()

      expect(state.translationStatus).toBe('partial')
      expect(state.translationOccurrenceId).toBe(42)
    })
  })

  describe('accumulated state', () => {
    it('preserves both translation and comparison state', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({ type: TRANSLATION_RESULTS.PARTIAL, occurrenceId: 1 })
      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:6',
        summary: { winner: { candidateId: 'scale-1' } },
        result: { results: [], summary: { totalElapsedMs: 500 } }
      })

      const state = adapter.getState()

      expect(state.translationStatus).toBe('partial')
      expect(state.translationOccurrenceId).toBe(1)
      expect(state.developerNotification).toBeTruthy()
      expect(state.developerNotification.id).toBe('dev-notif:6')
    })
  })

  describe('reset', () => {
    it('restores initial state and increments version', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({ type: TRANSLATION_RESULTS.PARTIAL, occurrenceId: 1 })
      const versionBefore = adapter.getState().version

      adapter.reset()

      const state = adapter.getState()

      expect(state.developerNotification).toBeNull()
      expect(state.translationStatus).toBe('idle')
      expect(state.translationOccurrenceId).toBe(0)
      expect(state.version).toBeGreaterThan(versionBefore)
    })

    it('does not increment version when already in initial state', () => {
      const adapter = createBannerAdapter()
      const v0 = adapter.getState().version

      adapter.reset()

      expect(adapter.getState().version).toBe(v0)
    })
  })

  describe('unknown result', () => {
    it('does not change state for unknown type', () => {
      const adapter = createBannerAdapter()
      const initial = adapter.getState()

      adapter.dispatch({ type: 'nonexistent-type' })

      const state = adapter.getState()
      expect(state.version).toBe(initial.version)
      expect(state.developerNotification).toBe(initial.developerNotification)
      expect(state.translationStatus).toBe(initial.translationStatus)
    })
  })

  describe('null result', () => {
    it('does not change state', () => {
      const adapter = createBannerAdapter()
      const initial = adapter.getState()

      adapter.dispatch(null)

      const state = adapter.getState()
      expect(state.version).toBe(initial.version)
    })
  })

  describe('version', () => {
    it('increments on successful mutation', () => {
      const adapter = createBannerAdapter()
      const v0 = adapter.getState().version

      adapter.dispatch({ type: TRANSLATION_RESULTS.PARTIAL, occurrenceId: 1 })
      const v1 = adapter.getState().version
      expect(v1).toBeGreaterThan(v0)

      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:7',
        summary: {},
        result: { results: [], summary: { totalElapsedMs: 500 } }
      })
      const v2 = adapter.getState().version
      expect(v2).toBeGreaterThan(v1)
    })

    it('does not increment on no-op dispatch', () => {
      const adapter = createBannerAdapter()
      const v0 = adapter.getState().version

      adapter.dispatch({ type: 'nonexistent-type' })

      expect(adapter.getState().version).toBe(v0)
    })

    it('does not increment on equivalent translation dispatch', () => {
      const adapter = createBannerAdapter()

      adapter.dispatch({ type: TRANSLATION_RESULTS.PARTIAL, occurrenceId: 42 })
      const v1 = adapter.getState().version

      adapter.dispatch({ type: TRANSLATION_RESULTS.PARTIAL, occurrenceId: 42 })

      expect(adapter.getState().version).toBe(v1)
    })

    it('does not increment on equivalent comparison dispatch', () => {
      const adapter = createBannerAdapter()

      const result = {
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:8',
        summary: { winner: { candidateId: 'scale-1' } }
      }

      adapter.dispatch(result)
      const v1 = adapter.getState().version

      adapter.dispatch(result)

      expect(adapter.getState().version).toBe(v1)
    })

    it('increments when notification body changes even if other fields identical', () => {
      const adapter = createBannerAdapter()

      const summary = { winner: { candidateId: 'scale-1' }, latency: { fastestMs: 100 } }

      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:9',
        summary,
        result: { results: [{ candidateId: 'a' }], summary: { totalElapsedMs: 500 } }
      })
      const state1 = adapter.getState()
      const v1 = state1.version

      adapter.dispatch({
        type: COMPARISON_RESULTS.COMPLETED,
        id: 'dev-notif:9',
        summary,
        result: { results: [{ candidateId: 'b' }], summary: { totalElapsedMs: 500 } }
      })

      const state2 = adapter.getState()
      expect(state2.version).toBeGreaterThan(v1)
      expect(state2.developerNotification.id).toBe('dev-notif:9')
      expect(state2.developerNotification.variant).toBe('success')
      expect(state2.developerNotification.title).toBe('Region Comparison complete')
      expect(state2.developerNotification.message).toBe(state1.developerNotification.message)
      expect(state2.developerNotification.body).not.toBe(state1.developerNotification.body)
    })
  })

  describe('getState', () => {
    it('returns frozen object', () => {
      const adapter = createBannerAdapter()
      const state = adapter.getState()

      expect(Object.isFrozen(state)).toBe(true)
    })

    it('returns new reference on each call', () => {
      const adapter = createBannerAdapter()

      const a = adapter.getState()
      const b = adapter.getState()

      expect(a).not.toBe(b)
    })

    it('returns new reference even when state unchanged', () => {
      const adapter = createBannerAdapter()

      const a = adapter.getState()
      const b = adapter.getState()

      expect(a).not.toBe(b)
      expect(a.version).toBe(b.version)
    })
  })

  describe('initial state', () => {
    it('returns initial values before any dispatch', () => {
      const adapter = createBannerAdapter()
      const state = adapter.getState()

      expect(state.version).toBe(0)
      expect(state.developerNotification).toBeNull()
      expect(state.translationStatus).toBe('idle')
      expect(state.translationOccurrenceId).toBe(0)
    })
  })

  it('returns frozen adapter', () => {
    const adapter = createBannerAdapter()
    expect(Object.isFrozen(adapter)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { createProgressAdapter } from './progressAdapter.js'

describe('Progress Adapter', () => {
  describe('factory', () => {
    it('returns initial state', () => {
      const adapter = createProgressAdapter()
      const { version, operation } = adapter.getState()

      expect(version).toBe(0)
      expect(operation.title).toBe('')
      expect(operation.running).toBe(false)
      expect(operation.indeterminate).toBe(true)
      expect(operation.progress).toBeNull()
      expect(operation.cancellable).toBe(false)
    })

    it('returns frozen adapter', () => {
      const adapter = createProgressAdapter()
      expect(Object.isFrozen(adapter)).toBe(true)
    })
  })

  describe('dispatch', () => {
    it('sets running state with title and cancellable', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Translating visible pages',
        indeterminate: true,
        progress: null,
        cancellable: true
      })

      const { version, operation } = adapter.getState()

      expect(version).toBe(1)
      expect(operation.running).toBe(true)
      expect(operation.title).toBe('Translating visible pages')
      expect(operation.indeterminate).toBe(true)
      expect(operation.progress).toBeNull()
      expect(operation.cancellable).toBe(true)
    })

    it('updates progress value', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'OCR: Processing pages',
        indeterminate: false,
        progress: 45,
        cancellable: true
      })

      const { operation } = adapter.getState()

      expect(operation.progress).toBe(45)
      expect(operation.indeterminate).toBe(false)
    })

    it('replaces entire snapshot — no merge', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Translating visible pages',
        indeterminate: true,
        progress: null,
        cancellable: true
      })

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'OCR: Processing pages',
        indeterminate: false,
        progress: 60,
        cancellable: false
      })

      const { operation } = adapter.getState()

      expect(operation.title).toBe('OCR: Processing pages')
      expect(operation.indeterminate).toBe(false)
      expect(operation.progress).toBe(60)
      expect(operation.cancellable).toBe(false)
    })

    it('returns to idle on completion dispatch', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Scanning region...',
        indeterminate: true,
        progress: null,
        cancellable: true
      })

      adapter.dispatch({
        type: 'progress-update',
        running: false,
        title: '',
        indeterminate: true,
        progress: null,
        cancellable: false
      })

      const { operation } = adapter.getState()

      expect(operation.running).toBe(false)
      expect(operation.title).toBe('')
      expect(operation.progress).toBeNull()
    })
  })

  describe('version', () => {
    it('increments on state change', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Running',
        indeterminate: true,
        progress: null,
        cancellable: false
      })

      const v1 = adapter.getState().version
      expect(v1).toBe(1)

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Running',
        indeterminate: false,
        progress: 50,
        cancellable: false
      })

      expect(adapter.getState().version).toBeGreaterThan(v1)
    })

    it('does not increment on identical dispatch', () => {
      const adapter = createProgressAdapter()

      const result = {
        type: 'progress-update',
        running: true,
        title: 'Translating visible pages',
        indeterminate: true,
        progress: null,
        cancellable: true
      }

      adapter.dispatch(result)
      const v1 = adapter.getState().version

      adapter.dispatch(result)

      expect(adapter.getState().version).toBe(v1)
    })
  })

  describe('equality — each field individually', () => {
    it('version increments when title changes', () => {
      const adapter = createProgressAdapter()
      const base = { type: 'progress-update', running: true, title: 'A', indeterminate: true, progress: null, cancellable: false }
      adapter.dispatch(base)
      const v1 = adapter.getState().version

      adapter.dispatch({ ...base, title: 'B' })

      expect(adapter.getState().version).toBeGreaterThan(v1)
    })

    it('version increments when running changes', () => {
      const adapter = createProgressAdapter()
      const base = { type: 'progress-update', running: true, title: 'X', indeterminate: true, progress: null, cancellable: false }
      adapter.dispatch(base)
      const v1 = adapter.getState().version

      adapter.dispatch({ ...base, running: false })

      expect(adapter.getState().version).toBeGreaterThan(v1)
    })

    it('version increments when indeterminate changes', () => {
      const adapter = createProgressAdapter()
      const base = { type: 'progress-update', running: true, title: 'X', indeterminate: true, progress: null, cancellable: false }
      adapter.dispatch(base)
      const v1 = adapter.getState().version

      adapter.dispatch({ ...base, indeterminate: false })

      expect(adapter.getState().version).toBeGreaterThan(v1)
    })

    it('version increments when progress changes', () => {
      const adapter = createProgressAdapter()
      const base = { type: 'progress-update', running: true, title: 'X', indeterminate: true, progress: null, cancellable: false }
      adapter.dispatch(base)
      const v1 = adapter.getState().version

      adapter.dispatch({ ...base, progress: 42 })

      expect(adapter.getState().version).toBeGreaterThan(v1)
    })

    it('version increments when cancellable changes', () => {
      const adapter = createProgressAdapter()
      const base = { type: 'progress-update', running: true, title: 'X', indeterminate: true, progress: null, cancellable: false }
      adapter.dispatch(base)
      const v1 = adapter.getState().version

      adapter.dispatch({ ...base, cancellable: true })

      expect(adapter.getState().version).toBeGreaterThan(v1)
    })
  })

  describe('null/undefined result', () => {
    it('ignores null result', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch(null)

      expect(adapter.getState().version).toBe(0)
    })

    it('ignores undefined result', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch(undefined)

      expect(adapter.getState().version).toBe(0)
    })
  })

  describe('reset', () => {
    it('restores initial state and increments version', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Running',
        indeterminate: true,
        progress: null,
        cancellable: true
      })

      const v1 = adapter.getState().version
      adapter.reset()

      const { version, operation } = adapter.getState()

      expect(version).toBeGreaterThan(v1)
      expect(operation.running).toBe(false)
      expect(operation.title).toBe('')
      expect(operation.indeterminate).toBe(true)
      expect(operation.progress).toBeNull()
      expect(operation.cancellable).toBe(false)
    })

    it('does not increment version when already initial', () => {
      const adapter = createProgressAdapter()
      const v0 = adapter.getState().version

      adapter.reset()

      expect(adapter.getState().version).toBe(v0)
    })
  })

  describe('getState', () => {
    it('returns frozen root object', () => {
      const adapter = createProgressAdapter()
      expect(Object.isFrozen(adapter.getState())).toBe(true)
    })

    it('returns frozen operation object', () => {
      const adapter = createProgressAdapter()
      expect(Object.isFrozen(adapter.getState().operation)).toBe(true)
    })

    it('returns new reference on each call', () => {
      const adapter = createProgressAdapter()

      const a = adapter.getState()
      const b = adapter.getState()

      expect(a).not.toBe(b)
      expect(a.operation).not.toBe(b.operation)
    })

    it('does not leak mutable references', () => {
      const adapter = createProgressAdapter()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'Before',
        indeterminate: true,
        progress: null,
        cancellable: false
      })

      const snapshot = adapter.getState()

      adapter.dispatch({
        type: 'progress-update',
        running: true,
        title: 'After',
        indeterminate: true,
        progress: null,
        cancellable: false
      })

      expect(snapshot.operation.title).toBe('Before')
    })
  })
})

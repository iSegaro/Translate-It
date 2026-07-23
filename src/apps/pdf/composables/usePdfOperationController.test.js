import { describe, expect, it, vi } from 'vitest'
import { usePdfOperationController } from './usePdfOperationController.js'

describe('usePdfOperationController', () => {
  it('starts with idle operation state', () => {
    const { operation } = usePdfOperationController()

    expect(operation.running).toBe(false)
    expect(operation.indeterminate).toBe(true)
    expect(operation.progress).toBe(null)
    expect(operation.cancellable).toBe(false)
    expect(operation.title).toBe('')
    expect(operation.onCancel).toBe(null)
  })

  it('startOperation sets running state with title and returns handle', () => {
    const { operation, startOperation } = usePdfOperationController()

    const handle = startOperation({ title: 'Translating...' })

    expect(operation.running).toBe(true)
    expect(operation.title).toBe('Translating...')
    expect(operation.indeterminate).toBe(true)
    expect(handle).toBeDefined()
    expect(typeof handle.updateProgress).toBe('function')
    expect(typeof handle.finish).toBe('function')
  })

  it('startOperation sets determinate progress', () => {
    const { operation, startOperation } = usePdfOperationController()

    startOperation({ title: 'OCR', indeterminate: false, progress: 0 })

    expect(operation.indeterminate).toBe(false)
    expect(operation.progress).toBe(0)
  })

  it('startOperation sets cancellable with callback', () => {
    const { operation, startOperation } = usePdfOperationController()

    startOperation({ title: 'Export', cancellable: true, onCancel: vi.fn() })

    expect(operation.cancellable).toBe(true)
  })

  it('handle.updateProgress updates progress and makes operation determinate', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handle = startOperation({ title: 'OCR', indeterminate: true })

    handle.updateProgress({ progress: 50 })

    expect(operation.progress).toBe(50)
    expect(operation.indeterminate).toBe(false)
  })

  it('handle.updateProgress clamps progress to [0, 100]', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handle = startOperation({ title: 'OCR' })

    handle.updateProgress({ progress: 150 })
    expect(operation.progress).toBe(100)

    handle.updateProgress({ progress: -10 })
    expect(operation.progress).toBe(0)
  })

  it('handle.updateProgress ignores non-numeric progress', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handle = startOperation({ title: 'OCR', indeterminate: true })

    handle.updateProgress({ progress: null })
    expect(operation.indeterminate).toBe(true)

    handle.updateProgress({ progress: 'abc' })
    expect(operation.indeterminate).toBe(true)
  })

  it('handle.finish sets running to false and resets state', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handle = startOperation({ title: 'Export' })

    handle.finish()

    expect(operation.running).toBe(false)
    expect(operation.title).toBe('')
    expect(operation.indeterminate).toBe(true)
    expect(operation.progress).toBe(null)
    expect(operation.cancellable).toBe(false)
    expect(operation.onCancel).toBe(null)
  })

  it('cancelOperation calls onCancel and finishes', () => {
    const onCancel = vi.fn()
    const { operation, startOperation, cancelOperation } = usePdfOperationController()
    startOperation({ title: 'OCR', cancellable: true, onCancel })

    cancelOperation()

    expect(onCancel).toHaveBeenCalled()
    expect(operation.running).toBe(false)
  })

  it('cancelOperation is safe without onCancel', () => {
    const { operation, startOperation, cancelOperation } = usePdfOperationController()
    startOperation({ title: 'Loading' })

    expect(() => cancelOperation()).not.toThrow()
    expect(operation.running).toBe(false)
  })

  it('cancelOperation with throwing onCancel still finishes', () => {
    const { operation, startOperation, cancelOperation } = usePdfOperationController()
    startOperation({
      title: 'OCR',
      cancellable: true,
      onCancel: () => { throw new Error('boom') }
    })

    expect(() => cancelOperation()).not.toThrow()
    expect(operation.running).toBe(false)
  })

  it('stale handle.updateProgress is a no-op after new operation starts', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handleA = startOperation({ title: 'A', indeterminate: true })

    startOperation({ title: 'B' })
    handleA.updateProgress({ progress: 50 })

    expect(operation.progress).toBe(null)
    expect(operation.indeterminate).toBe(true)
    expect(operation.title).toBe('B')
  })

  it('stale handle.finish is a no-op after new operation starts', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handleA = startOperation({ title: 'A' })

    startOperation({ title: 'B' })
    handleA.finish()

    expect(operation.running).toBe(true)
    expect(operation.title).toBe('B')
  })

  it('handle.finish from the active operation works', () => {
    const { operation, startOperation } = usePdfOperationController()
    const handle = startOperation({ title: 'OCR' })

    handle.finish()

    expect(operation.running).toBe(false)
  })
})

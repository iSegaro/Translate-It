import { describe, expect, it } from 'vitest'
import { usePdfOperationController } from './usePdfOperationController.js'

describe('usePdfOperationController', () => {
  it('starts with idle operation state', () => {
    const { operation } = usePdfOperationController()

    expect(operation.running).toBe(false)
    expect(operation.indeterminate).toBe(true)
    expect(operation.progress).toBe(null)
    expect(operation.cancellable).toBe(false)
    expect(operation.title).toBe('')
    expect(operation.id).toBe(null)
    expect(operation.onCancel).toBe(null)
  })

  it('startOperation sets running state with title', () => {
    const { operation, startOperation } = usePdfOperationController()

    startOperation({ title: 'Translating...' })

    expect(operation.running).toBe(true)
    expect(operation.title).toBe('Translating...')
    expect(operation.indeterminate).toBe(true)
  })

  it('startOperation sets determinate progress', () => {
    const { operation, startOperation } = usePdfOperationController()

    startOperation({ title: 'OCR', indeterminate: false, progress: 0 })

    expect(operation.indeterminate).toBe(false)
    expect(operation.progress).toBe(0)
  })

  it('startOperation sets cancellable with callback', () => {
    const onCancel = () => {}
    const { operation, startOperation } = usePdfOperationController()

    startOperation({ title: 'Export', cancellable: true, onCancel })

    expect(operation.cancellable).toBe(true)
    expect(operation.onCancel).toBe(onCancel)
  })

  it('updateProgress sets progress and makes operation determinate', () => {
    const { operation, startOperation, updateProgress } = usePdfOperationController()
    startOperation({ title: 'Translating...', indeterminate: true })

    updateProgress({ progress: 50 })

    expect(operation.progress).toBe(50)
    expect(operation.indeterminate).toBe(false)
  })

  it('updateProgress clamps progress to valid range', () => {
    const { operation, startOperation, updateProgress } = usePdfOperationController()
    startOperation({ title: 'OCR' })

    updateProgress({ progress: 100 })
    expect(operation.progress).toBe(100)

    updateProgress({ progress: 0 })
    expect(operation.progress).toBe(0)
  })

  it('updateProgress ignores non-numeric progress', () => {
    const { operation, startOperation, updateProgress } = usePdfOperationController()
    startOperation({ title: 'OCR', indeterminate: true })

    updateProgress({ progress: null })
    expect(operation.indeterminate).toBe(true)

    updateProgress({ progress: 'abc' })
    expect(operation.indeterminate).toBe(true)
  })

  it('finishOperation sets running to false', () => {
    const { operation, startOperation, finishOperation } = usePdfOperationController()
    startOperation({ title: 'Export' })

    finishOperation()

    expect(operation.running).toBe(false)
  })

  it('cancelOperation calls onCancel and sets running to false', () => {
    let called = false
    const { operation, startOperation, cancelOperation } = usePdfOperationController()
    startOperation({ title: 'OCR', cancellable: true, onCancel: () => { called = true } })

    cancelOperation()

    expect(called).toBe(true)
    expect(operation.running).toBe(false)
  })

  it('cancelOperation is safe without onCancel', () => {
    const { operation, startOperation, cancelOperation } = usePdfOperationController()
    startOperation({ title: 'Loading' })

    expect(() => cancelOperation()).not.toThrow()
    expect(operation.running).toBe(false)
  })

  it('startOperation overwrites previous operation', () => {
    const { operation, startOperation } = usePdfOperationController()

    startOperation({ id: 'first', title: 'First' })
    startOperation({ id: 'second', title: 'Second' })

    expect(operation.id).toBe('second')
    expect(operation.title).toBe('Second')
    expect(operation.running).toBe(true)
  })

  it('multiple operations share the same reactive state', () => {
    const controller = usePdfOperationController()
    const { operation, startOperation, finishOperation } = controller

    startOperation({ title: 'A' })
    expect(operation.running).toBe(true)
    finishOperation()
    expect(operation.running).toBe(false)
    startOperation({ title: 'B' })
    expect(operation.running).toBe(true)
  })
})

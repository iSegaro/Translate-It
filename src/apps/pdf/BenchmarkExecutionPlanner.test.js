import { describe, expect, it } from 'vitest'
import { BenchmarkExecutionPlanner } from './BenchmarkExecutionPlanner.js'

describe('BenchmarkExecutionPlanner', () => {
  it('returns an empty plan for empty providers', () => {
    expect(new BenchmarkExecutionPlanner().create([])).toEqual({ steps: [] })
  })

  it('preserves provider order in pending steps', () => {
    const plan = new BenchmarkExecutionPlanner().create([{ id: 'first' }, { id: 'second' }])

    expect(plan.steps).toEqual([
      { providerId: 'first', state: 'pending' },
      { providerId: 'second', state: 'pending' }
    ])
  })

  it('returns immutable plan and steps', () => {
    const plan = new BenchmarkExecutionPlanner().create([{ id: 'provider' }])

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.steps)).toBe(true)
    expect(Object.isFrozen(plan.steps[0])).toBe(true)
    expect(() => plan.steps.push({ providerId: 'another-provider', state: 'pending' })).toThrow()
    expect(() => { plan.steps[0].state = 'running' }).toThrow()
  })

  it('returns immutable state transition snapshots', () => {
    const planner = new BenchmarkExecutionPlanner()
    const pending = planner.create([{ id: 'provider' }])
    const running = planner.markRunning(pending, pending.steps[0])
    const completed = planner.markCompleted(running, running.steps[0])

    expect(pending.steps[0].state).toBe('pending')
    expect(running.steps[0].state).toBe('running')
    expect(completed.steps[0].state).toBe('completed')
    expect(Object.isFrozen(completed)).toBe(true)
    expect(Object.isFrozen(completed.steps)).toBe(true)
    expect(Object.isFrozen(completed.steps[0])).toBe(true)
  })
})

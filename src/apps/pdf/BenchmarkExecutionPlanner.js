export class BenchmarkExecutionPlanner {
  create(providers) {
    return Object.freeze({
      steps: Object.freeze(providers.map(({ id }) => Object.freeze({
        providerId: id,
        state: 'pending'
      })))
    })
  }

  markRunning(plan, step) {
    return this.#transition(plan, step, 'running')
  }

  markCompleted(plan, step) {
    return this.#transition(plan, step, 'completed')
  }

  markFailed(plan, step) {
    return this.#transition(plan, step, 'failed')
  }

  #transition(plan, step, state) {
    return Object.freeze({
      steps: Object.freeze(plan.steps.map(candidate => candidate === step
        ? Object.freeze({ ...candidate, state })
        : candidate))
    })
  }
}

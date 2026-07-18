export class BenchmarkExecutionPlanner {
  create(providers) {
    return Object.freeze({
      steps: Object.freeze(providers.map(({ id }) => Object.freeze({
        providerId: id,
        state: 'pending'
      })))
    })
  }
}

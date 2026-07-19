export function createBenchmarkProfile({ id, name, configurations } = {}) {
  if (typeof id !== 'string' || !id) throw new TypeError('BenchmarkProfile requires an id')
  if (typeof name !== 'string' || !name) throw new TypeError('BenchmarkProfile requires a name')
  if (!Array.isArray(configurations)) throw new TypeError('BenchmarkProfile requires configurations')

  return Object.freeze({
    id,
    name,
    configurations: Object.freeze(configurations.map(configuration => Object.freeze({ ...configuration })))
  })
}

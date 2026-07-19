function createCandidateId({ scale, language }) {
  return `scale-${scale}-${language}`
}

export class BenchmarkCandidatePlanner {
  createCandidates({ configurations } = {}) {
    if (!Array.isArray(configurations)) {
      throw new TypeError('BenchmarkCandidatePlanner requires configurations')
    }

    return Object.freeze(configurations.map(configuration => Object.freeze({
      candidateId: createCandidateId(configuration),
      configuration: Object.freeze({ ...configuration })
    })))
  }
}

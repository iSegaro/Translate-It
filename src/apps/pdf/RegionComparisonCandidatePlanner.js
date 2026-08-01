function createCandidateId({ scale }) {
  return `scale-${scale}`
}

export class RegionComparisonCandidatePlanner {
  createCandidates({ configurations } = {}) {
    if (!Array.isArray(configurations)) {
      throw new TypeError('RegionComparisonCandidatePlanner requires configurations')
    }

    return Object.freeze(configurations.map(configuration => Object.freeze({
      candidateId: createCandidateId(configuration),
      configuration: Object.freeze({ ...configuration })
    })))
  }
}

export function createRegionExecutionDispatcher({ runners = {} } = {}) {
  function dispatchRegionExecution(request) {
    if (!request || typeof request !== 'object') {
      throw new TypeError('Execution request is required')
    }

    const runner = runners?.[request?.target]
    if (typeof runner !== 'function') {
      throw new RangeError('Unsupported region execution target')
    }

    return runner(request)
  }

  return Object.freeze({
    dispatchRegionExecution
  })
}

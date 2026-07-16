export function createRegionExecutionDispatcher({ runners = {} } = {}) {
  function dispatchRegionExecution(request) {
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

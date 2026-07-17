function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value

  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

export function createExecutionOperation({ promise, cancel, context = {} } = {}) {
  if (!promise || typeof promise.then !== 'function') {
    throw new TypeError('Execution operation requires a promise')
  }
  if (typeof cancel !== 'function') {
    throw new TypeError('Execution operation requires a cancel function')
  }
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new TypeError('Execution operation context must be an object')
  }

  return Object.freeze({
    promise,
    cancel,
    context: deepFreeze({ ...context })
  })
}

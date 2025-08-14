import { describe, it, expect, beforeEach } from 'vitest'
import { getScopedLogger, createLogger, __resetLoggingSystemForTests, listLoggerLevels, setLogLevel, getLogLevel } from '../logger.js'
import { LOG_COMPONENTS, LOG_LEVELS } from '../logConstants.js'

describe('Logging System Cache', () => {
  beforeEach(() => {
    __resetLoggingSystemForTests()
  })

  it('reuses same instance for identical component scope', () => {
    const a = getScopedLogger(LOG_COMPONENTS.CONTENT)
    const b = getScopedLogger(LOG_COMPONENTS.CONTENT)
    expect(a).toBe(b)
  })

  it('separates different components', () => {
    const c1 = getScopedLogger(LOG_COMPONENTS.CONTENT)
    const ui = getScopedLogger(LOG_COMPONENTS.UI)
    expect(c1).not.toBe(ui)
  })

  it('differentiates subcomponents', () => {
    const p = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'Pipeline')
    const g = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'Provider:Google')
    expect(p).not.toBe(g)
  })

  it('createLogger returns a new instance each call (no cache)', () => {
    const a = createLogger(LOG_COMPONENTS.CORE)
    const b = createLogger(LOG_COMPONENTS.CORE)
    expect(a).not.toBe(b)
  })

  it('allows level inspection and modification', () => {
    const before = listLoggerLevels()
  setLogLevel(LOG_COMPONENTS.CORE, LOG_LEVELS.DEBUG)
  expect(getLogLevel(LOG_COMPONENTS.CORE)).toBe(LOG_LEVELS.DEBUG)
  const after = listLoggerLevels()
  // Keys in componentLogLevels are capitalized names like 'Core'
  expect(after.components.Core).toBe(LOG_LEVELS.DEBUG)
  expect(before.components.Core).not.toBe(after.components.Core)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { getScopedLogger, createLogger, __resetLoggingSystemForTests, listLoggerLevels, setLogLevel, getLogLevel } from '../logger.js'

describe('Logging System Cache', () => {
  beforeEach(() => {
    __resetLoggingSystemForTests()
  })

  it('reuses same instance for identical component scope', () => {
    const a = getScopedLogger("Content")
    const b = getScopedLogger("Content")
    expect(a).toBe(b)
  })

  it('separates different components', () => {
    const c1 = getScopedLogger("Content")
    const ui = getScopedLogger("UI")
    expect(c1).not.toBe(ui)
  })

  it('differentiates subcomponents', () => {
    const p = getScopedLogger("Translation", 'Pipeline')
    const g = getScopedLogger("Translation", 'Provider:Google')
    expect(p).not.toBe(g)
  })

  it('createLogger returns a new instance each call (no cache)', () => {
    const a = createLogger("Core")
    const b = createLogger("Core")
    expect(a).not.toBe(b)
  })

  it('allows level inspection and modification', () => {
    const before = listLoggerLevels()
  // Force a change to a different level first (ERROR), then back to DEBUG
  setLogLevel("Core", LOG_LEVELS.ERROR)
  expect(getLogLevel("Core")).toBe(LOG_LEVELS.ERROR)
  const mid = listLoggerLevels()
  expect(mid.components.Core).toBe(LOG_LEVELS.ERROR)
  // Now set to DEBUG and validate second transition
  setLogLevel("Core", LOG_LEVELS.DEBUG)
  expect(getLogLevel("Core")).toBe(LOG_LEVELS.DEBUG)
  const after = listLoggerLevels()
  expect(after.components.Core).toBe(LOG_LEVELS.DEBUG)
  // Ensure at least one of the transitions changed from the original
  expect(before.components.Core === after.components.Core && before.components.Core === mid.components.Core).toBe(false)
  })
})

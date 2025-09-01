import { describe, it, expect, beforeEach } from 'vitest'
import { getScopedLogger, createLogger, __resetLoggingSystemForTests } from '../logger.js'

// NOTE: We intentionally also import createLogger to ensure cache differentiates
// between direct factory usage and scoped helper; external code should prefer getScopedLogger.

describe('Logging System Cache', () => {
  beforeEach(() => {
    __resetLoggingSystemForTests()
  })

  it('returns same instance for identical component scope', () => {
    const a = getScopedLogger("Content")
    const b = getScopedLogger("Content")
    expect(a).toBe(b)
  })

  it('returns different instances for different components', () => {
    const contentLogger = getScopedLogger("Content")
    const uiLogger = getScopedLogger("UI")
    expect(contentLogger).not.toBe(uiLogger)
  })

  it('returns different instances for subcomponents', () => {
    const s1 = getScopedLogger("Translation", 'Pipeline')
    const s2 = getScopedLogger("Translation", 'Provider:Google')
    expect(s1).not.toBe(s2)
  })

  it('does not reuse createLogger direct instances for cache (by design)', () => {
    const a = getScopedLogger("Core")
    const direct = createLogger("Core") // separate instance
    expect(a).not.toBe(direct)
  })

  it('creates unique cache key including subComponent', () => {
    const base = getScopedLogger("Capture")
    const sub = getScopedLogger("Capture", 'Area')
    const sub2 = getScopedLogger("Capture", 'Full')
    expect(base).not.toBe(sub)
    expect(sub).not.toBe(sub2)
    expect(base).not.toBe(sub2)
  })
})

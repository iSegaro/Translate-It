import { describe, it, expect, beforeEach } from 'vitest'
import { getScopedLogger, createLogger, __resetLoggingSystemForTests } from '../logger.js'
import { LOG_COMPONENTS } from '../logConstants.js'

// NOTE: We intentionally also import createLogger to ensure cache differentiates
// between direct factory usage and scoped helper; external code should prefer getScopedLogger.

describe('Logging System Cache', () => {
  beforeEach(() => {
    __resetLoggingSystemForTests()
  })

  it('returns same instance for identical component scope', () => {
    const a = getScopedLogger(LOG_COMPONENTS.CONTENT)
    const b = getScopedLogger(LOG_COMPONENTS.CONTENT)
    expect(a).toBe(b)
  })

  it('returns different instances for different components', () => {
    const contentLogger = getScopedLogger(LOG_COMPONENTS.CONTENT)
    const uiLogger = getScopedLogger(LOG_COMPONENTS.UI)
    expect(contentLogger).not.toBe(uiLogger)
  })

  it('returns different instances for subcomponents', () => {
    const s1 = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'Pipeline')
    const s2 = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'Provider:Google')
    expect(s1).not.toBe(s2)
  })

  it('does not reuse createLogger direct instances for cache (by design)', () => {
    const a = getScopedLogger(LOG_COMPONENTS.CORE)
    const direct = createLogger(LOG_COMPONENTS.CORE) // separate instance
    expect(a).not.toBe(direct)
  })

  it('creates unique cache key including subComponent', () => {
    const base = getScopedLogger(LOG_COMPONENTS.CAPTURE)
    const sub = getScopedLogger(LOG_COMPONENTS.CAPTURE, 'Area')
    const sub2 = getScopedLogger(LOG_COMPONENTS.CAPTURE, 'Full')
    expect(base).not.toBe(sub)
    expect(sub).not.toBe(sub2)
    expect(base).not.toBe(sub2)
  })
})

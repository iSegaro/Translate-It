import { describe, expect, it } from 'vitest'
import {
  CompletionTermination,
  CompletionProviderFamily,
  createCompletionRecord,
  createUsageRecord,
  normalizeCompletionTermination,
  normalizeTermination,
} from './CompletionContract.js'

const RAW_TERMINATION_SAMPLES = ['STOP', 'MAX_TOKENS', 'SAFETY', 'stop', 'length', 'max_tokens', 'content_filter']

describe('CompletionTermination vocabulary', () => {
  it('defines the normalized provider-neutral vocabulary', () => {
    expect(Object.values(CompletionTermination)).toEqual([
      'NORMAL',
      'TRUNCATED',
      'POLICY',
      'PROVIDER_ERROR',
      'UNKNOWN',
    ])
  })

  it('keeps raw provider-native strings out of the normalized vocabulary', () => {
    const values = new Set(Object.values(CompletionTermination))
    for (const raw of RAW_TERMINATION_SAMPLES) {
      expect(values.has(raw)).toBe(false)
    }
  })

  it('validates normalized values through the single source of truth', () => {
    expect(normalizeCompletionTermination(CompletionTermination.NORMAL)).toBe(CompletionTermination.NORMAL)
    expect(normalizeCompletionTermination(CompletionTermination.TRUNCATED)).toBe(CompletionTermination.TRUNCATED)
    expect(normalizeCompletionTermination('STOP')).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeCompletionTermination('content_filter')).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeCompletionTermination(null)).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeCompletionTermination(undefined)).toBe(CompletionTermination.UNKNOWN)
  })
})

describe('normalizeTermination', () => {
  it('maps Gemini native values to normalized semantics', () => {
    expect(normalizeTermination(CompletionProviderFamily.GEMINI, 'STOP')).toBe(CompletionTermination.NORMAL)
    expect(normalizeTermination(CompletionProviderFamily.GEMINI, 'MAX_TOKENS')).toBe(CompletionTermination.TRUNCATED)
    expect(normalizeTermination(CompletionProviderFamily.GEMINI, 'SAFETY')).toBe(CompletionTermination.POLICY)
  })

  it('maps OpenAI-compatible native values to normalized semantics', () => {
    expect(normalizeTermination(CompletionProviderFamily.OPENAI_COMPATIBLE, 'stop')).toBe(CompletionTermination.NORMAL)
    expect(normalizeTermination(CompletionProviderFamily.OPENAI_COMPATIBLE, 'length')).toBe(CompletionTermination.TRUNCATED)
    expect(normalizeTermination(CompletionProviderFamily.OPENAI_COMPATIBLE, 'max_tokens')).toBe(CompletionTermination.TRUNCATED)
    expect(normalizeTermination(CompletionProviderFamily.OPENAI_COMPATIBLE, 'content_filter')).toBe(CompletionTermination.POLICY)
  })

  it('collapses unrecognized values and families to UNKNOWN', () => {
    expect(normalizeTermination(CompletionProviderFamily.GEMINI, 'REASONING')).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeTermination(CompletionProviderFamily.OPENAI_COMPATIBLE, 'STOP')).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeTermination('SOME_FUTURE_FAMILY', 'STOP')).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeTermination(CompletionProviderFamily.GEMINI, null)).toBe(CompletionTermination.UNKNOWN)
    expect(normalizeTermination(CompletionProviderFamily.GEMINI, undefined)).toBe(CompletionTermination.UNKNOWN)
  })
})

describe('createUsageRecord', () => {
  it('preserves supplied counts and leaves absent counts null', () => {
    const usage = createUsageRecord({ inputTokens: 12, outputTokens: 34, reasoningTokens: 5, totalTokens: 51 })
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 34, reasoningTokens: 5, totalTokens: 51 })
    expect(Object.isFrozen(usage)).toBe(true)
  })

  it('keeps zero as a valid count', () => {
    expect(createUsageRecord({ inputTokens: 0 }).inputTokens).toBe(0)
  })

  it('never derives missing counts', () => {
    const usage = createUsageRecord({ inputTokens: 10, outputTokens: 20 })
    expect(usage.totalTokens).toBe(null)
    expect(usage.reasoningTokens).toBe(null)
  })

  it('rejects invalid counts as absent', () => {
    const usage = createUsageRecord({ inputTokens: 5, outputTokens: -5, reasoningTokens: 1.5, totalTokens: '10' })
    expect(usage.inputTokens).toBe(5)
    expect(usage.outputTokens).toBe(null)
    expect(usage.reasoningTokens).toBe(null)
    expect(usage.totalTokens).toBe(null)
  })

  it('returns null when every count is absent', () => {
    expect(createUsageRecord()).toBe(null)
    expect(createUsageRecord({ inputTokens: null, outputTokens: undefined })).toBe(null)
  })
})

describe('createCompletionRecord', () => {
  it('preserves supplied normalized fields', () => {
    const record = createCompletionRecord({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      termination: CompletionTermination.TRUNCATED,
      responseId: 'resp-1',
      usage: { inputTokens: 5, outputTokens: 9 },
    })
    expect(record).toEqual({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      termination: 'TRUNCATED',
      responseId: 'resp-1',
      usage: { inputTokens: 5, outputTokens: 9, reasoningTokens: null, totalTokens: null },
    })
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.usage)).toBe(true)
  })

  it('keeps absent facts null without fabricating values', () => {
    const record = createCompletionRecord()
    expect(record).toEqual({
      provider: null,
      model: null,
      termination: 'UNKNOWN',
      responseId: null,
      usage: null,
    })
  })

  it('collapses invalid termination to UNKNOWN', () => {
    expect(createCompletionRecord({ termination: 'MAX_TOKENS' }).termination).toBe(CompletionTermination.UNKNOWN)
    expect(createCompletionRecord({ termination: null }).termination).toBe(CompletionTermination.UNKNOWN)
  })

  it('sanitizes usage through the usage record factory', () => {
    const record = createCompletionRecord({ usage: { inputTokens: 3, totalTokens: 'bad' } })
    expect(record.usage).toEqual({ inputTokens: 3, outputTokens: null, reasoningTokens: null, totalTokens: null })
  })

  it('contains no text, body, prompt, credential, or family fields', () => {
    const record = createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.NORMAL })
    for (const forbidden of ['text', 'translatedText', 'sourceText', 'content', 'body', 'response', 'prompt', 'apiKey', 'family']) {
      expect(record).not.toHaveProperty(forbidden)
    }
  })
})

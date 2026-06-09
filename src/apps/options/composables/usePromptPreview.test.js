import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromptPreview } from './usePromptPreview.js'
import { TranslationMode } from '@/shared/config/config.js'

// Mocking config getters since they are imported dynamically
vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getPromptBASESelectAsync: vi.fn(() => Promise.resolve('SELECT: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptPopupTranslateAsync: vi.fn(() => Promise.resolve('POPUP: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptBASEFieldAsync: vi.fn(() => Promise.resolve('FIELD: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptBASEFieldAutoAsync: vi.fn(() => Promise.resolve('FIELD_AUTO: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptBASEScreenCaptureAsync: vi.fn(() => Promise.resolve('SCREEN: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptBASEBatchAsync: vi.fn(() => Promise.resolve('BATCH: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptBASEAIBatchAsync: vi.fn(() => Promise.resolve('AI_BATCH: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getPromptBASEAIBatchAutoAsync: vi.fn(() => Promise.resolve('AI_BATCH_AUTO: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}')),
    getEnableDictionaryAsync: vi.fn(() => Promise.resolve(true)),
    getPromptDictionaryAsync: vi.fn(() => Promise.resolve('DICT: $_{TEXT}')),
    getSourceLanguageAsync: vi.fn(() => Promise.resolve('en')),
  }
})

describe('usePromptPreview', () => {
  const mockT = vi.fn((key) => key)

  it('generates examples for General template', async () => {
    const { promptExamples, generateExamples } = usePromptPreview()
    
    await generateExamples({
      template: 'Custom Template: $_{TEXT}',
      isAuto: false,
      sourceLang: 'en',
      targetLang: 'fa',
      t: mockT
    })

    expect(promptExamples.value.length).toBeGreaterThan(0)
    const fieldExample = promptExamples.value.find(ex => ex.mode === 'prompt_preview_mode_field')
    expect(fieldExample.prompt).toContain('Custom Template')
    expect(fieldExample.prompt).toContain('FIELD:')
  })

  it('generates examples for Auto template and forces auto source', async () => {
    const { promptExamples, generateExamples } = usePromptPreview()
    
    await generateExamples({
      template: 'Auto Template: $_{TEXT}',
      isAuto: true,
      sourceLang: 'en', // Should be ignored in favor of 'auto'
      targetLang: 'fa',
      t: mockT
    })

    const fieldExample = promptExamples.value.find(ex => ex.mode === 'prompt_preview_mode_field')
    expect(fieldExample.prompt).toContain('Auto Template')
    // Should use FIELD_AUTO base because sourceLang is forced to 'auto'
    expect(fieldExample.prompt).toContain('FIELD_AUTO:')
  })

  it('handles batch translation (JSON) correctly', async () => {
    const { promptExamples, generateExamples } = usePromptPreview()
    
    await generateExamples({
      template: 'Batch Template: $_{TEXT}',
      isAuto: false,
      sourceLang: 'en',
      targetLang: 'fa',
      t: mockT
    })

    const batchExample = promptExamples.value.find(ex => ex.mode === 'prompt_preview_mode_batch')
    expect(batchExample.prompt).toContain('AI_BATCH:')
  })
})

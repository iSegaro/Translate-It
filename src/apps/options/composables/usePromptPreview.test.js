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

  it('prevents race conditions - latest request wins even if older request finishes last', async () => {
    const { promptExamples, generateExamples, loadingExamples } = usePromptPreview()
    
    // Create a way to control the timing of the first request
    let resolveSlowRequest;
    const slowRequestPromise = new Promise(resolve => {
      resolveSlowRequest = resolve;
    });

    const { getPromptBASEFieldAsync } = await import('@/shared/config/config.js');
    
    // Setup the mock to be slow ONLY for the first call
    vi.mocked(getPromptBASEFieldAsync).mockImplementationOnce(async () => {
      await slowRequestPromise;
      return 'FIELD: $_{PROMPT_INSTRUCTIONS}\n\n$_{TEXT}';
    });

    // 1. Start a "slow" request (Request A)
    const p1 = generateExamples({
      template: 'Slow Template',
      isAuto: false,
      sourceLang: 'en',
      targetLang: 'fa',
      t: mockT
    })

    // 2. Start a "fast" request (Request B) immediately after
    // This will increment lastGenerationId to 2
    const p2 = generateExamples({
      template: 'Fast Template',
      isAuto: false,
      sourceLang: 'en',
      targetLang: 'fa',
      t: mockT
    })

    // 3. Request B (Fast) should finish quickly because it's not blocked
    await p2;
    expect(promptExamples.value[0].prompt).toContain('Fast Template');
    
    // 4. Now resolve Request A (Slow)
    resolveSlowRequest();
    await p1;

    // 5. Assert: Request A (Slow) MUST NOT have overwritten Request B (Fast)
    expect(promptExamples.value[0].prompt).toContain('Fast Template');
    expect(promptExamples.value[0].prompt).not.toContain('Slow Template');
    expect(loadingExamples.value).toBe(false);
  })
})

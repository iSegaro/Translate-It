import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the translation provider factory before importing the store
vi.mock('@/providers', () => ({
  translationProviderFactory: {
    getProvider: vi.fn(),
    getAvailableProviders: vi.fn(() => [
      { id: 'google', name: 'Google Translate' },
      { id: 'openai', name: 'OpenAI GPT' }
    ])
  }
}))

// Import after mocking
const { useTranslationStore } = await import('../translation')

describe('Translation Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const store = useTranslationStore()
    
    expect(store.currentTranslation).toBeNull()
    expect(store.isTranslating).toBe(false)
    expect(store.error).toBeNull()
    expect(store.selectedProvider).toBe('google')
    expect(store.sourceLanguage).toBe('auto')
    expect(store.targetLanguage).toBe('en')
    expect(store.history).toEqual([])
  })

  it('translates text successfully', async () => {
    const mockProvider = {
      translate: vi.fn().mockResolvedValue({
        translatedText: 'سلام دنیا',
        sourceText: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        timestamp: Date.now()
      })
    }

    const { translationProviderFactory } = await import('@/providers')
    translationProviderFactory.getProvider.mockResolvedValue(mockProvider)

    const store = useTranslationStore()
    
    const result = await store.translateText('Hello world', {
      from: 'en',
      to: 'fa',
      provider: 'google'
    })

    expect(mockProvider.translate).toHaveBeenCalledWith('Hello world', {
      from: 'en',
      to: 'fa'
    })
    expect(result.translatedText).toBe('سلام دنیا')
    expect(store.currentTranslation).toEqual(result)
    expect(store.isTranslating).toBe(false)
    expect(store.error).toBeNull()
  })

  it('handles translation errors', async () => {
    const mockProvider = {
      translate: vi.fn().mockRejectedValue(new Error('Translation failed'))
    }

    const { translationProviderFactory } = await import('@/providers')
    translationProviderFactory.getProvider.mockResolvedValue(mockProvider)

    const store = useTranslationStore()
    
    await expect(store.translateText('Hello world')).rejects.toThrow('Translation failed: Translation failed')
    expect(store.isTranslating).toBe(false)
    expect(store.error).toBe('Translation failed: Translation failed')
  })

  it('adds translation to history', async () => {
    const mockProvider = {
      translate: vi.fn().mockResolvedValue({
        translatedText: 'سلام دنیا',
        sourceText: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        timestamp: Date.now()
      })
    }

    const { translationProviderFactory } = await import('@/providers')
    translationProviderFactory.getProvider.mockResolvedValue(mockProvider)

    const store = useTranslationStore()
    
    await store.translateText('Hello world')
    
    expect(store.history).toHaveLength(1)
    expect(store.history[0].sourceText).toBe('Hello world')
    expect(store.history[0].translatedText).toBe('سلام دنیا')
  })

  it('changes provider', () => {
    const store = useTranslationStore()
    
    expect(store.selectedProvider).toBe('google')
    
    store.setProvider('openai')
    
    expect(store.selectedProvider).toBe('openai')
  })

  it('changes languages', () => {
    const store = useTranslationStore()
    
    expect(store.sourceLanguage).toBe('auto')
    expect(store.targetLanguage).toBe('en')
    
    store.setSourceLanguage('fa')
    store.setTargetLanguage('fr')
    
    expect(store.sourceLanguage).toBe('fa')
    expect(store.targetLanguage).toBe('fr')
  })

  it('swaps languages', () => {
    const store = useTranslationStore()
    
    store.setSourceLanguage('en')
    store.setTargetLanguage('fa')
    
    store.swapLanguages()
    
    expect(store.sourceLanguage).toBe('fa')
    expect(store.targetLanguage).toBe('en')
  })

  it('clears history', () => {
    const store = useTranslationStore()
    
    // Add some history
    store.history.push({
      id: '1',
      sourceText: 'Hello',
      translatedText: 'سلام'
    })
    
    expect(store.history).toHaveLength(1)
    
    store.clearHistory()
    
    expect(store.history).toHaveLength(0)
  })

  it('clears current translation and error', () => {
    const store = useTranslationStore()
    
    store.currentTranslation = { translatedText: 'Test' }
    store.error = 'Some error'
    
    store.clearTranslation()
    
    expect(store.currentTranslation).toBeNull()
    expect(store.error).toBeNull()
  })
})
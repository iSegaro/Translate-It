import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useOCRStore } from '../ocrStore.js';
import { ocrCache } from '../../utils/ocrCache.js';

// Mock ocrCache
vi.mock('../../utils/ocrCache.js', () => ({
  ocrCache: {
    listCachedLanguages: vi.fn().mockResolvedValue([]),
    saveModel: vi.fn().mockResolvedValue(),
    deleteModel: vi.fn().mockResolvedValue(),
    clear: vi.fn().mockResolvedValue()
  }
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OCRStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should initialize with downloaded languages', async () => {
    const mockLangs = ['eng', 'fas'];
    ocrCache.listCachedLanguages.mockResolvedValue(mockLangs);

    const store = useOCRStore();
    await store.init();

    expect(store.downloadedLanguages).toEqual(mockLangs);
    expect(ocrCache.listCachedLanguages).toHaveBeenCalled();
  });

  it('should check if a language is downloaded', async () => {
    const store = useOCRStore();
    store.downloadedLanguages = ['eng', 'fra'];

    expect(store.isDownloaded('en')).toBe(true);
    expect(store.isDownloaded('fr')).toBe(true);
    expect(store.isDownloaded('fa')).toBe(false);
  });

  it('should download a language successfully', async () => {
    const store = useOCRStore();
    store.downloadedLanguages = [];

    // Mock successful fetch with streaming body
    const mockStream = {
      getReader: vi.fn(() => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
          .mockResolvedValueOnce({ done: true })
      }))
    };

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('3')
      },
      body: mockStream
    });

    // Mock blob and arrayBuffer
    const mockArrayBuffer = new ArrayBuffer(3);
    vi.stubGlobal('Blob', class {
      constructor(chunks) {
        this.chunks = chunks;
      }
      async arrayBuffer() {
        return mockArrayBuffer;
      }
    });

    await store.downloadLanguage('fa');

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('fas.traineddata.gz'));
    expect(ocrCache.saveModel).toHaveBeenCalledWith('fas', expect.any(Uint8Array));
    expect(store.isDownloading('fa')).toBe(false);
    expect(store.getDownloadProgress('fa')).toBe(0);
  });

  it('should handle download error', async () => {
    const store = useOCRStore();
    mockFetch.mockResolvedValue({ ok: false });

    await expect(store.downloadLanguage('en')).rejects.toThrow();
    expect(store.isDownloading('en')).toBe(false);
  });

  it('should delete a language', async () => {
    const store = useOCRStore();
    store.downloadedLanguages = ['eng'];

    await store.deleteLanguage('en');

    expect(ocrCache.deleteModel).toHaveBeenCalledWith('eng');
    expect(ocrCache.listCachedLanguages).toHaveBeenCalled();
  });

  it('should clear all languages', async () => {
    const store = useOCRStore();
    await store.clearAllLanguages();

    expect(ocrCache.clear).toHaveBeenCalled();
    expect(ocrCache.listCachedLanguages).toHaveBeenCalled();
  });
});

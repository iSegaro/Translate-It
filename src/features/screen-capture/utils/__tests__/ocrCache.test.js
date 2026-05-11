import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ocrCache } from '../ocrCache.js';

describe('ocrCache', () => {
  let mockDB;
  let mockTransaction;
  let mockStore;
  let mockRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup complex IndexedDB mocks
    mockRequest = {
      onsuccess: null,
      onerror: null,
      result: null,
      error: null
    };

    mockStore = {
      get: vi.fn(() => mockRequest),
      put: vi.fn(() => mockRequest),
      delete: vi.fn(() => mockRequest),
      clear: vi.fn(() => mockRequest),
      getAllKeys: vi.fn(() => mockRequest)
    };

    mockTransaction = {
      objectStore: vi.fn(() => mockStore)
    };

    mockDB = {
      transaction: vi.fn(() => mockTransaction),
      close: vi.fn()
    };

    const mockOpenRequest = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: mockDB
    };

    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => mockOpenRequest)
    });

    // Reset internal state of ocrCache singleton
    ocrCache.db = null;
    ocrCache.tesseractDb = null;

    vi.spyOn(ocrCache, 'init').mockImplementation(async () => {
      if (ocrCache.db) return ocrCache.db;
      ocrCache.db = mockDB;
      return mockDB;
    });
    vi.spyOn(ocrCache, 'getTesseractCachedModel').mockResolvedValue(null);
    vi.spyOn(ocrCache, 'saveTesseractCachedModel').mockResolvedValue();
    vi.spyOn(ocrCache, 'deleteTesseractCachedModel').mockResolvedValue();
    vi.spyOn(ocrCache, 'listTesseractCachedLanguages').mockResolvedValue([]);
  });

  describe('getModel', () => {
    it('should return model data from store', async () => {
      const mockData = new ArrayBuffer(8);
      
      // We need to wait for the method to call the mock
      const promise = ocrCache.getModel('eng');
      
      // Wait for async init and transaction setup
      await new Promise(resolve => setTimeout(resolve, 0));

      const request = mockStore.get.mock.results[0].value;
      request.result = mockData;
      request.onsuccess();

      const result = await promise;
      expect(result).toBe(mockData);
      expect(mockStore.get).toHaveBeenCalledWith('eng');
    });

    it('should return null if not found', async () => {
      const promise = ocrCache.getModel('fra');
      
      // Wait for async init and transaction setup
      await new Promise(resolve => setTimeout(resolve, 0));

      const request = mockStore.get.mock.results[0].value;
      request.result = null;
      request.onsuccess();

      const result = await promise;
      expect(result).toBeNull();
      expect(ocrCache.getTesseractCachedModel).toHaveBeenCalledWith('fra');
    });
  });

  describe('saveModel', () => {
    it('should put data into store', async () => {
      const mockData = new ArrayBuffer(8);
      const promise = ocrCache.saveModel('deu', mockData);
      
      // Wait for async init and transaction setup
      await new Promise(resolve => setTimeout(resolve, 0));

      const request = mockStore.put.mock.results[0].value;
      request.onsuccess();

      await promise;
      expect(mockStore.put).toHaveBeenCalledWith(expect.any(Uint8Array), 'deu');
      expect(ocrCache.saveTesseractCachedModel).toHaveBeenCalledWith('deu', expect.any(Uint8Array));
    });
  });

  describe('hasModel', () => {
    it('should return true if model exists', async () => {
      vi.spyOn(ocrCache, 'getModel').mockResolvedValue(new ArrayBuffer(4));
      const result = await ocrCache.hasModel('eng');
      expect(result).toBe(true);
    });

    it('should return false if model does not exist', async () => {
      vi.spyOn(ocrCache, 'getModel').mockResolvedValue(null);
      const result = await ocrCache.hasModel('spa');
      expect(result).toBe(false);
    });
  });

  describe('listCachedLanguages', () => {
    it('should return all keys', async () => {
      const mockKeys = ['eng', 'fas', 'fra'];
      const promise = ocrCache.listCachedLanguages();
      
      // Wait for async init and transaction setup
      await new Promise(resolve => setTimeout(resolve, 0));

      const request = mockStore.getAllKeys.mock.results[0].value;
      request.result = mockKeys;
      request.onsuccess();

      const result = await promise;
      expect(result).toEqual(mockKeys);
    });

    it('should include languages mirrored in Tesseract cache', async () => {
      ocrCache.listTesseractCachedLanguages.mockResolvedValue(['fas', 'jpn']);
      const promise = ocrCache.listCachedLanguages();

      await new Promise(resolve => setTimeout(resolve, 0));

      const request = mockStore.getAllKeys.mock.results[0].value;
      request.result = ['eng', 'fas'];
      request.onsuccess();

      const result = await promise;
      expect(result).toEqual(['eng', 'fas', 'jpn']);
    });
  });
});

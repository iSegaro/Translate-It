import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recognize, cleanupOCREngine } from '../ocrEngine.js';

// Mock Tesseract.js
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn()
}));

// Mock ocrCache to avoid indexedDB issues in tests
// Path is relative to the test file
vi.mock('../../utils/ocrCache.js', () => ({
  ocrCache: {
    getModel: vi.fn().mockResolvedValue(null),
    hasModel: vi.fn().mockResolvedValue(true),
    migrateTesseractCache: vi.fn().mockResolvedValue()
  },
  default: {
    getModel: vi.fn().mockResolvedValue(null),
    hasModel: vi.fn().mockResolvedValue(true),
    migrateTesseractCache: vi.fn().mockResolvedValue()
  }
}));

// Mock browser API using vi.hoisted to ensure it's available for vi.mock
const mocks = vi.hoisted(() => ({
  getURL: vi.fn((path) => `chrome-extension://test/${path}`),
  storageGet: vi.fn().mockResolvedValue({})
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: mocks.getURL
    },
    storage: {
      local: {
        get: mocks.storageGet
      }
    }
  }
}));

describe('ocrEngine', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset module state
    await cleanupOCREngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('recognize', () => {
    it('should create worker and recognize text', async () => {
      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'Test recognition' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      const result = await recognize('mock-image-data', 'eng');

      expect(result).toBe('Test recognition');
      expect(createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({
        cacheMethod: 'readOnly',
        workerBlobURL: false
      }));
      expect(mockWorker.recognize).toHaveBeenCalledWith('mock-image-data', expect.any(Object));
    });

    it('should avoid writing new Tesseract cache entries when OCR auto-download is disabled', async () => {
      mocks.storageGet.mockResolvedValueOnce({ OCR_AUTO_DOWNLOAD: false });
      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'No cache write' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      await recognize('mock-image-data', 'eng');

      expect(createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({
        cacheMethod: 'readOnly'
      }));
    });

    it('should reuse worker for same language', async () => {
      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'First' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      await recognize('image1', 'eng');
      await recognize('image2', 'eng');

      expect(createWorker).toHaveBeenCalledTimes(1);
      expect(mockWorker.recognize).toHaveBeenCalledTimes(2);
      expect(mockWorker.terminate).not.toHaveBeenCalled();
    });

    it('should terminate worker when language changes', async () => {
      const mockWorkerEng = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'English' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const mockWorkerFra = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'French' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const { createWorker } = await import('tesseract.js');
      createWorker
        .mockResolvedValueOnce(mockWorkerEng)
        .mockResolvedValueOnce(mockWorkerFra);

      await recognize('image1', 'eng');
      await recognize('image2', 'fra');

      expect(createWorker).toHaveBeenCalledTimes(2);
      expect(mockWorkerEng.terminate).toHaveBeenCalled();
    });

    it('should support crop coordinates', async () => {
      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'Cropped text' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      const coordinates = { x: 100, y: 100, width: 200, height: 150 };
      await recognize('image', 'eng', coordinates);

      expect(mockWorker.recognize).toHaveBeenCalledWith('image', {
        rectangle: {
          top: 100,
          left: 100,
          width: 200,
          height: 150
        }
      });
    });
  });

  describe('cleanupOCREngine', () => {
    it('should cleanup all resources', async () => {
      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'Test' }
        }),
        terminate: vi.fn().mockResolvedValue()
      };

      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      await recognize('image', 'eng');
      await cleanupOCREngine();

      expect(mockWorker.terminate).toHaveBeenCalled();
    });
  });
});

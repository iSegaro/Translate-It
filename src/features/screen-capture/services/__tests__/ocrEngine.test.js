import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recognize,
  recognizeStructured,
  terminateIfIdle,
  cleanupOCREngine,
} from '../ocrEngine.js';

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushWorkerQueue() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

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

  describe('worker serialization', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('creates one worker and serializes concurrent same-language recognition', async () => {
      const firstRecognition = deferred();
      const secondRecognition = deferred();
      const mockWorker = {
        recognize: vi.fn()
          .mockReturnValueOnce(firstRecognition.promise)
          .mockReturnValueOnce(secondRecognition.promise),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      const first = recognize('first-image', 'eng');
      const second = recognize('second-image', 'eng');
      await vi.waitFor(() => {
        expect(createWorker).toHaveBeenCalledTimes(1);
        expect(mockWorker.recognize).toHaveBeenCalledTimes(1);
      });

      firstRecognition.resolve({ data: { text: 'first' } });
      await expect(first).resolves.toBe('first');
      await flushWorkerQueue();
      expect(mockWorker.recognize).toHaveBeenCalledTimes(2);

      secondRecognition.resolve({ data: { text: 'second' } });
      await expect(second).resolves.toBe('second');
    });

    it('creates one worker for concurrent first-use requests', async () => {
      const workerReady = deferred();
      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({ data: { text: 'ok' } }),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker.mockReturnValue(workerReady.promise);

      const first = recognize('first-image', 'eng');
      const second = recognize('second-image', 'eng');
      await vi.waitFor(() => expect(createWorker).toHaveBeenCalledTimes(1));

      workerReady.resolve(mockWorker);
      await expect(first).resolves.toBe('ok');
      await expect(second).resolves.toBe('ok');
      expect(createWorker).toHaveBeenCalledTimes(1);
    });

    it('waits for recognition before switching worker language', async () => {
      const activeRecognition = deferred();
      const englishWorker = {
        recognize: vi.fn().mockReturnValue(activeRecognition.promise),
        terminate: vi.fn().mockResolvedValue(),
      };
      const frenchWorker = {
        recognize: vi.fn().mockResolvedValue({ data: { text: 'bonjour' } }),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker
        .mockResolvedValueOnce(englishWorker)
        .mockResolvedValueOnce(frenchWorker);

      const english = recognize('english-image', 'eng');
      await vi.waitFor(() => expect(englishWorker.recognize).toHaveBeenCalledOnce());
      const french = recognize('french-image', 'fra');
      await flushWorkerQueue();

      expect(englishWorker.terminate).not.toHaveBeenCalled();
      expect(frenchWorker.recognize).not.toHaveBeenCalled();

      activeRecognition.resolve({ data: { text: 'hello' } });
      await expect(english).resolves.toBe('hello');
      await expect(french).resolves.toBe('bonjour');
      expect(englishWorker.terminate).toHaveBeenCalledOnce();
    });

    it('recovers after failed initialization and recognition', async () => {
      const initializationError = new Error('initialization failed');
      const recognitionError = new Error('recognition failed');
      const mockWorker = {
        recognize: vi.fn()
          .mockRejectedValueOnce(recognitionError)
          .mockResolvedValueOnce({ data: { text: 'recovered' } }),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker
        .mockRejectedValueOnce(initializationError)
        .mockResolvedValue(mockWorker);

      await expect(recognize('first-image', 'eng')).rejects.toThrow(initializationError);
      await expect(recognize('second-image', 'eng')).rejects.toThrow(recognitionError);
      await expect(recognize('third-image', 'eng')).resolves.toBe('recovered');
    });

    it('serializes recognize and recognizeStructured on the same worker', async () => {
      const activeRecognition = deferred();
      const mockWorker = {
        recognize: vi.fn()
          .mockReturnValueOnce(activeRecognition.promise)
          .mockResolvedValueOnce({ data: { text: 'structured', lines: [], confidence: 88 } }),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      const text = recognize('text-image', 'eng');
      const structured = recognizeStructured('structured-image', 'eng');
      await vi.waitFor(() => expect(mockWorker.recognize).toHaveBeenCalledTimes(1));

      activeRecognition.resolve({ data: { text: 'text' } });
      await expect(text).resolves.toBe('text');
      await expect(structured).resolves.toEqual({ text: 'structured', lines: [], confidence: 88 });
    });

    it('does not terminate an active recognition through idle cleanup', async () => {
      const activeRecognition = deferred();
      const mockWorker = {
        recognize: vi.fn().mockReturnValue(activeRecognition.promise),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker.mockResolvedValue(mockWorker);

      const recognition = recognize('image', 'eng');
      await vi.waitFor(() => expect(mockWorker.recognize).toHaveBeenCalledOnce());
      vi.useFakeTimers();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      const idleCleanup = terminateIfIdle();

      expect(mockWorker.terminate).not.toHaveBeenCalled();
      activeRecognition.resolve({ data: { text: 'done' } });
      await expect(recognition).resolves.toBe('done');
      await idleCleanup;

      expect(mockWorker.terminate).not.toHaveBeenCalled();
    });

    it('waits to clean up active recognition and initializes a fresh worker afterward', async () => {
      const activeRecognition = deferred();
      const firstWorker = {
        recognize: vi.fn().mockReturnValue(activeRecognition.promise),
        terminate: vi.fn().mockResolvedValue(),
      };
      const secondWorker = {
        recognize: vi.fn().mockResolvedValue({ data: { text: 'fresh' } }),
        terminate: vi.fn().mockResolvedValue(),
      };
      const { createWorker } = await import('tesseract.js');
      createWorker
        .mockResolvedValueOnce(firstWorker)
        .mockResolvedValueOnce(secondWorker);

      const first = recognize('first-image', 'eng');
      await vi.waitFor(() => expect(firstWorker.recognize).toHaveBeenCalledOnce());
      const cleanup = cleanupOCREngine();
      const second = recognize('second-image', 'eng');

      expect(firstWorker.terminate).not.toHaveBeenCalled();
      activeRecognition.resolve({ data: { text: 'first' } });
      await expect(first).resolves.toBe('first');
      await cleanup;
      expect(firstWorker.terminate).toHaveBeenCalledOnce();
      await expect(second).resolves.toBe('fresh');
      expect(createWorker).toHaveBeenCalledTimes(2);
    });
  });
});

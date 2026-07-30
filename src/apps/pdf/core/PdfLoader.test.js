import { describe, it, expect, vi, afterEach } from 'vitest';
import { PdfLoader } from './PdfLoader.js';
import { pdfSourceFromFile, pdfSourceFromUrl } from './PdfSource.js';

describe('PdfLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('file source', () => {
    it('reads a File and returns { name, buffer }', async () => {
      const file = new File(['pdf content'], 'document.pdf', { type: 'application/pdf' });
      const result = await PdfLoader.load(pdfSourceFromFile(file));

      expect(result.name).toBe('document.pdf');
      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    });

    it('falls back to default name when file has no name', async () => {
      const blob = new Blob(['content'], { type: 'application/pdf' });
      const file = new File([blob], '', { type: 'application/pdf' });
      if (!file.name) {
        Reflect.defineProperty(file, 'name', { value: '' });
      }
      const result = await PdfLoader.load(pdfSourceFromFile(file));

      expect(result.name).toBe('document.pdf');
    });

  });

  describe('url source', () => {
    it('fetches a URL and returns { name, buffer }', async () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        arrayBuffer: () => Promise.resolve(buffer),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('document.pdf');
      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.buffer.byteLength).toBe(3);
    });

    it('clears the timeout after a successful fetch', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
      });

      await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    });

    it('propagates fetch errors', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('NetworkError'));

      await expect(PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf')))
        .rejects.toThrow('NetworkError');
      expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    });

    it('aborts timed-out requests with a TimeoutError and clears the timer', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let signal;
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
        signal = options.signal;
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      });

      const load = PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));
      await vi.advanceTimersByTimeAsync(30_000);

      await expect(load).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(signal.aborted).toBe(true);
      expect(signal.reason.name).toBe('TimeoutError');
      expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    });
  });

  describe('unsupported source', () => {
    it('throws for unknown source type', async () => {
      await expect(PdfLoader.load({ type: 'unknown' }))
        .rejects.toThrow('Unsupported PdfSource type: unknown');
    });
  });
});

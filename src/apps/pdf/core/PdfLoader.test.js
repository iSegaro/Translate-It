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
    it('fetches a URL and returns { name, buffer } with the URL basename', async () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(buffer),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('doc.pdf');
      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.buffer.byteLength).toBe(3);
    });

    it('uses the Content-Disposition filename when present', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename="annual-report.pdf"' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/download?id=7'));

      expect(result.name).toBe('annual-report.pdf');
    });

    it('decodes an RFC 5987 filename* header value', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => "attachment; filename*=UTF-8''%E2%82%AC%20rate.pdf" },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('€ rate.pdf');
    });

    it('prefers filename* over filename when both are present', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'final.pdf' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('final.pdf');
    });

    it('uses response.url basename after a redirect', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        url: 'https://cdn.example.com/final-report.pdf',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/redirect'));

      expect(result.name).toBe('final-report.pdf');
    });

    it('falls back to source.url basename when the response exposes no filename', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/report-2024.pdf'));

      expect(result.name).toBe('report-2024.pdf');
    });

    it('decodes percent-encoded URL basenames', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/q1%20report.pdf'));

      expect(result.name).toBe('q1 report.pdf');
    });

    it('falls back to document.pdf when both URL paths end with a slash', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        url: 'https://example.com/pdfs/',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/docs/'));

      expect(result.name).toBe('document.pdf');
    });

    it('falls back to the URL basename when the header filename is empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename=""' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('doc.pdf');
    });

    it('sanitizes path traversal and leading slashes in header filenames', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename="../../evil.pdf"' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('evil.pdf');
    });

    it('rejects a ".." header filename and falls back to the URL basename', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename=".."' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('doc.pdf');
    });

    it('rejects a "." header filename and falls back to the URL basename', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename="."' },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(result.name).toBe('doc.pdf');
    });

    it('returns document.pdf when a ".." header filename and no URL filename exist', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'attachment; filename=".."' },
        url: 'https://example.com/pdfs/',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      });

      const result = await PdfLoader.load(pdfSourceFromUrl('https://example.com/docs/'));

      expect(result.name).toBe('document.pdf');
    });

    it('clears the timeout after a successful fetch', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
      });

      await PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf'));

      expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    });

    it('rejects a 404 response without reading its body', async () => {
      const arrayBuffer = vi.fn();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/missing.pdf',
        arrayBuffer,
      });

      await expect(PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf')))
        .rejects.toMatchObject({
          name: 'PdfHttpError',
          status: 404,
          statusText: 'Not Found',
          url: 'https://example.com/missing.pdf',
        });
      expect(arrayBuffer).not.toHaveBeenCalled();
    });

    it('rejects a 500 response without reading its body', async () => {
      const arrayBuffer = vi.fn();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        url: 'https://example.com/doc.pdf',
        arrayBuffer,
      });

      await expect(PdfLoader.load(pdfSourceFromUrl('https://example.com/doc.pdf')))
        .rejects.toMatchObject({
          name: 'PdfHttpError',
          status: 500,
          statusText: 'Internal Server Error',
        });
      expect(arrayBuffer).not.toHaveBeenCalled();
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
      const assertion = expect(load).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
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

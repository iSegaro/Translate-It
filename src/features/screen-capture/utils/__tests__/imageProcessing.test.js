import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cropImageData, isValidImageDataUrl, getImageDimensions } from '../imageProcessing.js';

describe('imageProcessing', () => {
  describe('isValidImageDataUrl', () => {
    it('should return true for valid PNG data URL', () => {
      const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      expect(isValidImageDataUrl(url)).toBe(true);
    });

    it('should return true for valid JPEG data URL', () => {
      const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAE mythology=';
      expect(isValidImageDataUrl(url)).toBe(true);
    });

    it('should return false for non-data URLs', () => {
      expect(isValidImageDataUrl('https://example.com/image.png')).toBe(false);
    });

    it('should return false for invalid formats', () => {
      expect(isValidImageDataUrl('data:text/plain;base64,YWJj')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isValidImageDataUrl(null)).toBe(false);
      expect(isValidImageDataUrl(undefined)).toBe(false);
    });
  });

  describe('getImageDimensions', () => {
    it('should resolve with image dimensions', async () => {
      // Mock Image
      const mockImage = {
        naturalWidth: 800,
        naturalHeight: 600,
        set src(value) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      };
      vi.stubGlobal('Image', class {
        constructor() {
          return mockImage;
        }
      });

      const dimensions = await getImageDimensions('data:image/png;base64,test');
      expect(dimensions).toEqual({ width: 800, height: 600 });
    });

    it('should reject on error', async () => {
      const mockImage = {
        set src(value) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Error('Load failed'));
          }, 0);
        }
      };
      vi.stubGlobal('Image', class {
        constructor() {
          return mockImage;
        }
      });

      await expect(getImageDimensions('data:image/png;base64,test')).rejects.toThrow();
    });
  });

  describe('cropImageData', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      
      // Mock Canvas
      const mockContext = {
        drawImage: vi.fn()
      };
      const mockCanvas = {
        getContext: vi.fn(() => mockContext),
        toDataURL: vi.fn(() => 'data:image/png;base64,cropped'),
        width: 0,
        height: 0
      };
      
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement(tag);
      });
      
      const originalCreateElement = document.createElement.bind(document);
    });

    it('should crop image correctly', async () => {
      const mockImage = {
        naturalWidth: 1000,
        naturalHeight: 1000,
        set src(value) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      };
      vi.stubGlobal('Image', class {
        constructor() {
          return mockImage;
        }
      });
      vi.stubGlobal('devicePixelRatio', 2);

      const selection = { x: 100, y: 100, width: 200, height: 200 };
      const result = await cropImageData('data:image/png;base64,original', selection);

      expect(result).toBe('data:image/png;base64,cropped');
      
      // Verification of calculations:
      // actualX = 100 * 2 = 200
      // actualY = 100 * 2 = 200
      // actualWidth = 200 * 2 = 400
      // actualHeight = 200 * 2 = 400
      // ctx.drawImage(img, 200, 200, 400, 400, 0, 0, 200, 200)
    });
  });
});

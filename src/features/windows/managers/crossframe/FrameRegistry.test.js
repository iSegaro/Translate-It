import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameRegistry } from './FrameRegistry.js';

describe('FrameRegistry', () => {
  let frameRegistry;
  let addEventListenerSpy;

  beforeEach(() => {
    // Clean up global state before each test
    delete window.translateItFrameRegistry;
    delete window.translateItFrameMap;
    
    // Mock postMessage
    vi.stubGlobal('parent', { postMessage: vi.fn() });
    vi.stubGlobal('top', window); // Mock top as same window by default

    frameRegistry = new FrameRegistry();
  });

  afterEach(() => {
    frameRegistry.cleanup();
    vi.restoreAllMocks();
    delete window.translateItFrameRegistry;
    delete window.translateItFrameMap;
  });

  describe('Initialization', () => {
    it('should generate a unique frameId', () => {
      const anotherRegistry = new FrameRegistry();
      expect(frameRegistry.frameId).toBeDefined();
      expect(frameRegistry.frameId).not.toBe(anotherRegistry.frameId);
      anotherRegistry.cleanup();
    });

    it('should initialize the global registry Set', () => {
      expect(window.translateItFrameRegistry).toBeInstanceOf(Set);
      expect(window.translateItFrameRegistry.has(frameRegistry.frameId)).toBe(true);
    });

    it('should recover if global registry is corrupted', () => {
      // Corrupt the registry
      window.translateItFrameRegistry = { add: 'not-a-function' };
      
      const newRegistry = new FrameRegistry();
      expect(window.translateItFrameRegistry).toBeInstanceOf(Set);
      expect(window.translateItFrameRegistry.has(newRegistry.frameId)).toBe(true);
      newRegistry.cleanup();
    });
  });

  describe('Cross-Frame Registration', () => {
    it('should register with parent if in an iframe', () => {
      const mockParent = { postMessage: vi.fn() };
      vi.stubGlobal('parent', mockParent);
      vi.stubGlobal('top', { postMessage: vi.fn() });
      
      // Force isTopFrame to false for this test instance
      // We need to re-instantiate because isTopFrame is set in constructor
      const originalTop = window.top;
      vi.stubGlobal('window', { ...window, top: { something: 'else' } });
      
      const iframeRegistry = new FrameRegistry();
      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'translateit-register-frame' }),
        '*'
      );
      iframeRegistry.cleanup();
      vi.stubGlobal('top', originalTop);
    });

    it('should map iframe elements in the top frame', () => {
      frameRegistry.isTopFrame = true; // Ensure it acts as top frame
      
      const mockIframeSource = { some: 'window' };
      const mockIframeElement = { 
        contentWindow: mockIframeSource,
        src: 'https://example.com'
      };
      
      vi.spyOn(document, 'querySelectorAll').mockReturnValue([mockIframeElement]);

      const event = {
        source: mockIframeSource,
        data: { frameId: 'remote-frame-123' }
      };

      frameRegistry.handleFrameRegistration(event);

      expect(window.translateItFrameMap.get('remote-frame-123')).toBe(mockIframeElement);
    });
  });

  describe('Cleanup', () => {
    it('should remove its own ID from the registry on cleanup', () => {
      const id = frameRegistry.frameId;
      expect(window.translateItFrameRegistry.has(id)).toBe(true);
      
      frameRegistry.cleanup();
      expect(window.translateItFrameRegistry.has(id)).toBe(false);
    });

    it('should remove disconnected iframes from the map during cleanup', () => {
      frameRegistry.isTopFrame = true;
      window.translateItFrameMap = new Map();
      
      const connectedIframe = { isConnected: true };
      const disconnectedIframe = { isConnected: false };
      
      window.translateItFrameMap.set('id-1', connectedIframe);
      window.translateItFrameMap.set('id-2', disconnectedIframe);
      
      frameRegistry.cleanup();
      
      expect(window.translateItFrameMap.has('id-1')).toBe(true);
      expect(window.translateItFrameMap.has('id-2')).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    it('should return all registered frames', () => {
      window.translateItFrameRegistry.add('extra-frame');
      const allFrames = frameRegistry.getAllFrames();
      expect(allFrames).toContain(frameRegistry.frameId);
      expect(allFrames).toContain('extra-frame');
    });

    it('should enable/disable debug logging', () => {
      expect(frameRegistry.debugCrossFrame).toBe(false);
      frameRegistry.enableDebug();
      expect(frameRegistry.debugCrossFrame).toBe(true);
      frameRegistry.disableDebug();
      expect(frameRegistry.debugCrossFrame).toBe(false);
    });

    it('should get iframe by ID', () => {
      frameRegistry.isTopFrame = true; // Required for getIframeByFrameId to work
      window.translateItFrameMap = new Map();
      const mockIframe = { id: 'test' };
      window.translateItFrameMap.set('frame-x', mockIframe);
      
      expect(frameRegistry.getIframeByFrameId('frame-x')).toBe(mockIframe);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrossFrameManager } from './CrossFrameManager.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

// Mock Registry and Router with constructor support
vi.mock('./FrameRegistry.js', () => ({
  FrameRegistry: vi.fn().mockImplementation(function() {
    this.frameId = 'test-frame';
    this.isTopFrame = true;
    this.isMainDocument = true;
    this.enableDebug = vi.fn();
    this.cleanup = vi.fn();
    this.getIframeByFrameId = vi.fn();
    return this;
  })
}));

vi.mock('./MessageRouter.js', () => ({
  MessageRouter: vi.fn().mockImplementation(function() {
    this.setHandlers = vi.fn();
    this.broadcastOutsideClick = vi.fn();
    this.requestBroadcastChange = vi.fn();
    this.requestWindowCreation = vi.fn();
    this.notifyWindowCreated = vi.fn();
    this.cleanup = vi.fn();
    return this;
  })
}));

describe('CrossFrameManager', () => {
  let cfManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cfManager = new CrossFrameManager();
  });

  it('should initialize correctly', () => {
    expect(cfManager.frameId).toBe('test-frame');
    expect(cfManager.isTopFrame).toBe(true);
  });

  it('should handle outside click by calling onOutsideClick handler', () => {
    const handler = vi.fn();
    cfManager.setEventHandlers({ onOutsideClick: handler });
    
    const event = { type: 'click' };
    cfManager._handleOutsideClick(event);
    
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should enable and disable global click broadcast', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    
    cfManager.enableGlobalClickBroadcast();
    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });
    
    cfManager.disableGlobalClickBroadcast();
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });
  });

  it('should broadcast outside click through MessageRouter', () => {
    const event = { type: 'click' };
    cfManager._broadcastOutsideClick(event);
    
    expect(cfManager.messageRouter.broadcastOutsideClick).toHaveBeenCalledWith(event);
  });

  it('should request global click relay', () => {
    cfManager.requestGlobalClickRelay(true);
    expect(cfManager.messageRouter.requestBroadcastChange).toHaveBeenCalledWith(true);
    
    cfManager.requestGlobalClickRelay(false);
    expect(cfManager.messageRouter.requestBroadcastChange).toHaveBeenCalledWith(false);
  });

  it('should prevent window creation request from main document', () => {
    // Current mock says it's top frame
    cfManager.requestWindowCreation('text', { x: 0, y: 0 });
    expect(cfManager.messageRouter.requestWindowCreation).not.toHaveBeenCalled();
  });

  it('should allow window creation request from iframe', () => {
    // Force iframe mode
    cfManager.frameRegistry.isTopFrame = false;
    
    cfManager.requestWindowCreation('text', { x: 0, y: 0 });
    expect(cfManager.messageRouter.requestWindowCreation).toHaveBeenCalledWith('text', { x: 0, y: 0 });
  });

  it('should cleanup resources', () => {
    cfManager.cleanup();
    
    expect(cfManager.messageRouter.cleanup).toHaveBeenCalled();
    expect(cfManager.frameRegistry.cleanup).toHaveBeenCalled();
  });
});

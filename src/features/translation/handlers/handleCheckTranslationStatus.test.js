import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCheckTranslationStatus } from './handleCheckTranslationStatus.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

// Create a mock for StreamingManager that we can control
const mockStreamingStatus = vi.fn();
vi.mock('../core/StreamingManager.js', () => ({
  streamingManager: {
    getStreamStatus: (id) => mockStreamingStatus(id)
  }
}));

describe('handleCheckTranslationStatus', () => {
  let mockEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEngine = {
      getAbortController: vi.fn()
    };
    
    globalThis.backgroundService = {
      translationEngine: mockEngine
    };
  });

  it('should return error if messageId is missing', async () => {
    const result = await handleCheckTranslationStatus({ data: {} }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Message ID is required');
  });

  it('should detect in-progress streaming translation', async () => {
    mockStreamingStatus.mockReturnValue({
      status: 'active',
      hasResults: false,
      isComplete: false
    });

    const result = await handleCheckTranslationStatus({ data: { messageId: 'msg-1' } }, {});
    
    expect(result.success).toBe(true);
    expect(result.inProgress).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.reason).toBe('still_in_progress');
  });

  it('should detect in-progress engine translation (via LifecycleRegistry)', async () => {
    mockStreamingStatus.mockReturnValue(null);
    mockEngine.getAbortController.mockReturnValue({}); // Request exists

    const result = await handleCheckTranslationStatus({ data: { messageId: 'msg-1' } }, {});
    
    expect(result.success).toBe(true);
    expect(result.inProgress).toBe(true);
    expect(result.reason).toBe('still_in_progress');
  });

  it('should return results for completed streaming translation', async () => {
    const mockResults = ['Translated Text'];
    mockStreamingStatus.mockReturnValue({
      status: 'completed',
      hasResults: true,
      isComplete: true,
      results: mockResults
    });

    const result = await handleCheckTranslationStatus({ data: { messageId: 'msg-1' } }, {});
    
    expect(result.success).toBe(true);
    expect(result.completed).toBe(true);
    expect(result.hasResults).toBe(true);
    expect(result.results).toEqual(mockResults);
    expect(result.reason).toBe('completed_with_results');
  });

  it('should handle error status from streaming', async () => {
    mockStreamingStatus.mockReturnValue({
      status: 'error',
      isComplete: true
    });

    const result = await handleCheckTranslationStatus({ data: { messageId: 'msg-1' } }, {});
    
    expect(result.success).toBe(true);
    expect(result.completed).toBe(true);
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('streaming_error');
  });

  it('should return not_found if request is unknown', async () => {
    mockStreamingStatus.mockReturnValue(null);
    mockEngine.getAbortController.mockReturnValue(null);

    const result = await handleCheckTranslationStatus({ data: { messageId: 'msg-1' } }, {});
    
    expect(result.success).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('not_found');
  });
});

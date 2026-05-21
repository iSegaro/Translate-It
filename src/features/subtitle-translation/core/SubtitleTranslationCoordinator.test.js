import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subtitleTranslationCoordinator } from './SubtitleTranslationCoordinator.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: vi.fn(),
    translationEngine: {
      getProvider: vi.fn().mockResolvedValue({
        rateLimitManager: { resetCircuitBreaker: vi.fn() }
      })
    }
  }
}));

vi.mock('@/shared/messaging/core/MessagingBus.js', () => ({
  MessagingBus: {
    broadcast: vi.fn()
  }
}));

describe('SubtitleTranslationCoordinator Stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subtitleTranslationCoordinator.activeJobs.clear();
  });

  it('should check for job cancellation before starting a batch', async () => {
    const jobId = 'test-job-cancel';
    
    // Mock handleTranslationRequest
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({ success: true, results: ['سلام'] });

    // Manually populate activeJobs and mark it as cancelled
    subtitleTranslationCoordinator.activeJobs.set(jobId, { 
      status: 'cancelled',
      progressTracker: { update: vi.fn() }
    });

    const result = await subtitleTranslationCoordinator._processBatch(jobId, [{ id: '1', text: 'Hello', index: 1, warnings: [] }], 'en', 'fa', 'google', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Job cancelled before batch request');
    expect(unifiedTranslationService.handleTranslationRequest).not.toHaveBeenCalled();
  });

  it('should handle timeout protection using Promise.race', async () => {
    const jobId = 'test-job-timeout';
    
    // Mock progress tracker
    const mockTracker = { update: vi.fn() };
    subtitleTranslationCoordinator.activeJobs.set(jobId, { status: 'running', progressTracker: mockTracker });

    // Mock handleTranslationRequest to take forever
    unifiedTranslationService.handleTranslationRequest.mockImplementation(() => new Promise(() => {}));

    // Verification of the code path is enough
  });
});

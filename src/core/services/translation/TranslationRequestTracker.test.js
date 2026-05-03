import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranslationRequestTracker, RequestStatus, RequestPriority } from './TranslationRequestTracker.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ActionReasons } from '@/shared/messaging/core/MessagingCore.js';

describe('TranslationRequestTracker', () => {
  let tracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new TranslationRequestTracker();
  });

  afterEach(() => {
    tracker.stopCleanup();
    vi.useRealTimers();
  });

  describe('createRequest', () => {
    it('should create and track a new request correctly', () => {
      const messageId = 'msg-1';
      const sender = { tab: { id: 123, url: 'https://example.com' }, frameId: 0 };
      const data = { text: 'Hello', mode: TranslationMode.Selection, toastId: 'toast-1' };

      const request = tracker.createRequest({ messageId, data, sender });

      expect(request.messageId).toBe(messageId);
      expect(request.status).toBe(RequestStatus.PENDING);
      expect(request.mode).toBe(TranslationMode.Selection);
      expect(request.metadata.tabId).toBe(123);
      expect(request.metadata.toastId).toBe('toast-1');
      expect(tracker.getRequest(messageId)).toBe(request);
      expect(tracker.getRequestByToastId('toast-1')).toBe(request);
    });

    it('should index requests by tabId', () => {
      const messageId = 'msg-1';
      const sender = { tab: { id: 123 } };
      const data = { text: 'Hello' };

      tracker.createRequest({ messageId, data, sender });
      const tabRequests = tracker.getTabRequests(123);

      expect(tabRequests).toHaveLength(1);
      expect(tabRequests[0].messageId).toBe(messageId);
    });

    it('should determine priority correctly for Field mode', () => {
      const request = tracker.createRequest({
        messageId: 'msg-1',
        data: { mode: TranslationMode.Field }
      });
      expect(request.priority).toBe(RequestPriority.HIGH);
    });

    it('should extract element data correctly', () => {
      const data = { 
        elementId: 'el-1', 
        elementSelector: '.test', 
        elementTagName: 'DIV',
        toastId: 't-1'
      };
      const request = tracker.createRequest({ messageId: 'm1', data });
      expect(request.elementData.id).toBe('el-1');
      expect(request.elementData.selector).toBe('.test');
      expect(request.elementData.recoveryStrategy).toBe('id');
    });
  });

  describe('updateRequest', () => {
    it('should update an existing request', () => {
      const messageId = 'msg-1';
      tracker.createRequest({ messageId, data: { text: 'Hello' } });

      const success = tracker.updateRequest(messageId, { status: RequestStatus.PROCESSING });
      
      expect(success).toBe(true);
      expect(tracker.getRequest(messageId).status).toBe(RequestStatus.PROCESSING);
    });

    it('should return false when updating non-existent request', () => {
      const success = tracker.updateRequest('non-existent', { status: RequestStatus.COMPLETED });
      expect(success).toBe(false);
    });
  });

  describe('completeRequest', () => {
    it('should remove request from tracking after completion', () => {
      const messageId = 'msg-1';
      const sender = { tab: { id: 123 } };
      tracker.createRequest({ messageId, data: { text: 'Hello', toastId: 't1' }, sender });

      tracker.completeRequest(messageId, { success: true, translatedText: 'Bonjour' });

      expect(tracker.getRequest(messageId)).toBeUndefined();
      expect(tracker.getTabRequests(123)).toHaveLength(0);
      expect(tracker.getRequestByToastId('t1')).toBeNull();
    });

    it('should update statistics correctly on completion', () => {
      tracker.createRequest({ messageId: 'm1', data: { text: 'h1' } });
      tracker.completeRequest('m1', { success: true });

      tracker.createRequest({ messageId: 'm2', data: { text: 'h2' } });
      tracker.completeRequest('m2', { success: false });

      const stats = tracker.getStatistics();
      expect(stats.totalCompleted).toBe(1);
      expect(stats.totalFailed).toBe(1);
    });

    it('should return false for non-existent request', () => {
      expect(tracker.completeRequest('ghost', { success: true })).toBe(false);
    });
  });

  describe('isRequestActive', () => {
    it('should return true for active statuses', () => {
      tracker.createRequest({ messageId: 'm1', data: {} });
      expect(tracker.isRequestActive('m1')).toBe(true); // PENDING

      tracker.updateRequest('m1', { status: RequestStatus.PROCESSING });
      expect(tracker.isRequestActive('m1')).toBe(true);

      tracker.updateRequest('m1', { status: RequestStatus.STREAMING });
      expect(tracker.isRequestActive('m1')).toBe(true);

      tracker.updateRequest('m1', { status: RequestStatus.COMPLETED });
      expect(tracker.isRequestActive('m1')).toBe(false);
    });
  });

  describe('cancelRequest', () => {
    it('should mark request as cancelled', () => {
      const messageId = 'msg-1';
      tracker.createRequest({ messageId, data: { text: 'Hello' } });

      const result = tracker.cancelRequest(messageId, ActionReasons.USER_CANCELLED);

      expect(result.success).toBe(true);
      expect(tracker.getRequest(messageId).status).toBe(RequestStatus.CANCELLED);
      expect(tracker.getStatistics().totalCancelled).toBe(1);
    });

    it('should respect preventCancel metadata', () => {
      const messageId = 'msg-1';
      tracker.createRequest({ messageId, data: {} });
      const request = tracker.getRequest(messageId);
      request.metadata.preventCancel = true;

      const result = tracker.cancelRequest(messageId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Request cannot be cancelled');
    });

    it('should not cancel non-active requests', () => {
      const messageId = 'msg-1';
      tracker.createRequest({ messageId, data: { text: 'Hello' } });
      tracker.completeRequest(messageId, { success: true });

      const result = tracker.cancelRequest(messageId);
      expect(result.success).toBe(false);
    });
  });

  describe('markTimeout', () => {
    it('should mark request as timeout', () => {
      tracker.createRequest({ messageId: 'm1', data: {} });
      tracker.markTimeout('m1');
      expect(tracker.getRequest('m1').status).toBe(RequestStatus.TIMEOUT);
      expect(tracker.getStatistics().totalTimeouts).toBe(1);
    });
  });

  describe('processingTime', () => {
    it('should calculate processing time correctly', () => {
      vi.setSystemTime(1000);
      tracker.createRequest({ messageId: 'm1', data: {} });
      
      vi.setSystemTime(2500);
      expect(tracker.getProcessingTime('m1')).toBe(1500);

      tracker.updateRequest('m1', { status: RequestStatus.COMPLETED });
      vi.setSystemTime(5000);
      expect(tracker.getProcessingTime('m1')).toBe(1500); // Should use updatedAt
    });
  });

  describe('element association', () => {
    it('should associate and find requests by element', () => {
      const el = { nodeType: 1 };
      tracker.associateWithElement('m1', el);
      expect(tracker.findRequestByElement(el)).toBe('m1');
    });
  });

  describe('cleanup', () => {
    it('should remove old completed requests', () => {
      const startTime = 1000000000;
      vi.setSystemTime(startTime);
      const messageId = 'msg-old';
      tracker.createRequest({ messageId, data: { text: 'Hello' } });
      tracker.updateRequest(messageId, { status: RequestStatus.COMPLETED });

      // Move time forward by 6 minutes
      vi.setSystemTime(startTime + 6 * 60 * 1000);

      const cleaned = tracker.cleanup();
      expect(cleaned).toBe(1);
      expect(tracker.getRequest(messageId)).toBeUndefined();
    });

    it('should remove stuck active requests after 30 minutes', () => {
      const startTime = 1000000000;
      vi.setSystemTime(startTime);
      const messageId = 'msg-stuck';
      tracker.createRequest({ messageId, data: { text: 'Hello' } });
      tracker.updateRequest(messageId, { status: RequestStatus.PROCESSING });

      // Move time forward by 31 minutes
      vi.setSystemTime(startTime + 31 * 60 * 1000);

      const cleaned = tracker.cleanup();
      expect(cleaned).toBe(1);
      expect(tracker.getRequest(messageId)).toBeUndefined();
    });
  });

  describe('retries', () => {
    it('should track retry counts', () => {
      const messageId = 'msg-1';
      tracker.createRequest({ messageId, data: { text: 'Hello' } });

      tracker.recordRetry(messageId);
      tracker.recordRetry(messageId);

      expect(tracker.getRetryCount(messageId)).toBe(2);
      expect(tracker.hasExceededMaxRetries(messageId, 2)).toBe(true);
    });
  });

  describe('exportDebugData', () => {
    it('should export data for debugging', () => {
      tracker.createRequest({ messageId: 'm1', data: { text: 'test' } });
      const debug = tracker.exportDebugData();
      expect(debug.requests).toHaveLength(1);
      expect(debug.stats).toBeDefined();
      expect(debug.timestamp).toBeDefined();
    });
  });
});

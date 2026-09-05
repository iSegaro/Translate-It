import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectElementNotificationManager } from './SelectElementNotificationManager.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';

// Mock dependencies
vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class {
    constructor(id) { this.id = id; }
    addEventListener(emitter, event, handler) { emitter.on(event, handler); }
    cleanup() {}
  }
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    on: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn()
  }
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getI18nUtils: vi.fn(() => Promise.resolve({
      getTranslationString: vi.fn(key => Promise.resolve(`Mocked_${key}`))
    }))
  }
}));

vi.mock('@/utils/browser/compatibility.js', () => ({
  deviceDetector: {
    isMobile: vi.fn(() => false)
  }
}));

vi.mock('@/shared/config/constants.js', () => ({
  TRANSLATION_STATUS: {
    TRANSLATING: 'translating'
  }
}));

vi.mock('../../shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('../../shared/logging/logConstants', () => ({
  LOG_COMPONENTS: {
    ELEMENT_SELECTION: 'element_selection'
  }
}));

describe('SelectElementNotificationManager', () => {
  let mockNotificationManager;
  let manager;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Ensure default mock behavior
    const { utilsFactory } = await import('@/utils/UtilsFactory.js');
    utilsFactory.getI18nUtils.mockResolvedValue({
      getTranslationString: vi.fn(key => Promise.resolve(`Mocked_${key}`))
    });

    mockNotificationManager = {
      update: vi.fn(),
      dismiss: vi.fn(),
      show: vi.fn(() => 'info-toast-id')
    };
    
    // Reset singleton instance
    SelectElementNotificationManager.instance = null;
    manager = await SelectElementNotificationManager.getInstance(mockNotificationManager);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', async () => {
      const instance2 = await SelectElementNotificationManager.getInstance();
      expect(manager).toBe(instance2);
    });
  });

  describe('Event Listeners', () => {
    it('should setup listeners on initialization', () => {
      expect(pageEventBus.on).toHaveBeenCalledWith('show-select-element-notification', expect.any(Function));
      expect(pageEventBus.on).toHaveBeenCalledWith('dismiss-select-element-notification', expect.any(Function));
      expect(pageEventBus.on).toHaveBeenCalledWith('show-select-element-info', expect.any(Function));
    });
  });

  describe('showNotification', () => {
    it('should not show if not in top frame', async () => {
      // Mock window.top comparison
      const originalWindow = global.window;
      global.window = { top: {} }; // window !== window.top
      
      await manager.showNotification();
      expect(mockNotificationManager.show).not.toHaveBeenCalled();
      
      global.window = originalWindow;
    });

    it('should show desktop message when not mobile', async () => {
      deviceDetector.isMobile.mockReturnValue(false);
      
      await manager.showNotification();
      
      expect(mockNotificationManager.show).toHaveBeenCalledWith(
        'Mocked_SELECT_ELEMENT_MODE_ACTIVATED',
        'status',
        0,
        expect.objectContaining({ id: expect.stringMatching(/^select-element-toast-\d+$/) })
      );
    });

    it('should handle null data gracefully', async () => {
      deviceDetector.isMobile.mockReturnValue(false);
      
      // Should not throw
      await manager.showNotification(null);
      
      expect(mockNotificationManager.show).toHaveBeenCalledWith(
        'Mocked_SELECT_ELEMENT_MODE_ACTIVATED',
        'status',
        0,
        expect.anything()
      );
    });

    it('should show mobile message when on mobile', async () => {
      deviceDetector.isMobile.mockReturnValue(true);
      
      await manager.showNotification();
      
      expect(mockNotificationManager.show).toHaveBeenCalledWith(
        'Mocked_SELECT_ELEMENT_MODE_ACTIVATED_MOBILE',
        'status',
        0,
        expect.anything()
      );
    });

    it('should cancel showing if dismissNotification called during async load', async () => {
      // Simulate slow i18n loading
      const { utilsFactory } = await import('@/utils/UtilsFactory.js');
      let resolveI18n;
      const i18nPromise = new Promise(resolve => { resolveI18n = resolve; });
      utilsFactory.getI18nUtils.mockReturnValue(i18nPromise);

      const showPromise = manager.showNotification();
      
      // Dismiss while still loading i18n
      manager.dismissNotification();
      
      // Resolve i18n
      resolveI18n({ getTranslationString: vi.fn(() => Promise.resolve('msg')) });
      await showPromise;

      expect(mockNotificationManager.show).not.toHaveBeenCalled();
    });

    it('uses a new toast ID for each rapid activation and dismisses both', async () => {
      await manager.showNotification();
      const firstToastId = manager.toastId;
      manager.dismissNotification();

      await manager.showNotification();
      const secondToastId = manager.toastId;
      manager.dismissNotification();

      expect(firstToastId).not.toBe(secondToastId);
      expect(mockNotificationManager.dismiss).toHaveBeenNthCalledWith(1, firstToastId);
      expect(mockNotificationManager.dismiss).toHaveBeenNthCalledWith(2, secondToastId);
    });

    it('does not publish a stale asynchronous show after a newer activation', async () => {
      const { utilsFactory } = await import('@/utils/UtilsFactory.js');
      let resolveFirstI18n;
      let resolveSecondI18n;
      const firstI18n = new Promise(resolve => { resolveFirstI18n = resolve; });
      const secondI18n = new Promise(resolve => { resolveSecondI18n = resolve; });
      const i18n = { getTranslationString: vi.fn(() => Promise.resolve('message')) };
      utilsFactory.getI18nUtils
        .mockImplementationOnce(() => firstI18n)
        .mockImplementationOnce(() => secondI18n);

      const firstShow = manager.showNotification();
      manager.dismissNotification();
      const secondShow = manager.showNotification();

      resolveFirstI18n(i18n);
      await firstShow;
      expect(mockNotificationManager.show).not.toHaveBeenCalled();

      resolveSecondI18n(i18n);
      await secondShow;

      expect(mockNotificationManager.show).toHaveBeenCalledTimes(1);
      expect(manager.toastId).toBe(mockNotificationManager.show.mock.calls[0][3].id);
    });
  });

  describe('updateNotification', () => {
    it('should update notification when status is translating', async () => {
      await manager.showNotification();
      const toastId = manager.toastId;

      await manager.updateNotification({ status: 'translating' });

      expect(mockNotificationManager.update).toHaveBeenCalledWith(
        toastId,
        'Mocked_SELECT_ELEMENT_TRANSLATING',
        {
          actions: [
            {
              label: 'Mocked_SELECT_ELEMENT_CANCEL',
              onClick: expect.any(Function),
            },
          ],
          id: toastId,
          persistent: true,
          type: 'status',
        }
      );
    });

    it('should update notification with progress when status is translating', async () => {
      await manager.showNotification();
      const toastId = manager.toastId;

      await manager.updateNotification({
        status: 'translating',
        progress: { completed: 2, total: 5, isRequestProgress: true }
      });

      expect(mockNotificationManager.update).toHaveBeenCalledWith(
        toastId,
        'Mocked_SELECT_ELEMENT_TRANSLATING (2/5)...',
        {
          actions: [
            {
              label: 'Mocked_SELECT_ELEMENT_CANCEL',
              onClick: expect.any(Function),
            },
          ],
          id: toastId,
          persistent: true,
          type: 'status',
        }
      );
    });

    it('should handle null data gracefully', async () => {
      await manager.showNotification();
      // Should not throw
      await manager.updateNotification(null);
      expect(mockNotificationManager.update).not.toHaveBeenCalled();
    });

    it('does not let a stale asynchronous update modify a newer toast', async () => {
      await manager.showNotification();
      const { utilsFactory } = await import('@/utils/UtilsFactory.js');
      let resolveI18n;
      const delayedI18n = new Promise(resolve => { resolveI18n = resolve; });
      utilsFactory.getI18nUtils.mockImplementationOnce(() => delayedI18n);

      const staleUpdate = manager.updateNotification({ status: 'translating' });
      await Promise.resolve();
      await manager.showNotification();
      const currentToastId = manager.toastId;

      resolveI18n({ getTranslationString: vi.fn(() => Promise.resolve('message')) });
      await staleUpdate;

      expect(mockNotificationManager.update).not.toHaveBeenCalled();
      expect(manager.toastId).toBe(currentToastId);
    });
  });

  describe('dismissNotification', () => {
    it('should call notificationManager.dismiss', () => {
      manager.toastId = 'toast-to-dismiss';
      manager.toastGeneration = manager.notificationGeneration;
      manager.isStatusToast = true;
      
      manager.dismissNotification();
      
      expect(mockNotificationManager.dismiss).toHaveBeenCalledWith('toast-to-dismiss');
      expect(manager.toastId).toBeNull();
    });
  });

  describe('showInfoNotification', () => {
    it('should not show if not in top frame', () => {
      const originalWindow = global.window;
      global.window = { top: {} }; // window !== window.top

      manager.showInfoNotification({ message: 'msg' });

      expect(mockNotificationManager.show).not.toHaveBeenCalled();

      global.window = originalWindow;
    });

    it('should replace any existing toast and show an informational message', () => {
      manager.toastId = 'progress-toast';
      manager.toastGeneration = manager.notificationGeneration;
      manager.isStatusToast = true;

      manager.showInfoNotification({ message: 'no content message' });

      expect(mockNotificationManager.dismiss).toHaveBeenCalledWith('progress-toast');
      expect(manager.toastId).toBeNull();
      expect(mockNotificationManager.show).toHaveBeenCalledWith(
        'no content message',
        'info',
        4000,
        { id: expect.stringMatching(/^select-element-toast-\d+$/) }
      );
    });

    it('clears status ownership so stale progress cannot update an info notification', async () => {
      await manager.showNotification();

      manager.showInfoNotification({ message: 'no content message' });
      await manager.updateNotification({ status: 'translating' });

      expect(manager.toastId).toBeNull();
      expect(mockNotificationManager.update).not.toHaveBeenCalled();
    });

    it('should fall back to a default message when data is missing', () => {
      manager.showInfoNotification(null);

      expect(mockNotificationManager.show).toHaveBeenCalledWith(
        'No translatable text was found in this element.',
        'info',
        4000,
        expect.anything()
      );
    });
  });

  describe('cleanup', () => {
    it('should dismiss and reset state', async () => {
      manager.toastId = 'active-toast';
      await manager.cleanup();
      
      expect(mockNotificationManager.dismiss).toHaveBeenCalledWith('active-toast');
      expect(manager.isInitialized).toBe(false);
    });
  });
});

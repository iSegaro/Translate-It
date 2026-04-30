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
    mockNotificationManager = {
      showStatus: vi.fn(() => 'test-toast-id'),
      update: vi.fn(),
      dismiss: vi.fn()
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
    });
  });

  describe('showNotification', () => {
    it('should not show if not in top frame', async () => {
      // Mock window.top comparison
      const originalWindow = global.window;
      global.window = { top: {} }; // window !== window.top
      
      await manager.showNotification();
      expect(mockNotificationManager.showStatus).not.toHaveBeenCalled();
      
      global.window = originalWindow;
    });

    it('should show desktop message when not mobile', async () => {
      deviceDetector.isMobile.mockReturnValue(false);
      
      await manager.showNotification();
      
      expect(mockNotificationManager.showStatus).toHaveBeenCalledWith(
        'Mocked_SELECT_ELEMENT_MODE_ACTIVATED',
        expect.objectContaining({ id: 'select-element-toast' })
      );
    });

    it('should show mobile message when on mobile', async () => {
      deviceDetector.isMobile.mockReturnValue(true);
      
      await manager.showNotification();
      
      expect(mockNotificationManager.showStatus).toHaveBeenCalledWith(
        'Mocked_SELECT_ELEMENT_MODE_ACTIVATED_MOBILE',
        expect.anything()
      );
    });
  });

  describe('updateNotification', () => {
    it('should update notification when status is translating', async () => {
      manager.toastId = 'existing-toast';
      
      await manager.updateNotification({ status: 'translating' });
      
      expect(mockNotificationManager.update).toHaveBeenCalledWith(
        'existing-toast',
        'Mocked_SELECT_ELEMENT_TRANSLATING',
        expect.anything()
      );
    });
  });

  describe('dismissNotification', () => {
    it('should call notificationManager.dismiss', () => {
      manager.toastId = 'toast-to-dismiss';
      
      manager.dismissNotification();
      
      expect(mockNotificationManager.dismiss).toHaveBeenCalledWith('toast-to-dismiss');
      expect(manager.toastId).toBeNull();
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

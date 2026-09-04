import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

const registry = vi.hoisted(() => {
  const authorities = new Map();
  const compatibilityFrames = new Map();
  const provisionalFrames = new Map();
  const getParticipants = vi.fn(tabId => new Map(authorities.get(tabId)?.participants || []));
    const getCurrentGeneration = vi.fn(tabId => authorities.get(tabId)?.generation);
  const removeParticipant = vi.fn((tabId, frameId, generation) => {
    const authority = authorities.get(tabId);
    if (
      !authority
      || authority.participants.get(frameId) !== generation
    ) {
      return false;
    }

    authority.participants.delete(frameId);
    return true;
  });

    return {
      authorities,
      compatibilityFrames,
      compensateInvalidatedActivationAttempts: vi.fn(() => Promise.resolve([])),
      getActivationEpoch: vi.fn(() => 'epoch-1'),
      getCompatibilityFrames: vi.fn(tabId => new Map(compatibilityFrames.get(tabId) || [])),
      provisionalFrames,
      getProvisionalCleanupFrames: vi.fn(tabId => [...(provisionalFrames.get(tabId) || [])]),
      getParticipants,
      getCurrentGeneration,
    invalidateActivationAttempts: vi.fn(() => []),
      removeCompatibilityFrame: vi.fn((tabId, frameId) => compatibilityFrames.get(tabId)?.delete(frameId) || false),
      removeProvisionalCleanupFrame: vi.fn((tabId, frameId, generation) => {
        const frames = provisionalFrames.get(tabId) || [];
        provisionalFrames.set(tabId, frames.filter(frame => (
          frame.frameId !== frameId || frame.generation !== generation
        )));
        return true;
      }),
    removeParticipant,
    setStateForTab: vi.fn(),
    invalidateJoinAuthority: vi.fn(),
    isFrameDocumentLive: vi.fn(async (tabId, frameId, documentId) => {
      const frames = await browser.webNavigation.getAllFrames({ tabId });
      if (!Array.isArray(frames)) return true;
      if (typeof documentId === 'string' && documentId.trim()) {
        return frames.some(f => f?.frameId === frameId && f?.documentId === documentId);
      }
      return frames.some(f => f?.frameId === frameId);
    }),
    isStructurallyNonInjectableFrame: vi.fn(() => false),
    queryFrameStateWithKind: vi.fn(async () => {
      return { kind: 'UNKNOWN', state: null };
    }),
    getParticipantsWithDocuments: vi.fn(tabId => {
      const auth = authorities.get(tabId);
      if (!auth) return new Map();
      return new Map([...auth.participants.entries()].map(([fid, gen]) => [fid, { generation: gen, documentId: null }]));
    }),
    isValidDocumentId: vi.fn(v => typeof v === 'string' && v.trim().length > 0),
    getStateForTab: vi.fn(() => ({ active: false })),
    FrameStateKind: { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', NO_RECEIVER: 'NO_RECEIVER', UNKNOWN: 'UNKNOWN' },
  };
});

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn(() => Promise.resolve())
    },
    webNavigation: {
      getAllFrames: vi.fn(() => Promise.resolve([]))
    }
  }
}));

vi.mock('./selectElementStateManager.js', () => ({
  compensateInvalidatedActivationAttempts: registry.compensateInvalidatedActivationAttempts,
  getActivationEpoch: registry.getActivationEpoch,
  getCompatibilityFrames: registry.getCompatibilityFrames,
  getProvisionalCleanupFrames: registry.getProvisionalCleanupFrames,
  setStateForTab: registry.setStateForTab,
  getParticipants: registry.getParticipants,
  getParticipantsWithDocuments: registry.getParticipantsWithDocuments,
  getCurrentGeneration: registry.getCurrentGeneration,
  invalidateActivationAttempts: registry.invalidateActivationAttempts,
  removeCompatibilityFrame: registry.removeCompatibilityFrame,
  removeProvisionalCleanupFrame: registry.removeProvisionalCleanupFrame,
  removeParticipant: registry.removeParticipant,
  isValidDocumentId: registry.isValidDocumentId,
  getStateForTab: registry.getStateForTab,
  isFrameDocumentLive: registry.isFrameDocumentLive,
  isStructurallyNonInjectableFrame: registry.isStructurallyNonInjectableFrame,
  queryFrameStateWithKind: registry.queryFrameStateWithKind,
  FrameStateKind: registry.FrameStateKind,
  invalidateJoinAuthority: registry.invalidateJoinAuthority,
  markDeactivationPending: vi.fn(),
  clearDeactivationPending: vi.fn(),
  isDeactivationPending: vi.fn(() => false),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    operation: vi.fn()
  }))
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE'
  }
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { CONTENT: 'CONTENT' },
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context }))
  }
}));

import { handleDeactivateSelectElementMode } from './handleDeactivateSelectElementMode.js';
import { setStateForTab } from './selectElementStateManager.js';

describe('handleDeactivateSelectElementMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.authorities.clear();
    registry.compatibilityFrames.clear();
    registry.provisionalFrames.clear();
    registry.invalidateActivationAttempts.mockReturnValue([]);
    registry.compensateInvalidatedActivationAttempts.mockResolvedValue([]);
    browser.tabs.sendMessage.mockResolvedValue({
      success: true,
      cleanupCompleted: true,
      activated: false,
    });
    browser.webNavigation.getAllFrames.mockResolvedValue([]);
  });

  it('should deactivate every registered participant before publishing inactive state', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 1,
      participants: new Map([[0, 1], [3, 1]]),
    });
    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(123, false);
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        action: 'DEACTIVATE_SELECT_ELEMENT_MODE',
        data: expect.objectContaining({
          active: false,
          fromBackground: true,
          activationEpoch: 'epoch-1',
          activationGeneration: 1,
          isExplicitDeactivation: true,
        }),
      }),
      { frameId: 0 },
    );
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.anything(),
      { frameId: 3 },
    );
  });

  it('should not publish inactive state when a participant remains unresolved', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 1,
      participants: new Map([[0, 1]]),
    });
    browser.tabs.sendMessage.mockResolvedValue({ success: true, activated: false });
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }]);

    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response).toEqual({
      success: false,
      error: 'Could not deactivate Select Element mode.',
    });
    expect(setStateForTab).not.toHaveBeenCalledWith(123, false);
  });

  it('should retire a rejected participant when frame disappeared', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 1,
      participants: new Map([[0, 1], [3, 1]]),
    });
    browser.tabs.sendMessage.mockImplementation((_tabId, _message, { frameId }) => {
      if (frameId === 3) return Promise.reject(new Error('Frame closed'));
      return Promise.resolve({ success: true, cleanupCompleted: true, activated: false });
    });
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }]);

    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(123, false);
    expect(registry.removeParticipant).toHaveBeenCalledWith(123, 3, 1);
  });

  it('should not retire a rejected participant while frame still exists', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 1,
      participants: new Map([[3, 1]]),
    });
    browser.tabs.sendMessage.mockRejectedValue(new Error('Connection closed'));
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 3 }]);

    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response.success).toBe(false);
    expect(setStateForTab).not.toHaveBeenCalledWith(123, false);
  });

  it('targets each participant with its own generation after partial reactivation', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 2,
      participants: new Map([[0, 2], [3, 1]]),
    });

    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ data: expect.objectContaining({ activationGeneration: 2 }) }),
      { frameId: 0 },
    );
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ data: expect.objectContaining({ activationGeneration: 1 }) }),
      { frameId: 3 },
    );
    expect(setStateForTab).toHaveBeenCalledWith(123, false);
  });

  it('does not let stale deactivation settle over newer activation ownership', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 1,
      participants: new Map([[0, 1]]),
    });

    let resolveCleanup;
    browser.tabs.sendMessage.mockReturnValue(new Promise(resolve => {
      resolveCleanup = resolve;
    }));

    const pendingDeactivation = handleDeactivateSelectElementMode(message, {});
    await Promise.resolve();
    registry.authorities.set(123, {
      generation: 2,
      participants: new Map([[0, 2]]),
    });
    resolveCleanup({ success: true, cleanupCompleted: true, activated: false });

    const response = await pendingDeactivation;

    expect(response.success).toBe(false);
    expect(registry.authorities.get(123).participants).toEqual(new Map([[0, 2]]));
    expect(setStateForTab).not.toHaveBeenCalledWith(123, false);
  });

  it('does not retire newer ownership when stale frame disappearance is observed', async () => {
    const message = { data: { tabId: 123 } };
    registry.authorities.set(123, {
      generation: 1,
      participants: new Map([[0, 1]]),
    });
    browser.tabs.sendMessage.mockImplementation(async () => {
      registry.authorities.set(123, {
        generation: 2,
        participants: new Map([[0, 2]]),
      });
      throw new Error('Frame closed');
    });
    browser.webNavigation.getAllFrames.mockResolvedValue([]);

    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response.success).toBe(false);
    expect(registry.authorities.get(123).participants).toEqual(new Map([[0, 2]]));
    expect(setStateForTab).not.toHaveBeenCalledWith(123, false);
  });

  it('should return error if no tabId', async () => {
    const response = await handleDeactivateSelectElementMode({}, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('No tabId available');
  });

  it('invalidates pending activation attempts even with no participants', async () => {
    const response = await handleDeactivateSelectElementMode({ data: { tabId: 124 } }, {});

    expect(response.success).toBe(true);
    expect(registry.invalidateActivationAttempts).toHaveBeenCalledWith(124);
    expect(setStateForTab).toHaveBeenCalledWith(124, false);
  });

  it('compensates provisional frames from invalidated activation attempts', async () => {
    const invalidatedAttempts = [{ generation: 1, frameIds: [0, 3] }];
    registry.invalidateActivationAttempts.mockReturnValue(invalidatedAttempts);

    const response = await handleDeactivateSelectElementMode({ data: { tabId: 125 } }, {});

    expect(response.success).toBe(true);
    expect(registry.compensateInvalidatedActivationAttempts).toHaveBeenCalledWith(
      125,
      invalidatedAttempts,
    );
    expect(setStateForTab).toHaveBeenCalledWith(125, false);
  });

  it('blocks inactive publication when a live provisional frame rejects cleanup', async () => {
    registry.invalidateActivationAttempts.mockReturnValue([{ generation: 1, frameIds: [0] }]);
    registry.compensateInvalidatedActivationAttempts.mockResolvedValue([
      { generation: 1, frameId: 0, settled: false, response: { success: false } },
    ]);
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }]);

    const response = await handleDeactivateSelectElementMode({ data: { tabId: 126 } }, {});

    expect(response.success).toBe(false);
    expect(setStateForTab).not.toHaveBeenCalledWith(126, false);
  });

  it('treats a disappeared provisional frame as settled after transport failure', async () => {
    registry.invalidateActivationAttempts.mockReturnValue([{ generation: 1, frameIds: [0] }]);
    registry.compensateInvalidatedActivationAttempts.mockResolvedValue([
      { generation: 1, frameId: 0, settled: false, error: new Error('Frame closed') },
    ]);
    browser.webNavigation.getAllFrames.mockResolvedValue([]);

    const response = await handleDeactivateSelectElementMode({ data: { tabId: 127 } }, {});

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(127, false);
  });

  it('cleans compatibility-owned frames before reporting completion', async () => {
    registry.compatibilityFrames.set(128, new Map([[0, 1]]));
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }]);

    const response = await handleDeactivateSelectElementMode({ data: { tabId: 128 } }, {});

    expect(response.success).toBe(true);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      128,
      expect.objectContaining({ data: expect.objectContaining({ activationGeneration: 1 }) }),
      { frameId: 0 },
    );
    expect(registry.removeCompatibilityFrame).toHaveBeenCalledWith(128, 0);
  });

  it('blocks inactive publication while a live persisted provisional frame remains', async () => {
    registry.provisionalFrames.set(129, [{ frameId: 3, generation: 1 }]);
    registry.compensateInvalidatedActivationAttempts.mockResolvedValue([
      { generation: 1, frameId: 3, settled: false, response: { success: false } },
    ]);
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 3 }]);

    const response = await handleDeactivateSelectElementMode({ data: { tabId: 129 } }, {});

    expect(response.success).toBe(false);
    expect(setStateForTab).not.toHaveBeenCalledWith(129, false);
  });
});

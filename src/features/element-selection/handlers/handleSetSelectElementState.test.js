import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(() => Promise.resolve()) },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
    },
    webNavigation: {
      onCommitted: { addListener: vi.fn() },
    },
  },
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

import { handleSetSelectElementState } from './handleSetSelectElementState.js';
import { clearStateForTab, getStateForTab, setStateForTab } from './selectElementStateManager.js';

describe('handleSetSelectElementState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStateForTab(789);
    clearStateForTab(101);
  });

  it('should acknowledge state reports from sender without changing authority', async () => {
    const message = { data: { activate: true } };
    const sender = { tab: { id: 123 } };
    
    const response = await handleSetSelectElementState(message, sender);

    expect(response.success).toBe(true);
    expect(response).toMatchObject({ tabId: 123, active: true });
    expect(getStateForTab(123).active).toBe(false);
  });

  it('should use canonical active when both state fields are present', async () => {
    const response = await handleSetSelectElementState({
      data: { active: false, activate: true, tabId: 321 },
    }, {});

    expect(response).toMatchObject({ success: true, tabId: 321, active: false });
  });

  it('should accept legacy activate only when active is absent', async () => {
    const response = await handleSetSelectElementState({
      data: { activate: true, tabId: 654 },
    }, {});

    expect(response).toMatchObject({ success: true, tabId: 654, active: true });
  });

  it('should acknowledge state for a tab from data tabId', async () => {
    const message = { data: { activate: false, tabId: 456 } };
    
    const response = await handleSetSelectElementState(message, {});

    expect(response.success).toBe(true);
    expect(response).toMatchObject({ tabId: 456, active: false });
  });

  it('should not clear authoritative state for explicit deactivation reports', async () => {
    const message = { data: { activate: false, tabId: 789, isExplicitDeactivation: true } };

    setStateForTab(789, true);
    await handleSetSelectElementState(message, {});

    expect(getStateForTab(789).active).toBe(true);
  });

  it('should return error if no tabId', async () => {
    const response = await handleSetSelectElementState({ data: { activate: true } }, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('No tabId available');
  });

  it('should not establish active authority for a report', async () => {
    const response = await handleSetSelectElementState({ data: { activate: true, tabId: 1 } }, {});
    expect(response).toEqual({ success: true, tabId: 1, active: true });
    expect(getStateForTab(1).active).toBe(false);
  });
});

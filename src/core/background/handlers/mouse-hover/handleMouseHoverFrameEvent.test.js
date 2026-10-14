import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { handleMouseHoverFrameEvent, handleMouseHoverFrameFeedback } from './handleMouseHoverFrameEvent.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    webNavigation: { getFrame: vi.fn() },
    tabs: { sendMessage: vi.fn() },
  },
}));

describe('trusted mouse hover frame relay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browser.webNavigation.getFrame.mockResolvedValue({ parentFrameId: 0 });
    browser.tabs.sendMessage.mockResolvedValue({ success: true });
  });

  const ready = { type: 'MOUSE_HOVER_TRANSLATION_READY', detail: { hoverId: 'h1', translatedText: 'text', position: { x: 2, y: 3 } } };

  it('relays only a verified direct child event to the top frame with background frame identity', async () => {
    const result = await handleMouseHoverFrameEvent({ action: MessageActions.MOUSE_HOVER_FRAME_EVENT, data: ready }, { tab: { id: 3 }, frameId: 7 });
    expect(result).toEqual({ success: true });
    expect(browser.webNavigation.getFrame).toHaveBeenCalledWith({ tabId: 3, frameId: 7 });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(3, expect.objectContaining({ data: expect.objectContaining({ frameId: 7, type: ready.type }) }), { frameId: 0 });
  });

  it('accepts a valid top-frame event without frame lookup', async () => {
    const result = await handleMouseHoverFrameEvent({ data: ready }, { tab: { id: 3 }, frameId: 0 });
    expect(result).toEqual({ success: true });
    expect(browser.webNavigation.getFrame).not.toHaveBeenCalled();
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(3, expect.objectContaining({ data: expect.objectContaining({ frameId: 0 }) }), { frameId: 0 });
  });

  it('preserves long streaming READY text and existing metadata', async () => {
    const detail = { ...ready.detail, originalText: 'original', translatedText: 'x'.repeat(25_000), direction: 'rtl', isStreaming: true };
    await handleMouseHoverFrameEvent({ data: { type: ready.type, detail } }, { tab: { id: 3 }, frameId: 7 });
    expect(browser.tabs.sendMessage.mock.calls[0][1].data.detail).toEqual(detail);
  });

  it('preserves canonical serialized error fields', async () => {
    const errorDetails = {
      message: 'provider failed', type: 'API_ERROR', originalType: 'ProviderError', statusCode: 503,
      context: 'hover', providerName: 'provider', providerId: 'p1', code: 'E1', errorCode: 4,
      operationAborted: false, cancellationReason: 'none', translationOutcome: { retryable: true },
    };
    await handleMouseHoverFrameEvent({ data: { type: 'MOUSE_HOVER_TRANSLATION_ERROR', detail: { hoverId: 'h1', error: 'provider failed', errorDetails } } }, { tab: { id: 3 }, frameId: 7 });
    expect(browser.tabs.sendMessage.mock.calls[0][1].data.detail.errorDetails).toEqual(errorDetails);
  });

  it('relays a pre-READY error only with the verified direct-child frame identity', async () => {
    const errorDetails = { message: 'Hover failed', type: 'API_ERROR', statusCode: 503 };
    await handleMouseHoverFrameEvent({ data: { type: 'MOUSE_HOVER_TRANSLATION_ERROR', detail: { hoverId: 'error-first', error: errorDetails.message, errorDetails, frameId: 99 } } }, { tab: { id: 3 }, frameId: 7 });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(3, expect.objectContaining({
      data: expect.objectContaining({
        frameId: 7,
        detail: expect.objectContaining({ hoverId: 'error-first', errorDetails }),
      }),
    }), { frameId: 0 });
  });

  it('rejects nested, unknown, and malformed senders without relaying', async () => {
    browser.webNavigation.getFrame.mockResolvedValueOnce({ parentFrameId: 1 });
    expect(await handleMouseHoverFrameEvent({ data: ready }, { tab: { id: 3 }, frameId: 7 })).toMatchObject({ success: false });
    expect(await handleMouseHoverFrameEvent({ data: { ...ready, type: 'UNSUPPORTED' } }, { tab: { id: 3 }, frameId: 7 })).toMatchObject({ success: false });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('relays only minimal feedback to the exact verified child frame', async () => {
    const result = await handleMouseHoverFrameFeedback({ data: { targetFrameId: 7, hoverId: 'h1', state: 'enter', translatedText: 'secret' } }, { tab: { id: 3 }, frameId: 0 });
    expect(result).toEqual({ success: true });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(3, { action: MessageActions.MOUSE_HOVER_FRAME_FEEDBACK, data: { hoverId: 'h1', state: 'enter' } }, { frameId: 7 });
    expect(JSON.stringify(browser.tabs.sendMessage.mock.calls[0][1])).not.toContain('secret');
  });
});

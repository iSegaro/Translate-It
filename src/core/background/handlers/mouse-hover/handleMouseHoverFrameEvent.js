import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat, isStructuredTranslationError } from '@/shared/messaging/core/MessagingCore.js';

const HOVER_EVENTS = new Set([
  'MOUSE_HOVER_TRANSLATION_READY',
  'MOUSE_HOVER_TRANSLATION_ERROR',
  'MOUSE_HOVER_HIDE_TOOLTIP',
]);
const HOVER_FEEDBACK_STATES = new Set(['enter', 'leave', 'hidden']);
const MAX_HOVER_ID_LENGTH = 160;
const MAX_TEXT_LENGTH = 1_000_000;

function validHoverId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_HOVER_ID_LENGTH;
}

function projectHoverEvent({ type, detail }) {
  if (!HOVER_EVENTS.has(type) || !detail || typeof detail !== 'object') return null;
  if (!validHoverId(detail.hoverId)) return null;
  if (type === 'MOUSE_HOVER_TRANSLATION_READY') {
    if (typeof detail.translatedText !== 'string' || detail.translatedText.length > MAX_TEXT_LENGTH) return null;
    if (detail.originalText !== undefined && (typeof detail.originalText !== 'string' || detail.originalText.length > MAX_TEXT_LENGTH)) return null;
    if (detail.direction !== undefined && (typeof detail.direction !== 'string' || detail.direction.length > 32)) return null;
    const position = detail.position;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
    return {
      hoverId: detail.hoverId,
      ...(detail.originalText !== undefined ? { originalText: detail.originalText } : {}),
      translatedText: detail.translatedText,
      position: { x: position.x, y: position.y },
      ...(detail.direction !== undefined ? { direction: detail.direction } : {}),
      isStreaming: detail.isStreaming === true,
    };
  }
  if (type === 'MOUSE_HOVER_TRANSLATION_ERROR') {
    const error = typeof detail.error === 'string' ? detail.error.slice(0, 1000) : '';
    const errorDetails = isStructuredTranslationError(detail.errorDetails)
      ? MessageFormat.serializeTranslationError(detail.errorDetails)
      : undefined;
    return { hoverId: detail.hoverId, error, ...(errorDetails ? { errorDetails } : {}) };
  }
  return { hoverId: detail.hoverId };
}

export async function handleMouseHoverFrameEvent(message, sender) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId < 0) return { success: false, error: 'Invalid hover sender' };
  if (!browser.webNavigation?.getFrame || !browser.tabs?.sendMessage) return { success: false, error: 'Frame verification unavailable' };

  const event = projectHoverEvent(message?.data);
  if (!event) return { success: false, error: 'Invalid hover event' };

  try {
    if (frameId === 0) {
      await browser.tabs.sendMessage(tabId, { action: MessageActions.MOUSE_HOVER_FRAME_EVENT, data: { frameId, ...message.data, detail: event } }, { frameId: 0 });
      return { success: true };
    }
    const frame = await browser.webNavigation.getFrame({ tabId, frameId });
    if (!frame || frame.parentFrameId !== 0) return { success: false, error: 'Only direct child frames are supported' };
    await browser.tabs.sendMessage(tabId, { action: MessageActions.MOUSE_HOVER_FRAME_EVENT, data: { frameId, type: message.data.type, detail: event } }, { frameId: 0 });
    return { success: true };
  } catch {
    return { success: false, error: 'Hover relay failed' };
  }
}

export async function handleMouseHoverFrameFeedback(message, sender) {
  const tabId = sender?.tab?.id;
  const targetFrameId = message?.data?.targetFrameId;
  const hoverId = message?.data?.hoverId;
  const state = message?.data?.state;
  if (!Number.isInteger(tabId) || sender?.frameId !== 0 || !Number.isInteger(targetFrameId) || targetFrameId <= 0 || !validHoverId(hoverId) || !HOVER_FEEDBACK_STATES.has(state)) {
    return { success: false, error: 'Invalid hover feedback' };
  }
  if (!browser.webNavigation?.getFrame || !browser.tabs?.sendMessage) return { success: false, error: 'Frame verification unavailable' };
  try {
    const frame = await browser.webNavigation.getFrame({ tabId, frameId: targetFrameId });
    if (!frame || frame.parentFrameId !== 0) return { success: false, error: 'Only direct child frames are supported' };
    await browser.tabs.sendMessage(tabId, {
      action: MessageActions.MOUSE_HOVER_FRAME_FEEDBACK,
      data: { hoverId, state },
    }, { frameId: targetFrameId });
    return { success: true };
  } catch {
    return { success: false, error: 'Hover feedback relay failed' };
  }
}

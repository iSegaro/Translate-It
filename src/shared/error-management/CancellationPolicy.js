import { ErrorTypes } from './ErrorTypes.js';
import { ActionReasons } from '@/shared/messaging/core/MessagingConstants.js';

const USER_CANCELLATION_REASONS = new Set([
  ErrorTypes.USER_CANCELLED,
  ActionReasons.USER_CANCELLED,
  'user-cancelled',
  'user-cancel',
  'User cancelled',
  'User clicked stop',
  ActionReasons.ESC_KEY_PRESSED,
  ActionReasons.USER_STOPPED_PAGE_TRANSLATION,
]);

export function isUserCancellationReason(reason) {
  return USER_CANCELLATION_REASONS.has(reason);
}

export function normalizeOperationAbortReason(reason) {
  return typeof reason === 'string' && reason ? reason : 'operation-abort';
}

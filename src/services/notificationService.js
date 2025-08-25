
import { toast } from 'vue-sonner';

/**
 * Maps our internal notification types to the corresponding vue-sonner functions.
 */
const toastMap = {
  error: toast.error,
  warning: toast.warning,
  success: toast.success,
  info: toast.info,
  status: toast.loading, // 'status' from the old manager maps best to 'loading'
  revert: toast, // 'revert' can be a default toast with a specific icon if needed
};

/**
 * Shows a notification using vue-sonner.
 *
 * @param {string} message The message to display.
 * @param {('error'|'warning'|'success'|'info'|'status'|'revert')} [type='info'] The type of notification.
 * @param {boolean} [auto=true] (Note: vue-sonner handles auto-dismissal by default via duration).
 * @param {number|null} [duration=null] The duration in ms for the toast to be visible.
 * @param {Function|null} [onClick=null] A callback function to execute when the toast is clicked.
 * @returns {number|string} The ID of the toast, which can be used to dismiss it programmatically.
 */
const show = (message, type = 'info', auto = true, duration = null, onClick = null, id = null) => {
  const toastFn = toastMap[type] || toast.info;

  const options = {};
  if (id) {
    options.id = id;
  }
  if (duration) {
    options.duration = duration;
  }

  if (onClick) {
    options.onClick = () => {
      onClick();
    };
  }

  // For 'revert', we could add a custom icon if desired, but we'll keep it simple for now.
  // Example: if (type === 'revert') { options.icon = '↩️'; }

  const toastId = toastFn(message, options);
  return toastId;
};

/**
 * Dismisses a specific toast by its ID.
 * @param {number|string} toastId The ID of the toast to dismiss.
 */
const dismiss = (toastId) => {
  toast.dismiss(toastId);
};

/**
 * Dismisses all currently visible toasts.
 */
const dismissAll = () => {
  toast.dismiss();
};

export const notificationService = {
  show,
  dismiss,
  dismissAll,
};

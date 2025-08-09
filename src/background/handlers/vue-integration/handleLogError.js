// Handler for logging errors from Vue apps
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handleLogError');

const errorHandler = new ErrorHandler();

export async function handleLogError(message) {
  try {
    const { error, context, info } = message.data;
    const errorMessage = error?.message || String(error) || "Unknown error";
    const errorInfo = info ? String(info) : "(no info)";
    logger.warn(`[${context}] Vue Error:`, errorMessage, errorInfo);

    // In production, you might want to send to a logging service
    // For now, just log to console and return success
    return {
      success: true,
      data: {
        success: true,
        logged: true,
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.LOGGING,
      context: "handleLogError",
      messageData: message.data,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}
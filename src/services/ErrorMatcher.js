// src/services/ErrorMatcher.js

import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "./ErrorTypes.js";

/**
 * Determines the error type for a given error object or message.
 * Priority:
 *   1. Explicit error.type property
 *   2. statusCode property (HTTP 4xx/5xx)
 *   3. HTTP status codes in raw message via regex
 *   4. Known string patterns
 *   5. Unknown
 * @param {Error|string} rawOrError
 * @returns {string} One of ErrorTypes
 */
export function matchErrorToType(rawOrError = "") {
  // 1. If a string exactly matches an ErrorTypes key, return it
  if (typeof rawOrError === "string") {
    const rawKey = rawOrError.trim();
    if (Object.values(ErrorTypes).includes(rawKey)) {
      return rawKey;
    }
  }

  // 2. If object with type property, use it
  if (rawOrError && typeof rawOrError === "object") {
    if (rawOrError.type) {
      return rawOrError.type;
    }
    // 3. If statusCode numeric between 400-599, HTTP error
    const code = rawOrError.statusCode;
    if (typeof code === "number" && code >= 400 && code < 600) {
      return ErrorTypes.HTTP_ERROR;
    }
  }

  const msg = String(rawOrError).toLowerCase().trim();

  // 4. Quick HTTP codes in message
  if (/\b(403|404|500|502|503|504)\b/.test(msg)) {
    return ErrorTypes.HTTP_ERROR;
  }

  // 5. Common string-based matching
  if (msg.includes("text is empty")) return ErrorTypes.TEXT_EMPTY;
  if (msg.includes("prompt is invalid")) return ErrorTypes.PROMPT_INVALID;
  if (msg.includes("text is too long") || msg.includes("too long"))
    return ErrorTypes.TEXT_TOO_LONG;
  if (msg.includes("translation not found"))
    return ErrorTypes.TRANSLATION_NOT_FOUND;
  if (msg.includes("translation failed")) return ErrorTypes.TRANSLATION_FAILED;

  // API Key issues
  if (
    msg.includes("wrong api key") ||
    msg.includes("api key not valid") ||
    msg.includes("no auth credentials") ||
    msg.includes("incorrect api key provided")
  )
    return ErrorTypes.API_KEY_INVALID;
  if (msg.includes("api key is missing") || msg.includes("key missing"))
    return ErrorTypes.API_KEY_MISSING;

  // API URL or model errors
  if (msg.includes("api url") && msg.includes("missing"))
    return ErrorTypes.API_URL_MISSING;
  if (
    msg.includes("not a valid model id") ||
    msg.includes("invalid model") ||
    msg.includes("model not found") ||
    msg.includes("model is missing") ||
    msg.includes("model not available") ||
    (msg.includes("the model `") &&
      msg.includes("does not exist or you do not have access to it"))
  )
    return ErrorTypes.MODEL_MISSING;

  // Quota with region indicates Gemini-specific quota
  if (msg.includes("quota exceeded") && msg.includes("region")) {
    logME(
      "[ErrorMatcher] Quota exceeded with region, indicating Gemini-specific quota."
    );
    return ErrorTypes.GEMINI_QUOTA_REGION;
  }

  // Quota
  if (msg.includes("quota exceeded") || msg.includes("gemini quota"))
    return ErrorTypes.QUOTA_EXCEEDED;

  // Network issues
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network failure") ||
    msg.includes("connection failed") ||
    msg.includes("networkerror") ||
    msg.includes("networkerror when attempting to fetch resource")
  )
    return ErrorTypes.NETWORK_ERROR;

  // HTTP generic fallback
  if (
    msg.includes("http error") ||
    msg.includes("http status") ||
    msg.includes("http response") ||
    msg.includes("operation was aborted") ||
    msg.includes("the operation was aborted.")
  )
    return ErrorTypes.HTTP_ERROR;

  // Context
  if (
    msg.includes("context") ||
    msg.includes("context invalid") ||
    msg.includes("extension context") ||
    msg.includes("context invalidated") ||
    msg.includes("extension context invalidated")
  )
    return ErrorTypes.CONTEXT;

  // Otherwise unknown
  return ErrorTypes.UNKNOWN;
}

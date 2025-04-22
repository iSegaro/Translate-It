// src/services/ErrorMatcher.js

import { ErrorTypes } from "./ErrorTypes.js";

export function matchErrorToType(rawMessage = "") {
  const msg = rawMessage.toLowerCase().trim();

  // اعتبارسنجی
  if (msg.includes("text is empty")) return ErrorTypes.TEXT_EMPTY;
  if (msg.includes("prompt is invalid")) return ErrorTypes.PROMPT_INVALID;
  if (msg.includes("text is too long") || msg.includes("too long"))
    return ErrorTypes.TEXT_TOO_LONG;
  if (msg.includes("translation not found"))
    return ErrorTypes.TRANSLATION_NOT_FOUND;
  if (msg.includes("translation failed")) return ErrorTypes.TRANSLATION_FAILED;

  // API Key
  if (
    msg.includes("wrong api key") ||
    msg.includes("api key not valid") ||
    msg.includes("no auth credentials") // اضافه‌شده
  )
    return ErrorTypes.API_KEY_INVALID;
  if (msg.includes("api key is missing") || msg.includes("key missing"))
    return ErrorTypes.API_KEY_MISSING;

  // API URL / مدل
  if (msg.includes("api url") && msg.includes("missing"))
    return ErrorTypes.API_URL_MISSING;
  if (
    msg.includes("not a valid model id") ||
    msg.includes("invalid model") ||
    msg.includes("model not found") ||
    msg.includes("model is missing")
  )
    return ErrorTypes.MODEL_MISSING;

  // Quota
  if (msg.includes("quota exceeded")) return ErrorTypes.QUOTA_EXCEEDED;
  if (msg.includes("gemini quota")) return ErrorTypes.GEMINI_QUOTA;

  // شبکه / سرور
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network failure") ||
    msg.includes("connection failed")
  )
    return ErrorTypes.NETWORK;

  // Context
  if (msg.includes("context invalid") || msg.includes("extension context"))
    return ErrorTypes.CONTEXT;

  return ErrorTypes.UNKNOWN;
}

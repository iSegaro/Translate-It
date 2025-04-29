// src/services/ErrorTypes.js

export class ErrorTypes {
  // سطوح عمومی که برای لاگ و تصمیم‌گیری استفاده می‌شوند
  static API = "API";
  static HTTP_ERROR = "HTTP_ERROR";
  static NETWORK_ERROR = "NETWORK_ERROR";
  static API_RESPONSE_INVALID = "API_RESPONSE_INVALID";
  static SERVICE = "SERVICE";
  static VALIDATION = "VALIDATION";
  static TAB_AVAILABILITY = "TAB";
  static CONTEXT = "CONTEXT";
  static UI = "UI";
  static INTEGRATION = "INTEGRATION";
  static UNKNOWN = "UNKNOWN";

  // کلیدهای اعتبارسنجی (همان errorKeys بدون پیشوند ERRORS_)
  static PROMPT_INVALID = "PROMPT_INVALID";
  static TEXT_EMPTY = "TEXT_EMPTY";
  static TEXT_TOO_LONG = "TEXT_TOO_LONG";
  static TRANSLATION_NOT_FOUND = "TRANSLATION_NOT_FOUND";
  static TRANSLATION_FAILED = "TRANSLATION_FAILED";

  // تنظیمات API
  static API_KEY_MISSING = "API_KEY_MISSING";
  static API_KEY_INVALID = "API_KEY_INVALID";
  static API_URL_MISSING = "API_URL_MISSING";
  static MODEL_MISSING = "MODEL_MISSING";
  static MODEL_OVERLOADED = "MODEL_OVERLOADED";
  static QUOTA_EXCEEDED = "QUOTA_EXCEEDED";
  static GEMINI_QUOTA_REGION = "GEMINI_QUOTA_REGION";
}

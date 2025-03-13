// src/utils/textDetection.js
import { CONFIG } from "../config.js";

export const isPersianText = (text) => {
  return CONFIG.PERSIAN_REGEX.test(text);
};

export const isRtlText = (text) => {
  return CONFIG.RTL_REGEX.test(text);
};

export const containsPersian = (text) => {
  return /[\u0600-\u06FF]/.test(text);
};

export const shouldApplyRtl = (text) => {
  return containsPersian(text) || isRtlText(text);
};

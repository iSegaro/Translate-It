/**
 * Newline Chunk Isolation
 * Shared Google-provider helper that isolates text items with meaningful
 * internal line breaks into their own translation chunks before provider-specific
 * multi-segment parsing.
 */

import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { getTextInfo } from "./TraditionalTextProcessor.js";

export const NEWLINE_REGEX = /\n+/;

/**
 * Detects whether a text contains a meaningful internal line break after
 * trimming layout-only whitespace from the edges.
 */
export const hasMeaningfulInternalNewline = (text) => {
  if (typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed.includes('\n')) return false;

  return /\S[^\n]*\n+[^\n]*\S/.test(trimmed);
};

const calculateChunkCharCount = (texts) => {
  const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;
  const textLength = texts.reduce((sum, item) => sum + getTextInfo(item).length, 0);
  return textLength + (Math.max(0, texts.length - 1) * delimiterLength);
};

export const isolateNewlineChunks = (chunks) => {
  const isolatedChunks = [];

  for (const chunk of chunks) {
    if (!chunk?.texts?.some(item => hasMeaningfulInternalNewline(getTextInfo(item).text))) {
      isolatedChunks.push(chunk);
      continue;
    }

    let currentTexts = [];

    const flushCurrent = () => {
      if (currentTexts.length === 0) return;
      isolatedChunks.push({
        ...chunk,
        texts: currentTexts,
        charCount: calculateChunkCharCount(currentTexts)
      });
      currentTexts = [];
    };

    for (const item of chunk.texts) {
      const info = getTextInfo(item);
      if (hasMeaningfulInternalNewline(info.text)) {
        flushCurrent();
        isolatedChunks.push({
          ...chunk,
          texts: [item],
          charCount: info.length
        });
        continue;
      }

      currentTexts.push(item);
    }

    flushCurrent();
  }

  return isolatedChunks;
};

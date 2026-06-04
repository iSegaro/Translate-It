/**
 * Paragraph Chunk Isolation
 * Shared Google-provider helper that isolates paragraph-bearing text items
 * into their own translation chunks before provider-specific multi-segment parsing.
 */

import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { getTextInfo } from "./TraditionalTextProcessor.js";

export const PARAGRAPH_BREAK_REGEX = /\n{2,}/;

const calculateChunkCharCount = (texts) => {
  const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;
  const textLength = texts.reduce((sum, item) => sum + getTextInfo(item).length, 0);
  return textLength + (Math.max(0, texts.length - 1) * delimiterLength);
};

export const isolateParagraphChunks = (chunks) => {
  const isolatedChunks = [];

  for (const chunk of chunks) {
    if (!chunk?.texts?.some(item => PARAGRAPH_BREAK_REGEX.test(getTextInfo(item).text))) {
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
      if (PARAGRAPH_BREAK_REGEX.test(info.text)) {
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

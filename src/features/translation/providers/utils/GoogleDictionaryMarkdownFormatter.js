import {
  getDictionaryShowPronunciationAsync,
  getDictionaryShowPosAsync,
  getDictionaryShowDefinitionsAsync,
  getDictionaryShowExamplesAsync
} from "@/shared/config/config.js";
import { getTranslationString } from "@/utils/i18n/i18n.js";

function escapeMarkdownLabel(label) {
  return String(label ?? "").replace(/[\\*_[\]()`]/g, "\\$&");
}

export async function formatGoogleDictionaryMarkdown(candidateData) {
  if (!candidateData) return "";

  const [showPronunciation, showPos, showDefinitions, showExamples] = await Promise.all([
    getDictionaryShowPronunciationAsync(),
    getDictionaryShowPosAsync(),
    getDictionaryShowDefinitionsAsync(),
    getDictionaryShowExamplesAsync()
  ]);

  const labelPronunciation = await getTranslationString('dict_pronunciation') || 'Pronunciation';
  const labelDefinitions = await getTranslationString('dict_definitions') || 'Definitions';
  const labelExamples = await getTranslationString('dict_examples') || 'Examples';

  const lines = typeof candidateData === "string"
    ? candidateData.trim().split("\n").filter((line) => line.trim() !== "")
    : [];

  let markdownOutput = "";

  if (typeof candidateData === "string") {
    if (lines.length === 0) return "";

    lines.forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const partOfSpeech = line.substring(0, colonIndex).trim();
        const terms = line.substring(colonIndex + 1).trim();

        if (showPos && partOfSpeech && terms) {
          markdownOutput += `**${escapeMarkdownLabel(partOfSpeech)}**: ${terms}\n`;
        }
      } else if (line.trim()) {
        markdownOutput += `${line.trim()}\n`;
      }
    });

    return markdownOutput.trim();
  }

  const data = candidateData;

  if (showPos && data.dict && Array.isArray(data.dict)) {
    data.dict.forEach((d) => {
      const pos = d.pos || "";
      const terms = d.terms || [];
      if (pos && terms.length > 0) {
        markdownOutput += `**${escapeMarkdownLabel(pos)}**: ${terms.join(", ")}\n`;
      }
    });
  }

  if (showPronunciation) {
    const pronunciation = data.sentences?.find((s) => s.src_translit)?.src_translit;
    if (pronunciation) {
      markdownOutput += `${markdownOutput ? "\n" : ""}**${escapeMarkdownLabel(labelPronunciation)}**: /${pronunciation}/\n`;
    }
  }

  if (showDefinitions && data.definitions && Array.isArray(data.definitions)) {
    if (markdownOutput) markdownOutput += "\n";
    markdownOutput += `**${escapeMarkdownLabel(labelDefinitions)}**:\n`;
    data.definitions.forEach((d) => {
      const pos = d.pos || "";
      const entries = d.entry || [];
      entries.forEach((entry) => {
        if (entry.gloss) {
          markdownOutput += `- ${pos ? `(${pos}) ` : ""}${entry.gloss}\n`;
        }
      });
    });
  }

  if (showExamples && data.examples?.example && Array.isArray(data.examples.example)) {
    if (markdownOutput) markdownOutput += "\n";
    markdownOutput += `**${escapeMarkdownLabel(labelExamples)}**:\n`;
    data.examples.example.slice(0, 5).forEach((ex) => {
      if (ex.text) {
        const cleanText = ex.text.replace(/<[^>]*>?/gm, "");
        markdownOutput += `- ${cleanText}\n`;
      }
    });
  }

  return markdownOutput.trim();
}

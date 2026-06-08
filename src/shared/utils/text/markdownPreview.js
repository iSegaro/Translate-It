import { marked } from "marked";
import DOMPurify from "dompurify";
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";

const LEGACY_PLAIN_LABEL_RE = /^[^:*#>`\-\s][^:]{0,80}:\s+\S+/;
const RTL_CHAR_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const NON_RTL_STRONG_CHAR_RE = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;

const countMatches = (text, regex) => (text.match(regex) || []).length;

const detectBlockDirection = (text, fallbackDir = "ltr") => {
  if (!text || typeof text !== "string") {
    return fallbackDir;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallbackDir;
  }

  const labelSeparatorIndex = normalized.indexOf(":");
  const hasLabelShape = labelSeparatorIndex > -1 && !normalized.includes("://");
  const candidateText = hasLabelShape
    ? normalized.slice(labelSeparatorIndex + 1).trim() || normalized
    : normalized;

  const rtlCount = countMatches(candidateText, RTL_CHAR_RE);
  const ltrCount = countMatches(candidateText, NON_RTL_STRONG_CHAR_RE);

  if (rtlCount === 0 && ltrCount === 0) {
    return fallbackDir;
  }

  if (hasLabelShape && candidateText !== normalized) {
    if (ltrCount > rtlCount) return "ltr";
    if (rtlCount > ltrCount) return "rtl";
    return fallbackDir;
  }

  if (ltrCount === 0) return "rtl";
  if (rtlCount === 0) return "ltr";

  if (ltrCount > rtlCount && (ltrCount - rtlCount >= 2 || ltrCount >= rtlCount * 1.5)) {
    return "ltr";
  }

  if (rtlCount > ltrCount && (rtlCount - ltrCount >= 2 || rtlCount >= ltrCount * 1.5)) {
    return "rtl";
  }

  if (/^[\u0590-\u08FF]/.test(normalized)) {
    return fallbackDir;
  }

  if (/^[A-Za-z\u00C0-\u024F]/.test(normalized)) {
    return "ltr";
  }

  return fallbackDir;
};

const applyBlockDirection = (element, fallbackDir) => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const direction = detectBlockDirection(element.textContent || "", fallbackDir);
  element.setAttribute("dir", direction);
};

const normalizeRenderedHtml = (html, wrapWithSimpleMarkdown = false, fallbackDir = "ltr") => {
  if (!html || typeof html !== "string") {
    return "";
  }

  const sanitizedHtml = DOMPurify.sanitize(html);
  if (!sanitizedHtml) {
    return "";
  }

  const container = document.createElement("div");
  container.innerHTML = wrapWithSimpleMarkdown
    ? `<div class="simple-markdown">${sanitizedHtml}</div>`
    : sanitizedHtml;

  const root = container.querySelector(".simple-markdown") || container.firstElementChild || container;

  if (!root) {
    return "";
  }

  root.querySelectorAll("p").forEach((paragraph) => {
    const nextElement = paragraph.nextElementSibling;
    const isLabelParagraph = (
      paragraph.textContent?.trim().endsWith(":") &&
      paragraph.querySelector("strong") &&
      nextElement &&
      ["UL", "OL"].includes(nextElement.tagName)
    );

    if (!isLabelParagraph) {
      return;
    }

    const group = document.createElement("div");
    group.className = "md-label-list-group";
    paragraph.classList.add("md-label-paragraph");
    nextElement.classList.add("md-label-list");

    Array.from(nextElement.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
        node.remove();
      }
    });

    paragraph.parentNode.insertBefore(group, paragraph);
    group.appendChild(paragraph);
    group.appendChild(nextElement);
  });

  root
    .querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol, li, .md-label-list-group, .md-label-paragraph, .md-label-list")
    .forEach((element) => {
      applyBlockDirection(element, fallbackDir);
    });

  root.querySelectorAll("a").forEach((link) => {
    const href = (link.getAttribute("href") || "").trim();

    if (!/^https?:\/\//i.test(href)) {
      const textNode = document.createTextNode(link.textContent || "");
      link.replaceWith(textNode);
      return;
    }

    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });

  if (root.classList && !root.classList.contains("simple-markdown")) {
    root.classList.add("simple-markdown");
  }

  return DOMPurify.sanitize(root.outerHTML, {
    ADD_ATTR: ["target", "rel"],
  });
};

export function renderMarkdownPreview(content, options = {}) {
  const {
    fallbackDir = "ltr",
    isDictionary = false,
    enableMarkdown = true,
  } = options;

  if (!content || typeof content !== "string") {
    return "";
  }

  if (enableMarkdown) {
    try {
      if (shouldUseLegacySimpleMarkdown(content, isDictionary)) {
        const markdownElement = SimpleMarkdown.render(content, fallbackDir, {
          enableLabelFormatting: isDictionary,
        });

        if (markdownElement) {
          return normalizeRenderedHtml(markdownElement.outerHTML, false, fallbackDir);
        }

        return normalizeRenderedHtml(content.replace(/\n/g, "<br>"), true, fallbackDir);
      }

      const markedHtml = marked.parse(content, {
        gfm: true,
        breaks: false,
        mangle: false,
      });

      return normalizeRenderedHtml(markedHtml, true, fallbackDir);
    } catch {
      return normalizeRenderedHtml(content.replace(/\n/g, "<br>"), true, fallbackDir);
    }
  }

  return normalizeRenderedHtml(content.replace(/\n/g, "<br>"), true, fallbackDir);
}

function shouldUseLegacySimpleMarkdown(content, isDictionary) {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return false;
  }

  if (lines.length === 1) {
    const line = lines[0];

    const oneLineLabelMatch = line.match(/^(.*?)\*\*.*?\*\*.*:(?!\/\/)/);
    if (oneLineLabelMatch && oneLineLabelMatch[1].trim().length > 0) {
      return true;
    }

    const boldLabelMatches = line.match(/\*\*[^*]+?\*\*/g) || [];
    if (boldLabelMatches.length > 1 && line.includes(':')) {
      return true;
    }

    if (isDictionary && !line.includes('**') && LEGACY_PLAIN_LABEL_RE.test(line)) {
      return true;
    }

    return false;
  }

  if (isDictionary && !normalized.includes('**')) {
    return lines.some((line) => LEGACY_PLAIN_LABEL_RE.test(line));
  }

  return false;
}

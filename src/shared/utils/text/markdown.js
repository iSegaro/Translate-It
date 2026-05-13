// src/utils/simpleMarkdown.js
// Simple, secure markdown parser for basic formatting

import { filterXSS } from "xss";

/**
 * Extraction strategies for different content types and actions.
 */
export const ExtractionStrategy = {
  FULL_TEXT: 'full',        // Keep all lines, strip all markdown (Standard Mode)
  PRIMARY_ONLY: 'primary',   // Extract only the primary meaning (Dictionary TTS)
  CLEAN_DICT: 'clean_dict'   // Keep structure (labels) but strip markdown (Dictionary Copy)
};

export class SimpleMarkdown {
  static render(markdown) {
    if (!markdown || typeof markdown !== "string") {
      return "";
    }

    // Pre-process: Add line breaks before dictionary labels for traditional providers
    // Pattern: "translation **label:** details" → "translation\n\n**label:** details"
    let processedMarkdown = markdown;

    // Check if the text is in the "traditional provider" format:
    // - Single line (no newlines at all)
    // - Has "**" pattern followed by text and ":"
    if (!markdown.includes('\n')) {
      const asteriskIndex = markdown.indexOf('**');

      if (asteriskIndex > 0) {
        // Found "**" after some content, split at that position
        const before = markdown.substring(0, asteriskIndex).trim();
        const after = markdown.substring(asteriskIndex);

        if (before.length > 0 && after.includes(':')) {
          // First separate the main translation from labels
          processedMarkdown = before + '\n\n' + after;

          // Then split all labels in the same line with newlines
          // Simple approach: find all "**label:**" patterns and add newline before each (except first one)
          const parts = after.split('**');
          let processedAfter = '';
          let isFirstLabel = true;

          // Process each pair (label + content)
          for (let i = 1; i < parts.length; i += 2) {
            const label = parts[i] || '';
            const content = parts[i + 1] || '';

            if (label.trim().endsWith(':')) {
              // This is a label line
              const labelText = label.trim().slice(0, -1); // Remove trailing ':'
              const contentText = content.trim();

              if (!isFirstLabel) {
                processedAfter += '\n';
              }

              processedAfter += '**' + labelText + '**: ' + contentText;
              isFirstLabel = false;
            }
          }

          processedMarkdown = before + '\n\n' + processedAfter;
        }
      }
    }

    // Sanitize input to prevent XSS attacks
    const sanitizedMarkdown = filterXSS(processedMarkdown, {
      whiteList: {}, // No HTML tags allowed in input
      stripIgnoreTag: true,
      stripIgnoreTagBody: ["script"],
    });

    // Create a container div
    const container = document.createElement("div");
    container.className = "simple-markdown";

    // Split into lines for processing
    const lines = sanitizedMarkdown.split("\n");
    let currentSection = null;
    let listItems = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle empty lines
      if (!trimmed) {
        if (listItems.length > 0) {
          // Finish the current list
          this._finishSection(container, currentSection, listItems);
          currentSection = null;
          listItems = [];
        } else if (currentSection) {
          // Finish the current section
          container.appendChild(currentSection);
          currentSection = null;
        }
        continue;
      }

      // Headers (check from most specific to least specific)
      if (trimmed.startsWith("###### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h6");
        currentSection.setAttribute("dir", "auto");
        currentSection.textContent = trimmed.substring(7);
        listItems = [];
      } else if (trimmed.startsWith("##### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h5");
        currentSection.setAttribute("dir", "auto");
        currentSection.textContent = trimmed.substring(6);
        listItems = [];
      } else if (trimmed.startsWith("#### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h4");
        currentSection.setAttribute("dir", "auto");
        currentSection.textContent = trimmed.substring(5);
        listItems = [];
      } else if (trimmed.startsWith("### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h3");
        currentSection.setAttribute("dir", "auto");
        currentSection.textContent = trimmed.substring(4);
        listItems = [];
      } else if (trimmed.startsWith("## ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h2");
        currentSection.setAttribute("dir", "auto");
        currentSection.textContent = trimmed.substring(3);
        listItems = [];
      } else if (trimmed.startsWith("# ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h1");
        currentSection.setAttribute("dir", "auto");
        currentSection.textContent = trimmed.substring(2);
        listItems = [];
      }
      // List items
      else if (/^\s*([-*•])\s+/.test(trimmed)) {
        if (!currentSection || currentSection.tagName !== "UL") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("ul");
          currentSection.setAttribute("dir", "auto");
          listItems = [];
        }
        const li = document.createElement("li");
        li.setAttribute("dir", "auto");
        const content = trimmed.replace(/^\s*([-*•])\s+/, '');
        li.appendChild(this._parseInline(content));
        listItems.push(li);
      }
      // Ordered list items
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!currentSection || currentSection.tagName !== "OL") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("ol");
          currentSection.setAttribute("dir", "auto");
          listItems = [];
        }
        const li = document.createElement("li");
        li.setAttribute("dir", "auto");
        li.appendChild(this._parseInline(trimmed.replace(/^\d+\.\s/, "")));
        listItems.push(li);
      }
      // Code blocks
      else if (trimmed.startsWith("```")) {
        this._finishSection(container, currentSection, listItems);
        const codeBlock = document.createElement("pre");
        codeBlock.setAttribute("dir", "ltr");
        const code = document.createElement("code");

        // Collect code content
        let codeContent = "";
        i++; // Skip the opening ```
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeContent += lines[i] + "\n";
          i++;
        }

        code.textContent = codeContent.trimEnd();
        codeBlock.appendChild(code);
        container.appendChild(codeBlock);
        currentSection = null;
        listItems = [];
      }
      // Horizontal rules (---)
      else if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
        this._finishSection(container, currentSection, listItems);
        const hr = document.createElement("hr");
        container.appendChild(hr);
        currentSection = null;
        listItems = [];
      }
      // Blockquotes
      else if (trimmed.startsWith("> ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("blockquote");
        currentSection.setAttribute("dir", "auto");
        currentSection.appendChild(this._parseInline(trimmed.substring(2)));
        listItems = [];
      }
      // Label formatting (e.g., "نوع: اسم" or "Definition: Noun")
      else if (this._isLabelLine(trimmed)) {
        // Always finish current section before starting a label line
        this._finishSection(container, currentSection, listItems);
        
        // Create a new paragraph specifically for this label
        currentSection = document.createElement("p");
        currentSection.setAttribute("dir", "auto");
        currentSection.appendChild(this._parseLabelLine(trimmed));
        listItems = [];
      }
      // Regular paragraphs
      else if (trimmed) {
        // Only continue list if we're in a list and the line starts with whitespace (indented continuation)
        if (listItems.length > 0 && line.startsWith(' ') && !trimmed.startsWith(line.trim())) {
          // Continue list processing for indented lines
          continue;
        }

        // Always create a new paragraph for each non-empty line
        this._finishSection(container, currentSection, []);
        currentSection = document.createElement("p");
        currentSection.setAttribute("dir", "auto");
        listItems = [];

        currentSection.appendChild(this._parseInline(trimmed));
      }
    }

    // Finish any remaining section
    this._finishSection(container, currentSection, listItems);

    return container;
  }

  static _finishSection(container, section, listItems) {
    if (section) {
      if (listItems.length > 0) {
        listItems.forEach((li) => section.appendChild(li));
      }
      container.appendChild(section);
    }
  }

  static _isLabelLine(text) {
    // Pattern to match label lines like:
    // - "**noun:** test, experiment" (markdown bold)
    // - "اسم: آزمایش" (regular labels)
    // - "- **Meaning**: آزمایش" (list item label)
    // - "تعاریف (Definitions):" (label with no content after colon)
    const trimmedText = text.trim().replace(/^[-*•]\s+/, "");

    // 1. Check for markdown bold labels: **Label**: content (content is optional)
    // We look for ** at start, some characters, then a colon (either inside or outside the last **)
    const markdownLabelPattern = /^\*\*.*?\*\*(\s*:\s*.*|:\*\*.*|:)$/;

    // 2. Check for regular labels: Label: content (content is optional)
    // More strict pattern: label should be at start of line, followed by colon
    const regularLabelPattern = /^[^:\s]+\s*:\s*.*$/;

    // 3. Specifically allow lines ending in a colon (header-style labels)
    const endsWithColonPattern = /^.*:$/;

    return markdownLabelPattern.test(trimmedText) || regularLabelPattern.test(trimmedText) || endsWithColonPattern.test(trimmedText);
  }

  static _parseLabelLine(text) {
    const span = document.createElement("span");
    
    // Robust regex to capture label and content regardless of bold marker position
    // Group 1: Label part (including possible ** markers)
    // Group 2: Content part (optional)
    const match = text.match(/^(\*\*.*?\*\*|[^:]+)\s*:\s*(.*)$/);

    if (!match) {
      span.appendChild(this._parseInline(text));
      return span;
    }

    const labelPart = match[1].trim();
    const content = match[2] ? match[2].trim() : "";

    // Create a bold element for the label and strip any markdown markers
    const labelElement = document.createElement("strong");
    labelElement.textContent = this.strip(labelPart);

    span.appendChild(labelElement);
    span.appendChild(document.createTextNode(": "));

    // Content after colon should NOT be parsed as markdown in dictionary context
    // to prevent nested formatting issues.
    if (content) {
      const textNode = document.createTextNode(content);
      span.appendChild(textNode);
    }

    return span;
  }

  static _parseInline(text) {
    const span = document.createElement("span");

    // Pattern to match inline formatting
    const patterns = [
      { regex: /\*\*(.*?)\*\*/g, tag: "strong" },
      { regex: /\*(.*?)\*/g, tag: "em" },
      { regex: /`(.*?)`/g, tag: "code" },
      { regex: /\[(.*?)\]\((.*?)\)/g, tag: "a", href: true },
    ];

    const matches = [];

    // Find all matches
    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1],
          tag: pattern.tag,
          href: pattern.href ? match[2] : null,
          original: match[0],
        });
      }
    });

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (keep the first one)
    const validMatches = [];
    let lastEnd = 0;
    matches.forEach((match) => {
      if (match.start >= lastEnd) {
        validMatches.push(match);
        lastEnd = match.end;
      }
    });

    // Build the result
    lastEnd = 0;
    validMatches.forEach((match) => {
      // Add text before match
      if (match.start > lastEnd) {
        span.appendChild(
          document.createTextNode(text.substring(lastEnd, match.start)),
        );
      }

      // Add formatted element
      const element = document.createElement(match.tag);
      element.textContent = match.content;
      if (match.href) {
        // Sanitize URL to prevent javascript: and data: schemes
        const sanitizedHref = filterXSS(match.href, {
          whiteList: {},
          stripIgnoreTag: true,
          stripIgnoreTagBody: ["script"],
        });

        // Only allow http/https URLs
        if (sanitizedHref.match(/^https?:\/\//)) {
          element.href = sanitizedHref;
          element.target = "_blank";
          element.rel = "noopener noreferrer";
        } else {
          // If URL is not safe, just show as text
          element.removeAttribute("href");
        }
      }
      span.appendChild(element);

      lastEnd = match.end;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      span.appendChild(document.createTextNode(text.substring(lastEnd)));
    }

    return span;
  }

  /**
   * Check if the given text appears to be HTML rather than markdown
   * @param {string} text - Text to check
   * @returns {boolean} True if text appears to be HTML
   */
  static isHTML(text) {
    if (!text || typeof text !== "string") return false;
    // Check for common HTML patterns
    return /<[a-z][\s\S]*>/i.test(text);
  }

  /**
   * Extract plain text from HTML by removing all tags
   * @param {string} html - HTML string
   * @returns {string} Plain text without HTML tags
   */
  static htmlToPlainText(html) {
    if (!html || typeof html !== "string") return "";

    // Create a temporary element to extract text content using DOMParser
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Add spaces between elements to prevent word merging
        const walk = (node) => {
          let text = "";
          if (node.nodeType === 3) text += node.nodeValue;
          for (let i = 0; i < node.childNodes.length; i++) {
            text += walk(node.childNodes[i]);
          }
          if (node.nodeType === 1 && (node.tagName === "P" || node.tagName === "BR" || node.tagName === "DIV")) {
            text += "\n";
          }
          return text;
        };
        return walk(doc.body).trim();
      } catch {
        // Fallback if DOMParser fails
      }
    }

    // Fallback: simple regex-based tag removal
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract clean text based on the specified strategy.
   * @param {string} text - The markdown text or HTML
   * @param {string} strategy - The extraction strategy (from ExtractionStrategy)
   * @returns {string} Clean plain text
   */
  static getCleanTranslation(text, strategy = ExtractionStrategy.PRIMARY_ONLY) {
    if (!text || typeof text !== "string") {
      return "";
    }

    let processedText = text;

    // 1. Convert HTML to plain text first if needed
    if (this.isHTML(text)) {
      processedText = this.htmlToPlainText(text);
    }

    // 2. Normalize and split into lines
    const lines = processedText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return "";

    // Strategy: FULL_TEXT (Standard Mode)
    // Simply strip all markdown and return the whole text
    if (strategy === ExtractionStrategy.FULL_TEXT) {
      return this.strip(processedText);
    }

    // Strategy: CLEAN_DICT (Dictionary Mode Copy)
    // Keep labels but strip markdown formatting
    if (strategy === ExtractionStrategy.CLEAN_DICT) {
      return lines.map(line => {
        const match = line.match(/^(\*\*.*?\*\*|[^:]+)\s*:\s*(.*)$/);
        if (match) {
          return `${this.strip(match[1])}: ${this.strip(match[2])}`;
        }
        return this.strip(line);
      }).join('\n');
    }

    // Strategy: PRIMARY_ONLY (Dictionary Mode TTS - Default)
    // Find the first non-label line or extract content from first label
    
    // Check if the input is a single line
    if (lines.length === 1) {
      const line = lines[0];

      // 1. Check for 'text before label' pattern: "translation**Label**:" or "translation Label:"
      const beforeLabelMatch = line.match(/(.*?)\*\*.*?\*\*(\s*:\s*|:)/) || 
                               line.match(/(.*?)[A-Za-z]+\s*:/) || 
                               line.match(/(.*?)[؀-ۿ]+\s*:/);
      
      if (beforeLabelMatch && beforeLabelMatch[1].trim().length > 0) {
        return this.strip(beforeLabelMatch[1].trim());
      }

      // 2. Check for standard label start: "**Label**: content" or "Label: content"
      const match = line.match(/^(\*\*.*?\*\*|[^:\s]+)\s*:\s*(.*)$/);
      if (match && match[2].trim()) {
        if (this.strip(match[1]).length < 30) {
          return this.strip(match[2]);
        }
      }
      return this.strip(line);
    }

    // Multi-line search
    // 1. First pass: find the first line that is definitely NOT a label
    for (const line of lines) {
      const trimmed = line.replace(/^[-*•]\s*/, '').trim();
      
      // If it's a long line or doesn't match the label pattern, it's our target
      if (trimmed.length > 50 || !this._isLabelLine(trimmed)) {
        return this.strip(trimmed);
      }
    }

    // 2. Second pass (Fallback): If all lines were labels, take content from the first label line
    const firstLine = lines[0].replace(/^[-*•]\s*/, '').trim();
    const match = firstLine.match(/^(\*\*.*?\*\*|[^:\s]+)\s*:\s*(.*)$/);
    if (match && match[2].trim()) {
      return this.strip(match[2]);
    }

    return this.strip(lines[0]);
  }

  /**
   * Strip common markdown patterns to return "clean" plain text
   * @param {string} text - Markdown text to clean
   * @returns {string} Plain text
   */
  static strip(text) {
    if (!text || typeof text !== "string") {
      return "";
    }

    return text
      // Strip code blocks (```code```) - do this first to preserve content but remove markers
      .replace(/```[\s\S]*?```/g, (match) => {
        return match.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      })
      // Strip markdown links [text](url) keeping only text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Strip pronunciation guides like [go(a)vāhi] or [n(y)o͞oz]
      // Matches brackets that are NOT followed by (url)
      // Range includes: basic latin, latin extended, combining diacritics, and phonetic extensions
      // NOTE: We disable no-misleading-character-class because we intentionally include 
      // combining diacritics (\u0300-\u036F) to strip them from pronunciation guides.
      // eslint-disable-next-line no-misleading-character-class
      .replace(/\[[a-zA-Z0-9()\s'\u00C0-\u017F\u0300-\u036F\u02B0-\u02FF]+\](?!\()/g, "")
      // Strip headers (# header)
      .replace(/^#+\s?/gm, "")
      // Strip blockquotes (> quote)
      .replace(/^>\s?/gm, "")
      // Strip horizontal rules (---, ***, ___)
      .replace(/^([-*_])\1{2,}$/gm, "")
      // Strip list markers: unordered (- item, * item, + item)
      .replace(/^\s*([-*+])\s+/gm, "")
      // Strip list markers: ordered (1. item)
      .replace(/^\s*\d+\.\s+/gm, "")
      // Strip task list markers ([ ], [x])
      .replace(/^\s*\[[ xX]\]\s+/gm, "")
      // Strip bold/italic markers (**bold**, __bold__, *italic*, _italic_)
      .replace(/(\*\*|__|\*|_)/g, "")
      // Strip inline code markers (`code`)
      .replace(/`([^`]+)`/g, "$1")
      // Normalize multiple newlines to double newlines, then trim
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}


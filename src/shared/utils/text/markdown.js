// src/utils/simpleMarkdown.js
// Simple, secure markdown parser for basic formatting

import { filterXSS } from "xss";

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
        currentSection.textContent = trimmed.substring(7);
        listItems = [];
      } else if (trimmed.startsWith("##### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h5");
        currentSection.textContent = trimmed.substring(6);
        listItems = [];
      } else if (trimmed.startsWith("#### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h4");
        currentSection.textContent = trimmed.substring(5);
        listItems = [];
      } else if (trimmed.startsWith("### ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h3");
        currentSection.textContent = trimmed.substring(4);
        listItems = [];
      } else if (trimmed.startsWith("## ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h2");
        currentSection.textContent = trimmed.substring(3);
        listItems = [];
      } else if (trimmed.startsWith("# ")) {
        this._finishSection(container, currentSection, listItems);
        currentSection = document.createElement("h1");
        currentSection.textContent = trimmed.substring(2);
        listItems = [];
      }
      // List items
      else if (/^\s*([-*•])\s+/.test(trimmed)) {
        if (!currentSection || currentSection.tagName !== "UL") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("ul");
          listItems = [];
        }
        const li = document.createElement("li");
        const content = trimmed.replace(/^\s*([-*•])\s+/, '');
        li.appendChild(this._parseInline(content));
        listItems.push(li);
      }
      // Ordered list items
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!currentSection || currentSection.tagName !== "OL") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("ol");
          listItems = [];
        }
        const li = document.createElement("li");
        li.appendChild(this._parseInline(trimmed.replace(/^\d+\.\s/, "")));
        listItems.push(li);
      }
      // Code blocks
      else if (trimmed.startsWith("```")) {
        this._finishSection(container, currentSection, listItems);
        const codeBlock = document.createElement("pre");
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
        currentSection.appendChild(this._parseInline(trimmed.substring(2)));
        listItems = [];
      }
      // Label formatting (e.g., "نوع: اسم" or "Definition: Noun")
      else if (this._isLabelLine(trimmed)) {
        // Always finish current section before starting a label line
        this._finishSection(container, currentSection, listItems);
        
        // Create a new paragraph specifically for this label
        currentSection = document.createElement("p");
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
    const trimmedText = text.trim().replace(/^[-*•]\s+/, "");

    // Check for markdown bold labels: **Label**: content
    // We look for ** at start, some characters, ** then a colon.
    const markdownLabelPattern = /^\*\*.*?\*\*\s*:\s*.*$/;

    // Check for regular labels: Label: content
    // More strict pattern: label should be at start of line, followed by colon and content
    // The label part should not contain spaces (single word label)
    const regularLabelPattern = /^(\S+)\s*:\s*.+$/;

    return markdownLabelPattern.test(trimmedText) || regularLabelPattern.test(trimmedText);
  }

  static _parseLabelLine(text) {
    const span = document.createElement("span");
    const colonIndex = text.indexOf(':');

    if (colonIndex === -1) {
      // Fallback - shouldn't happen since _isLabelLine checked this
      span.appendChild(this._parseInline(text));
      return span;
    }

    // Get label and content parts
    const labelPart = text.substring(0, colonIndex).trim();
    const content = text.substring(colonIndex + 1).trim();

    // Create a bold element for the label and strip any markdown markers
    // This ensures a clean label regardless of how the AI formatted the bolding.
    const labelElement = document.createElement("strong");
    labelElement.textContent = this.strip(labelPart);

    span.appendChild(labelElement);
    span.appendChild(document.createTextNode(": "));

    // Content after colon should NOT be parsed as markdown - treat as plain text
    // This prevents nested labels from being bolded
    const textNode = document.createTextNode(content);
    span.appendChild(textNode);

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

    // Create a temporary div element to extract text content
    if (typeof document !== 'undefined' && document.createElement) {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.textContent || div.innerText || "";
    }

    // Fallback: simple regex-based tag removal (less accurate but works in non-DOM environments)
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract only the primary translation/meaning, cleaning markdown and ignoring dictionary details if present.
   * Useful for TTS and "Clean Copy" operations.
   * @param {string} text - The markdown text or HTML
   * @returns {string} Clean plain text of the primary meaning
   */
  static getCleanTranslation(text) {
    if (!text || typeof text !== "string") {
      return "";
    }

    let processedText = text;

    // Check if the input is HTML and convert it to plain text first
    if (this.isHTML(text)) {
      processedText = this.htmlToPlainText(text);
    }

    // Split into non-empty lines
    const lines = processedText.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length === 0) {
      return "";
    }

    // Helper function to check if a line contains a label pattern
    const hasLabelPattern = (line) => {
      if (!line) return false;

      // Check for markdown bold labels: **Label**: anywhere in the line
      if (/\*\*.*?\*\*\s*:/.test(line)) {
        return true;
      }

      // Check for regular labels: word: anywhere in the line
      // This catches patterns like "Noun:", "اسم:", etc.
      if (/\b[A-Za-z]+\s*:/.test(line) || /\b[؀-ۿ]+\s*:/.test(line)) {
        return true;
      }

      return false;
    };

    // Helper function to check if a line is purely a label (no content before label)
    const isPureLabel = (line) => {
      if (!line) return false;

      // Check if line starts with markdown bold label
      if (/^\*\*.*?\*\*\s*:/.test(line)) {
        return true;
      }

      // Check if line starts with regular word label
      if (/^[A-Za-z]+\s*:/.test(line) || /^[؀-ۿ]+\s*:/.test(line)) {
        return true;
      }

      return false;
    };

    // Strategy 1: For single-line input
    if (lines.length === 1) {
      const line = lines[0];

      // Check if it's a pure label line (no content before label)
      if (isPureLabel(line)) {
        // Extract content after the label
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const afterColon = line.substring(colonIndex + 1).trim();
          return this.strip(afterColon);
        }
      }

      // Check for markdown bold labels with content before: "text**Label**:"
      const boldLabelMatch = line.match(/(.*?)\*\*.*?\*\*\s*:/);
      if (boldLabelMatch && boldLabelMatch[1].trim().length > 0) {
        return this.strip(boldLabelMatch[1].trim());
      }

      // Check for regular labels with content before: "text Label:"
      const regularLabelMatch = line.match(/(.*?)[A-Za-z]+\s*:/) || line.match(/(.*?)[؀-ۿ]+\s*:/);
      if (regularLabelMatch && regularLabelMatch[1].trim().length > 0) {
        return this.strip(regularLabelMatch[1].trim());
      }

      // No label found or empty prefix, return stripped line
      return this.strip(line);
    }

    // Strategy 2: For multi-line input, find the first line that's not a label
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip list markers at the start
      const trimmedLine = line.replace(/^[-*•]\s*/, '').trim();

      // Check if this line is purely a label
      if (!hasLabelPattern(trimmedLine) || trimmedLine.length > 50) {
        // Found a non-label line or a long line (likely a sentence)
        return this.strip(trimmedLine);
      }
    }

    // Strategy 3: If all lines are labels, extract content from the first label
    const firstLine = lines[0].replace(/^[-*•]\s*/, '').trim();

    // Try to extract content after colon
    const colonIndex = firstLine.indexOf(':');
    if (colonIndex !== -1) {
      const afterColon = firstLine.substring(colonIndex + 1).trim();
      if (afterColon.length > 0) {
        return this.strip(afterColon);
      }
    }

    // Fallback: return first line stripped
    return this.strip(firstLine);
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
      // Strip markdown links [text](url) keeping only text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Strip inline code markers (`code`)
      .replace(/`([^`]+)`/g, "$1")
      // Normalize multiple newlines to double newlines, then trim
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}


// src/utils/simpleMarkdown.js
// Simple, secure markdown parser for basic formatting

import { filterXSS } from "xss";

export class SimpleMarkdown {
  static render(markdown) {
    if (!markdown || typeof markdown !== "string") {
      return "";
    }

    // Sanitize input to prevent XSS attacks
    const sanitizedMarkdown = filterXSS(markdown, {
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

      // Skip empty lines unless in a list
      if (!trimmed && listItems.length === 0) {
        if (currentSection) {
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
      } else if (/^\d+\.\s/.test(trimmed)) {
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
        if (listItems.length > 0) {
          // Continue list processing if we're in a list
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
    // We look for characters at the start followed immediately by a colon and then some content.
    // This pattern is more inclusive for different languages.
    const regularLabelPattern = /^[^:\n]+\s*:\s*.+$/;
    
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
    span.appendChild(this._parseInline(content));
    
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
   * Extract only the primary translation/meaning, cleaning markdown and ignoring dictionary details if present.
   * Useful for TTS and "Clean Copy" operations.
   * @param {string} text - The markdown text
   * @returns {string} Clean plain text of the primary meaning
   */
  static getCleanTranslation(text) {
    if (!text || typeof text !== "string") {
      return "";
    }

    // Split into non-empty lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length === 0) {
      return "";
    }

    if (lines.length <= 1) {
      // If it's a single line and it's a label, try to extract the value
      if (this._isLabelLine(lines[0])) {
        const colonIndex = lines[0].indexOf(':');
        if (colonIndex !== -1) {
          return this.strip(lines[0].substring(colonIndex + 1));
        }
      }
      return this.strip(text);
    }

    // Structural Check: In dictionary mode, we typically have a main translation 
    // followed by lines with labels (Noun:, Verb:, etc.)
    // OR the first line itself is a label (Meaning: ...)
    let isDictionary = this._isLabelLine(lines[0]);
    
    if (!isDictionary) {
      for (let i = 1; i < lines.length; i++) {
        if (this._isLabelLine(lines[i])) {
          isDictionary = true;
          break;
        }
      }
    }

    if (isDictionary) {
      // It's a dictionary entry - only return the primary meaning (first line)
      // Extract content after colon if the first line is a label
      if (this._isLabelLine(lines[0])) {
        const colonIndex = lines[0].indexOf(':');
        if (colonIndex !== -1) {
          return this.strip(lines[0].substring(colonIndex + 1));
        }
      }
      return this.strip(lines[0]);
    }

    // Not a dictionary entry (e.g. a paragraph) - strip markdown and return everything
    return this.strip(text);
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


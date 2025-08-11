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
      else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (!currentSection || currentSection.tagName !== "UL") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("ul");
          listItems = [];
        }
        const li = document.createElement("li");
        li.appendChild(this._parseInline(trimmed.substring(2)));
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
        if (listItems.length > 0) {
          // Finish any pending list
          this._finishSection(container, currentSection, listItems);
          currentSection = null;
          listItems = [];
        }

        if (!currentSection || currentSection.tagName !== "P") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("p");
          listItems = [];
        }

        if (currentSection.textContent) {
          currentSection.appendChild(document.createTextNode(" "));
        }
        currentSection.appendChild(this._parseLabelLine(trimmed));
      }
      // Regular paragraphs
      else if (trimmed) {
        if (listItems.length > 0) {
          // Continue list processing if we're in a list
          continue;
        }

        if (!currentSection || currentSection.tagName !== "P") {
          this._finishSection(container, currentSection, []);
          currentSection = document.createElement("p");
          listItems = [];
        }

        if (currentSection.textContent) {
          currentSection.appendChild(document.createTextNode(" "));
        }
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
    // Pattern to match label lines like "نوع: اسم", "Definition: something", "مترادف: word, word"
    // Look for word characters (including Arabic/Persian) followed by colon and space
    const labelPattern = /^[\w\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+\s*:\s+.+$/;
    return labelPattern.test(text.trim());
  }

  static _parseLabelLine(text) {
    const span = document.createElement("span");
    const colonIndex = text.indexOf(':');
    
    if (colonIndex === -1) {
      // Fallback - shouldn't happen since _isLabelLine checked this
      span.appendChild(this._parseInline(text));
      return span;
    }
    
    // Create bold label part
    const label = text.substring(0, colonIndex).trim();
    const content = text.substring(colonIndex + 1).trim();
    
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    
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
}

// Export function for easier use
export const renderMarkdown = (text) => {
  if (!text) return "";

  const rendered = SimpleMarkdown.render(text);
  return rendered.innerHTML || text;
};

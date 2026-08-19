import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractContextMetadata, collectTextNodes, generateElementId, collectBlockGroups, isExcludedAncestor } from './DomTranslatorUtils.js';
import { SelectElementExtractionMode } from './SelectElementPolicy.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('DomTranslatorUtils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Test Page';
    vi.clearAllMocks();
  });

  describe('generateElementId', () => {
    it('should generate a unique ID starting with "element-"', () => {
      const id1 = generateElementId();
      const id2 = generateElementId();
      
      expect(id1).toMatch(/^element-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('extractContextMetadata', () => {
    it('should extract basic metadata from an element', () => {
      const element = document.createElement('div');
      element.textContent = 'Some sample text';
      document.body.appendChild(element);

      const metadata = extractContextMetadata(element);

      expect(metadata.pageTitle).toBe('Test Page');
      expect(metadata.role).toBe('div');
      expect(metadata.contextSummary).toContain('Page: Test Page');
      expect(metadata.contextSummary).toContain('Role: div');
      expect(metadata.contextSummary).toContain('Full context: Some sample text');
    });

    it('should find the closest preceding heading', () => {
      const h2 = document.createElement('h2');
      h2.textContent = 'Section Heading';
      document.body.appendChild(h2);

      const p = document.createElement('p');
      p.textContent = 'Paragraph text';
      document.body.appendChild(p);

      // Mock getBoundingClientRect for both elements
      h2.getBoundingClientRect = vi.fn(() => ({ top: 10, bottom: 30, left: 0, right: 100, width: 100, height: 20 }));
      p.getBoundingClientRect = vi.fn(() => ({ top: 50, bottom: 70, left: 0, right: 100, width: 100, height: 20 }));

      const metadata = extractContextMetadata(p);

      expect(metadata.heading).toBe('Section Heading');
      expect(metadata.contextSummary).toContain('Section: Section Heading');
    });

    it('should include parent context if available', () => {
      const article = document.createElement('article');
      const p = document.createElement('p');
      p.textContent = 'Nested text';
      article.appendChild(p);
      document.body.appendChild(article);

      const metadata = extractContextMetadata(p);

      expect(metadata.contextSummary).toContain('Parent: article');
    });

    it('should handle elements with no text gracefully', () => {
      const emptyDiv = document.createElement('div');
      document.body.appendChild(emptyDiv);

      const metadata = extractContextMetadata(emptyDiv);

      expect(metadata.contextSummary).not.toContain('Full context:');
    });
  });

  describe('collectTextNodes', () => {
    it('should collect visible text nodes from an element', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>First paragraph</p>
        <span>Inline text</span>
        <div>Mixed <strong>formatted</strong> text</div>
      `;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container);

      // Expected text nodes: 
      // 1. "First paragraph"
      // 2. "Inline text"
      // 3. "Mixed "
      // 4. "formatted"
      // 5. " text"

      expect(nodes.length).toBe(5); 
      expect(nodes[0].text).toBe('First paragraph');
      expect(nodes[1].text).toBe('Inline text');
      expect(nodes[2].text).toBe('Mixed ');
      expect(nodes[3].text).toBe('formatted');
      expect(nodes[4].text).toBe(' text');
    });

    it('discovers open shadow text only when shadow traversal is enabled', () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(document.createTextNode('Shadow content here'));

      expect(collectTextNodes(host)).toHaveLength(0);
      expect(collectTextNodes(host, { includeOpenShadowRoots: true })[0].text).toBe('Shadow content here');
    });

    it('discovers light and nested open-shadow text once without expanding slots', () => {
      const host = document.createElement('x-host');
      const lightText = document.createTextNode('Light content here');
      host.appendChild(lightText);
      const slot = document.createElement('slot');
      slot.appendChild(document.createTextNode('Fallback slot text'));
      slot.assignedNodes = vi.fn(slot.assignedNodes.bind(slot));
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(slot);
      const nestedHost = document.createElement('x-nested');
      const nestedShadow = nestedHost.attachShadow({ mode: 'open' });
      nestedShadow.appendChild(document.createTextNode('Nested content here'));
      shadow.appendChild(nestedHost);

      const nodes = collectTextNodes(host, { includeOpenShadowRoots: true });
      expect(nodes.map(({ text }) => text)).toContain('Light content here');
      expect(nodes.map(({ text }) => text)).toContain('Fallback slot text');
      expect(nodes.map(({ text }) => text)).toContain('Nested content here');
      expect(nodes.filter(({ node }) => node === lightText)).toHaveLength(1);
      expect(slot.assignedNodes).not.toHaveBeenCalled();
    });

    it('traverses an element selected inside an open shadow root and its nested roots', () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      const selected = document.createElement('section');
      selected.appendChild(document.createTextNode('Selected shadow content'));
      const nestedHost = document.createElement('x-nested');
      const nestedShadow = nestedHost.attachShadow({ mode: 'open' });
      nestedShadow.appendChild(document.createTextNode('Selected nested content'));
      selected.appendChild(nestedHost);
      shadow.appendChild(selected);

      expect(collectTextNodes(selected, { includeOpenShadowRoots: true }).map(({ text }) => text))
        .toEqual(['Selected shadow content', 'Selected nested content']);
    });

    it('honors host-level exclusion for internal shadow text', () => {
      const host = document.createElement('x-host');
      host.className = 'notranslate';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(document.createTextNode('Excluded shadow content'));

      expect(collectTextNodes(host, { includeOpenShadowRoots: true })).toEqual([]);
    });

    it('keeps shadow fallback block identities local', () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(document.createTextNode('Shadow block content'));
      document.body.appendChild(host);
      delete document.body.dataset.blockId;

      const nodes = collectTextNodes(host, { includeOpenShadowRoots: true });

      expect(nodes[0].blockId).toMatch(/^sb/);
      expect(nodes[0].role).toBe('shadow-root');
      expect(document.body.dataset.blockId).toBeUndefined();
    });

    it('should assign UIDs and block IDs', () => {
      const container = document.createElement('div');
      container.innerHTML = `<p>Test node</p>`;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container);

      expect(nodes[0].uid).toBe('n1');
      expect(nodes[0].blockId).toMatch(/^b/);
      
      const p = container.querySelector('p');
      expect(p.dataset.blockId).toBe(nodes[0].blockId);
    });

    it('should group nodes by block parent', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="block1">
          <span>Text 1</span>
          <span>Text 2</span>
        </div>
        <div class="block2">
          <span>Text 3</span>
        </div>
      `;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container);

      expect(nodes.length).toBe(3);
      expect(nodes[0].blockId).toBe(nodes[1].blockId);
      expect(nodes[0].blockId).not.toBe(nodes[2].blockId);
      expect(nodes[0].role).toBe('div');
    });

    it('should skip hidden elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Visible</p>
        <p style="display: none">Hidden</p>
        <script>console.log('script')</script>
      `;
      document.body.appendChild(container);

      // Mock window.getComputedStyle
      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn((el) => {
        if (el.style && el.style.display === 'none') return { display: 'none' };
        return { display: 'block', visibility: 'visible' };
      });

      const nodes = collectTextNodes(container);

      expect(nodes.length).toBe(1);
      expect(nodes[0].text).toBe('Visible');

      window.getComputedStyle = originalGetComputedStyle;
    });

    it('should filter out empty or whitespace-only nodes', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Actual text</p>
        <p>   </p>
        <p>\n\t</p>
      `;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container);

      expect(nodes.length).toBe(1);
      expect(nodes[0].text).toBe('Actual text');
    });

    it('should reject BIDI/zero-width formatting-mark-only text nodes', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Readable text</p>
        <p>\u200E</p>
        <p>\u200F</p>
        <p> \u200B </p>
        <p>\u2060</p>
      `;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container);

      expect(nodes.length).toBe(1);
      expect(nodes[0].text.trim()).toBe('Readable text');
    });

    it('should reject text nodes inside form controls, unsafe options, and contenteditable elements recursively, but not inside BUTTON', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Translatable text outside.</p>
        <textarea>Should be rejected text.</textarea>
        <input type="text" value="Should be rejected text." />
        <select>
          <option value="en">Safe option label.</option>
          <option>Unsafe implicit-value option text.</option>
        </select>
        <button><span>Should be translated nested button text.</span></button>
        <div contenteditable="true">Should be rejected editor text.</div>
        <div class="nested-editor"><p contenteditable="true">Should be rejected deeply nested editor text.</p></div>
      `;
      document.body.appendChild(container);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const textNodes = collectTextNodes(container);
        const collected = textNodes.map(n => n.text.trim());
        expect(collected).toContain('Translatable text outside.');
        expect(collected).toContain('Should be translated nested button text.');
        expect(collected).toContain('Safe option label.');
        expect(collected).not.toContain('Should be rejected text.');
        expect(collected).not.toContain('Unsafe implicit-value option text.');
        expect(collected).not.toContain('Should be rejected editor text.');
        expect(collected).not.toContain('Should be rejected deeply nested editor text.');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('should reject preformatted nodes in V2 mode (explicit mode)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Standard text</p>
        <pre>Preformatted text</pre>
        <code>Code text</code>
      `;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container, { extractionMode: SelectElementExtractionMode.V2 });

      expect(nodes.length).toBe(1);
      expect(nodes[0].text.trim()).toBe('Standard text');
    });

    it('should reject preformatted nodes in V2 mode (default, mode-agnostic call)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Standard text</p>
        <pre>Preformatted text</pre>
      `;
      document.body.appendChild(container);

      const nodes = collectTextNodes(container);

      expect(nodes.length).toBe(1);
      expect(nodes[0].text.trim()).toBe('Standard text');
    });

    it('collects text from an explicitly selected BUTTON root (V2)', () => {
      const button = document.createElement('button');
      const span = document.createElement('span');
      span.textContent = 'Follow this account to see their updates';
      button.appendChild(span);
      document.body.appendChild(button);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const nodes = collectTextNodes(button, { extractionMode: SelectElementExtractionMode.V2 });
        expect(nodes.length).toBeGreaterThan(0);
        expect(nodes.map(n => n.text).join(' ')).toContain('Follow this account');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('extracts text from a nested role=button subtree when a parent is selected (V2)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Readable parent text.</p>
        <div role="button"><span>Nested button label</span></div>
      `;
      document.body.appendChild(container);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const nodes = collectTextNodes(container, { extractionMode: SelectElementExtractionMode.V2 });
        const collected = nodes.map(n => n.text.trim());
        expect(collected).toContain('Readable parent text.');
        expect(collected).toContain('Nested button label');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects text from an explicitly selected role=button root (V2)', () => {
      const root = document.createElement('div');
      root.setAttribute('role', 'button');
      const span = document.createElement('span');
      span.textContent = 'Open account settings and manage preferences';
      root.appendChild(span);
      document.body.appendChild(root);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const nodes = collectTextNodes(root, { extractionMode: SelectElementExtractionMode.V2 });
        expect(nodes.length).toBeGreaterThan(0);
        expect(nodes.map(n => n.text).join(' ')).toContain('Open account settings');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects an explicitly selected GitHub code-class root but excludes a nested code-class subtree (V2)', () => {
      const root = document.createElement('div');
      root.className = 'react-code-text';
      root.textContent = 'const value = 42;';
      document.body.appendChild(root);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const rootNodes = collectTextNodes(root, { extractionMode: SelectElementExtractionMode.V2 });
        expect(rootNodes.length).toBe(1);
        expect(rootNodes[0].text.trim()).toBe('const value = 42;');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }

      const nested = document.createElement('div');
      const nestedLine = document.createElement('div');
      nestedLine.className = 'react-code-text';
      nestedLine.textContent = 'return 0;';
      nested.appendChild(document.createTextNode('Surrounding prose.'));
      nested.appendChild(nestedLine);
      document.body.appendChild(nested);

      try {
        const nestedNodes = collectTextNodes(nested, { extractionMode: SelectElementExtractionMode.V2 });
        const collected = nestedNodes.map(n => n.text.trim());
        expect(collected).toContain('Surrounding prose.');
        expect(collected).not.toContain('return 0;');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });
  });

  describe('collectBlockGroups', () => {
    it('inherits direction hint through nested open shadow hosts without merging groups', () => {
      const outerHost = document.createElement('x-outer');
      outerHost.setAttribute('dir', 'rtl');
      const outerShadow = outerHost.attachShadow({ mode: 'open' });
      outerShadow.appendChild(document.createTextNode('Outer shadow text'));
      const innerHost = document.createElement('x-inner');
      const innerShadow = innerHost.attachShadow({ mode: 'open' });
      innerShadow.appendChild(document.createTextNode('Nested shadow text'));
      outerShadow.appendChild(innerHost);

      const units = collectBlockGroups(outerHost, {
        blockMap: new WeakMap(),
        blockCounter: { value: 0 },
      }, {
        extractionMode: SelectElementExtractionMode.V3,
        includeOpenShadowRoots: true,
      });

      expect(units.every(unit => unit.directionHint === 'rtl')).toBe(true);
      expect(new Set(units.map(unit => unit.blockId)).size).toBe(2);
    });

    it('keeps nested shadow groups independent without exposing ShadowRoot as a mutation target', () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(document.createTextNode('Outer shadow content'));
      const nestedHost = document.createElement('x-nested');
      const nestedShadow = nestedHost.attachShadow({ mode: 'open' });
      nestedShadow.appendChild(document.createTextNode('Nested shadow content'));
      shadow.appendChild(nestedHost);

      const units = collectBlockGroups(host, {
        blockMap: new WeakMap(),
        blockCounter: { value: 0 },
      }, {
        extractionMode: SelectElementExtractionMode.V3,
        includeOpenShadowRoots: true,
      });

      expect(units.map(unit => unit.text)).toEqual(['Outer shadow content', 'Nested shadow content']);
      expect(new Set(units.map(unit => unit.blockId)).size).toBe(2);
      expect(units.every(unit => unit.node.getRootNode().host)).toBe(true);
    });

    it('should successfully group nodes and assign sequential IDs using WeakMap session context without touching the DOM', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="block1">
          <span>Text 1</span>
          <span>Text 2</span>
        </div>
      `;
      document.body.appendChild(container);

      const sessionContext = {
        blockMap: new WeakMap(),
        blockCounter: { value: 0 },
        activeSessionId: 's123'
      };

      const units = collectBlockGroups(container, sessionContext);

      expect(units.length).toBe(2);
      expect(units[0].id).toBe('n1');
      expect(units[1].id).toBe('n2');
      expect(units[0].blockId).toBe('g1');
      expect(units[1].blockId).toBe('g1');
      expect(units[0].text).toBe('Text 1');
      expect(units[1].text).toBe('Text 2');
      expect(units[0].node).toBeDefined();
      expect(units[0].node.textContent).toBe('Text 1');
      expect(units[1].node).toBeDefined();
      expect(units[1].node.textContent).toBe('Text 2');

      // Crucial: The live DOM is clean of blockId dataset variables
      const block1El = container.querySelector('.block1');
      expect(block1El.dataset.blockId).toBeUndefined();
    });

    it('should extract whitespace boundaries correctly using boundary strip-and-restore', () => {
      const container = document.createElement('div');
      container.innerHTML = `<p>  Hello world \n</p>`;
      document.body.appendChild(container);

      const units = collectBlockGroups(container);

      expect(units.length).toBe(1);
      expect(units[0].text).toBe('Hello world');
      expect(units[0].leadingWS).toBe('  ');
      expect(units[0].trailingWS).toBe(' \n');
    });

    it('should reject BIDI/zero-width formatting-mark-only text nodes in block grouping mode', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Readable text</p>
        <p>\u200E</p>
        <p> \u200F </p>
      `;
      document.body.appendChild(container);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const units = collectBlockGroups(container);
        expect(units.length).toBe(1);
        expect(units[0].text).toBe('Readable text');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('should implement reversible escaping of printable segment delimiters', () => {
      const container = document.createElement('div');
      container.innerHTML = `<p>Check [--SEG:n2--] tag</p>`;
      document.body.appendChild(container);

      const units = collectBlockGroups(container);

      expect(units.length).toBe(1);
      expect(units[0].text).toBe('Check [--ESCAPED_SEG:n2--] tag');
    });

    it('should exclude preformatted nodes by setting V2_PASSTHROUGH mode', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Standard text</p>
        <pre>Preformatted text</pre>
        <code>Code text</code>
      `;
      document.body.appendChild(container);

      // V3 mode is required for preformatted traversal
      const units = collectBlockGroups(container, {}, { extractionMode: SelectElementExtractionMode.V3 });

      expect(units.length).toBe(3);
      expect(units[0].mode).toBe('standard');
      expect(units[0].preWhitespace).toBe(false);

      expect(units[1].mode).toBe('V2_PASSTHROUGH');
      expect(units[1].preWhitespace).toBe(true);
      expect(units[1].text).toBe('Preformatted text');

      expect(units[2].mode).toBe('V2_PASSTHROUGH');
      expect(units[2].preWhitespace).toBe(true);
      expect(units[2].text).toBe('Code text');
    });

    it('should reject preformatted nodes when extraction mode is not V3', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Standard text</p>
        <pre>Preformatted text</pre>
        <code>Code text</code>
      `;
      document.body.appendChild(container);

      const units = collectBlockGroups(container, {}, { extractionMode: SelectElementExtractionMode.V2 });

      expect(units.length).toBe(1);
      expect(units[0].mode).toBe('standard');
      expect(units[0].text).toBe('Standard text');
    });

    it('should correctly capture direction hints and inline parent tags', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div dir="rtl">
          <p>
            <span><strong>text</strong></span>
          </p>
        </div>
      `;
      document.body.appendChild(container);

      const units = collectBlockGroups(container);

      expect(units.length).toBe(1);
      expect(units[0].directionHint).toBe('rtl');
      expect(units[0].inlineParentTags).toEqual(['strong', 'span']);
    });

    it('should reject text nodes inside form controls, unsafe options, and contenteditable elements recursively, but not inside BUTTON (block grouping)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Translatable text outside.</p>
        <textarea>Should be rejected text.</textarea>
        <select>
          <option value="en">Safe option label.</option>
          <option>Unsafe implicit-value option text.</option>
        </select>
        <button><span>Should be translated nested button text.</span></button>
        <div contenteditable="true">Should be rejected editor text.</div>
        <div class="nested-editor"><p contenteditable="true">Should be rejected deeply nested editor text.</p></div>
      `;
      document.body.appendChild(container);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const units = collectBlockGroups(container);
        const collected = units.map(u => u.text.trim());
        expect(collected).toContain('Translatable text outside.');
        expect(collected).toContain('Should be translated nested button text.');
        expect(collected).toContain('Safe option label.');
        expect(collected).not.toContain('Should be rejected text.');
        expect(collected).not.toContain('Unsafe implicit-value option text.');
        expect(collected).not.toContain('Should be rejected editor text.');
        expect(collected).not.toContain('Should be rejected deeply nested editor text.');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects safe option labels in a selected parent under explicit V2 mode', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Ordinary text.</p>
        <select>
          <option value="en">English</option>
          <option>Persian</option>
          <option value="fa">Farsi</option>
        </select>
        <textarea>Should be rejected text.</textarea>
        <input type="text" value="Should be rejected text." />
      `;
      document.body.appendChild(container);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const nodes = collectTextNodes(container, { extractionMode: SelectElementExtractionMode.V2 });
        const collected = nodes.map(n => n.text.trim());
        expect(collected).toContain('Ordinary text.');
        expect(collected).toContain('English');
        expect(collected).toContain('Farsi');
        expect(collected).not.toContain('Persian');
        expect(collected).not.toContain('Should be rejected text.');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects safe option labels in a selected parent under explicit V3 mode', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Ordinary text.</p>
        <select>
          <option value="en">English</option>
          <option>Persian</option>
          <option value="fa">Farsi</option>
        </select>
        <textarea>Should be rejected text.</textarea>
        <input type="text" value="Should be rejected text." />
      `;
      document.body.appendChild(container);

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      try {
        const sessionContext = { blockMap: new WeakMap(), blockCounter: { value: 0 } };
        const units = collectBlockGroups(container, sessionContext, { extractionMode: SelectElementExtractionMode.V3 });
        const collected = units.map(u => u.text.trim());
        expect(collected).toContain('Ordinary text.');
        expect(collected).toContain('English');
        expect(collected).toContain('Farsi');
        expect(collected).not.toContain('Persian');
        expect(collected).not.toContain('Should be rejected text.');
} finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects text from an explicitly selected BUTTON root in block grouping (V3)', () => {
        const button = document.createElement('button');
      const span = document.createElement('span');
      span.textContent = 'Follow this account to see their updates';
      button.appendChild(span);
      document.body.appendChild(button);

      const sessionContext = { blockMap: new WeakMap(), blockCounter: { value: 0 } };

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible',
        whiteSpace: 'normal'
      });

      try {
        const units = collectBlockGroups(button, sessionContext, { extractionMode: SelectElementExtractionMode.V3 });
        expect(units.length).toBeGreaterThan(0);
        expect(units.map(u => u.text).join(' ')).toContain('Follow this account');
        expect(units.every(u => u.mode === 'standard')).toBe(true);
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('extracts text from a nested role=button subtree when a parent is selected (V3)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Readable parent text.</p>
        <div role="button"><span>Nested button label</span></div>
      `;
      document.body.appendChild(container);

      const sessionContext = { blockMap: new WeakMap(), blockCounter: { value: 0 } };

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible',
        whiteSpace: 'normal'
      });

      try {
        const units = collectBlockGroups(container, sessionContext, { extractionMode: SelectElementExtractionMode.V3 });
        const collected = units.map(u => u.text.trim());
        expect(collected).toContain('Readable parent text.');
        expect(collected).toContain('Nested button label');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects text from an explicitly selected role=button root in block grouping (V3)', () => {
      const root = document.createElement('div');
      root.setAttribute('role', 'button');
      const span = document.createElement('span');
      span.textContent = 'Open account settings and manage preferences';
      root.appendChild(span);
      document.body.appendChild(root);

      const sessionContext = { blockMap: new WeakMap(), blockCounter: { value: 0 } };

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible',
        whiteSpace: 'normal'
      });

      try {
        const units = collectBlockGroups(root, sessionContext, { extractionMode: SelectElementExtractionMode.V3 });
        expect(units.length).toBeGreaterThan(0);
        expect(units.map(u => u.text).join(' ')).toContain('Open account settings');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('collects an explicitly selected GitHub code-class root but excludes a nested code-class subtree (V3)', () => {
      const root = document.createElement('div');
      root.className = 'react-code-text';
      root.textContent = 'const value = 42;';
      document.body.appendChild(root);

      const sessionContext = { blockMap: new WeakMap(), blockCounter: { value: 0 } };

      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible',
        whiteSpace: 'normal'
      });

      try {
        const rootUnits = collectBlockGroups(root, sessionContext, { extractionMode: SelectElementExtractionMode.V3 });
        expect(rootUnits.length).toBe(1);
        expect(rootUnits[0].text.trim()).toBe('const value = 42;');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }

      const nested = document.createElement('div');
      const nestedLine = document.createElement('div');
      nestedLine.className = 'react-code-text';
      nestedLine.textContent = 'return 0;';
      nested.appendChild(document.createTextNode('Surrounding prose.'));
      nested.appendChild(nestedLine);
      document.body.appendChild(nested);

      try {
        const nestedUnits = collectBlockGroups(nested, sessionContext, { extractionMode: SelectElementExtractionMode.V3 });
        const collected = nestedUnits.map(u => u.text.trim());
        expect(collected).toContain('Surrounding prose.');
        expect(collected).not.toContain('return 0;');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });
  });

  describe('isExcludedAncestor', () => {
    it('should identify text nodes inside form controls but not inside BUTTON', () => {
      const textarea = document.createElement('textarea');
      textarea.textContent = 'text';
      expect(isExcludedAncestor(textarea.firstChild)).toBe(true);

      const button = document.createElement('button');
      const span = document.createElement('span');
      span.textContent = 'click';
      button.appendChild(span);
      expect(isExcludedAncestor(span.firstChild)).toBe(false);
    });

    it('should identify text nodes inside contenteditable containers', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      div.textContent = 'edit';
      expect(isExcludedAncestor(div.firstChild)).toBe(true);
      
      const divEmpty = document.createElement('div');
      divEmpty.setAttribute('contenteditable', ''); // standard implicit true
      divEmpty.textContent = 'edit';
      expect(isExcludedAncestor(divEmpty.firstChild)).toBe(true);
    });

    it('should identify custom interactive roles like role="textbox"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'textbox');
      div.textContent = 'custom';
      expect(isExcludedAncestor(div.firstChild)).toBe(true);
    });

    it('should correctly cross shadow DOM boundary to find ancestor hosts', () => {
      const container = document.createElement('div');
      const host = document.createElement('div');
      container.appendChild(host);
      
      const shadow = host.attachShadow({ mode: 'open' });
      const textarea = document.createElement('textarea');
      textarea.textContent = 'shadow text';
      shadow.appendChild(textarea);
      
      const textNode = textarea.firstChild;
      expect(isExcludedAncestor(textNode)).toBe(true);
    });

    it('should reject internal content when host has a notranslate marker', () => {
      const host = document.createElement('div');
      host.setAttribute('translate', 'no');
      const shadow = host.attachShadow({ mode: 'open' });
      const span = document.createElement('span');
      span.textContent = 'shadow text';
      shadow.appendChild(span);

      expect(isExcludedAncestor(span.firstChild)).toBe(true);
    });
  });
});

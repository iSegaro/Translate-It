import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractContextMetadata, collectTextNodes, generateElementId, collectBlockGroups, isExcludedAncestor } from './DomTranslatorUtils.js';

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

    it('should reject text nodes inside interactive elements (textarea, input, select, button) and contenteditable elements recursively', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Translatable text outside.</p>
        <textarea>Should be rejected text.</textarea>
        <input type="text" value="Should be rejected text." />
        <select>
          <option>Should be rejected option text.</option>
        </select>
        <button><span>Should be rejected nested button text.</span></button>
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
        expect(textNodes.length).toBe(1);
        expect(textNodes[0].text.trim()).toBe('Translatable text outside.');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });
  });

  describe('collectBlockGroups', () => {
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

      const units = collectBlockGroups(container);

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

    it('should reject text nodes inside interactive elements (textarea, input, select, button) and contenteditable elements in block grouping mode recursively', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Translatable text outside.</p>
        <textarea>Should be rejected text.</textarea>
        <select>
          <option>Should be rejected option text.</option>
        </select>
        <button><span>Should be rejected nested button text.</span></button>
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
        expect(units.length).toBe(1);
        expect(units[0].text.trim()).toBe('Translatable text outside.');
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });
  });

  describe('isExcludedAncestor', () => {
    it('should correctly identify text nodes inside normal interactive tags', () => {
      const textarea = document.createElement('textarea');
      textarea.textContent = 'text';
      expect(isExcludedAncestor(textarea.firstChild)).toBe(true);

      const button = document.createElement('button');
      const span = document.createElement('span');
      span.textContent = 'click';
      button.appendChild(span);
      expect(isExcludedAncestor(span.firstChild)).toBe(true);
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
  });
});

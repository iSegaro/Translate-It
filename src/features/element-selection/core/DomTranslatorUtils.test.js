import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractContextMetadata, collectTextNodes, generateElementId } from './DomTranslatorUtils.js';

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
  });
});

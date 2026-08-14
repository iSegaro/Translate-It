import { describe, it, expect } from 'vitest';

/**
 * Focused DOM regression for the E3A safety assumption:
 * OPTION labels participate in Select Element translation only when the
 * option carries an explicit value attribute. Implicit-value options derive
 * option.value / form-submission value from their text content, so mutating
 * the label silently changes the logical value observed by page JS and forms.
 * jsdom implements the same algorithm as the HTML spec; browsers match.
 */
describe('OPTION value semantics in jsdom', () => {
  function makeSelect(specs) {
    const select = document.createElement('select');
    for (const [label, value] of specs) {
      const option = document.createElement('option');
      if (value !== undefined) option.setAttribute('value', value);
      option.textContent = label;
      select.appendChild(option);
    }
    document.body.appendChild(select);
    return select;
  }

  it('explicit value option: text mutation does not change option.value', () => {
    const select = makeSelect([['English', 'en'], ['Persian', 'fa']]);
    const opt = select.options[0];
    expect(opt.value).toBe('en');
    expect(opt.textContent).toBe('English');
    opt.firstChild.nodeValue = 'Translator';
    expect(opt.value).toBe('en');
    expect(opt.textContent).toBe('Translator');
  });

  it('implicit value option: text mutation DOES change option.value', () => {
    const select = makeSelect([['English'], ['Persian']]);
    const opt = select.options[0];
    expect(opt.value).toBe('English');
    opt.firstChild.nodeValue = 'Translator';
    expect(opt.value).toBe('Translator');
  });

  it('selected state and selectedIndex are preserved under text mutation', () => {
    const select = makeSelect([['English', 'en'], ['Persian', 'fa']]);
    select.selectedIndex = 1;
    const opt1 = select.options[1];
    expect(select.selectedIndex).toBe(1);
    expect(opt1.selected).toBe(true);
    opt1.firstChild.nodeValue = 'Persianized';
    expect(select.selectedIndex).toBe(1);
    expect(opt1.selected).toBe(true);
    expect(opt1.value).toBe('fa');
  });

  it('explicit value attribute node survives text mutation', () => {
    const select = makeSelect([['English', 'en']]);
    const opt = select.options[0];
    const attrNode = opt.attributes.getNamedItem('value');
    expect(attrNode.value).toBe('en');
    opt.firstChild.nodeValue = 'X';
    expect(opt.attributes.getNamedItem('value').value).toBe('en');
    expect(opt.attributes.getNamedItem('value')).toBe(attrNode);
  });

  it('form submission value reflects implicit option text', () => {
    const form = document.createElement('form');
    const select = makeSelect([['English']]);
    select.setAttribute('name', 'lang');
    form.appendChild(select);
    document.body.appendChild(form);
    select.options[0].firstChild.nodeValue = 'Translated';
    const data = new FormData(form);
    expect(data.get('lang')).toBe('Translated');
  });
});

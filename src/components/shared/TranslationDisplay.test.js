import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import TranslationDisplay from './TranslationDisplay.vue';
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js';
import { TranslationMode } from '@/shared/config/config.js';

vi.mock('@/composables/shared/useTextDirection.js', () => ({
  useTextDirection: () => ({
    direction: ref('ltr'),
    textAlign: ref('left'),
  }),
}));

vi.mock('@/composables/shared/useFont.js', () => ({
  useFont: () => ({
    fontStyles: ref({}),
    cssVariables: ref({}),
  }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key,
    locale: ref('en'),
  }),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    isDarkTheme: false,
  }),
}));

vi.mock('@/features/text-actions/components/ActionToolbar.vue', () => ({
  default: {
    name: 'ActionToolbar',
    template: '<div class="action-toolbar-stub" />',
  },
}));

vi.mock('@/components/base/LoadingSpinner.vue', () => ({
  default: {
    name: 'LoadingSpinner',
    template: '<div class="loading-spinner-stub" />',
  },
}));

describe('TranslationDisplay.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mountDisplay = async (props) => {
    const wrapper = mount(TranslationDisplay, {
      props: {
        showToolbar: false,
        enableMarkdown: true,
        ...props,
      },
    });

    await nextTick();
    return wrapper;
  };

  it('renders normalized Google bold-label markdown through the modern marked path', async () => {
    const renderSpy = vi.spyOn(SimpleMarkdown, 'render');
    const wrapper = await mountDisplay({
      content: '**Noun**: test, experiment\n\n**Pronunciation**: /tɛst/\n\n**Definitions**:\n- (noun) a test\n\n**Examples**:\n- This is a test',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    expect(renderSpy).not.toHaveBeenCalled();
    const markdown = wrapper.find('.simple-markdown');
    expect(markdown.exists()).toBe(true);
    expect(markdown.find('strong').text()).toBe('Noun');
    expect(markdown.text()).toContain('Pronunciation');
    expect(markdown.find('a').exists()).toBe(false);
  });

  it('renders Vajehyab markdown-like output through the modern marked path', async () => {
    const renderSpy = vi.spyOn(SimpleMarkdown, 'render');
    const wrapper = await mountDisplay({
      content: '### سلام [salām]\n*اسم*\n\n---\n\n**معنی (لغت‌نامه عمید)**:\nدرود، تحیت',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    expect(renderSpy).not.toHaveBeenCalled();
    const markdown = wrapper.find('.simple-markdown');
    expect(markdown.exists()).toBe(true);
    expect(markdown.find('h3').text()).toBe('سلام [salām]');
    expect(markdown.find('em').text()).toBe('اسم');
    expect(markdown.find('strong').text()).toBe('معنی (لغت‌نامه عمید)');
  });

  it('marks label paragraphs followed by lists for tighter spacing', async () => {
    const wrapper = await mountDisplay({
      content: '**Definitions**:\n- item',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    const group = wrapper.find('.md-label-list-group');
    const paragraph = group.find('p.md-label-paragraph');
    const list = group.find('ul.md-label-list');

    expect(group.exists()).toBe(true);
    expect(paragraph.exists()).toBe(true);
    expect(paragraph.text()).toBe('Definitions:');
    expect(list.exists()).toBe(true);
    expect(list.text()).toBe('item');
    expect(list.element.firstChild?.nodeType).toBe(Node.ELEMENT_NODE);
  });

  it('does not add label spacing classes for ordinary paragraph/list content', async () => {
    const wrapper = await mountDisplay({
      content: 'Intro text\n\n- item',
      lastTranslation: null,
    });

    expect(wrapper.find('.md-label-list-group').exists()).toBe(false);
    expect(wrapper.find('p.md-label-paragraph').exists()).toBe(false);
    expect(wrapper.find('ul.md-label-list').exists()).toBe(false);
  });

  it('falls back to SimpleMarkdown for legacy one-line concatenated output', async () => {
    const renderSpy = vi
      .spyOn(SimpleMarkdown, 'render')
      .mockImplementation(() => {
        const el = document.createElement('div');
        el.className = 'simple-markdown';
        el.innerHTML = '<p>translation</p>';
        return el;
      });

    const wrapper = await mountDisplay({
      content: 'translation **Noun**: hello, hi',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    expect(renderSpy).toHaveBeenCalled();
    expect(wrapper.find('.simple-markdown').exists()).toBe(true);
    expect(wrapper.find('.simple-markdown').text()).toBe('translation');
  });

  it('falls back to SimpleMarkdown for same-line multi-label legacy output', async () => {
    const renderSpy = vi
      .spyOn(SimpleMarkdown, 'render')
      .mockImplementation(() => {
        const el = document.createElement('div');
        el.className = 'simple-markdown';
        el.innerHTML = '<p>UK: hello US: hi</p>';
        return el;
      });

    const wrapper = await mountDisplay({
      content: '**UK**: hello **US**: hi',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    expect(renderSpy).toHaveBeenCalled();
    expect(wrapper.find('.simple-markdown').text()).toBe('UK: hello US: hi');
  });

  it('falls back to SimpleMarkdown for plain Label: content only in dictionary mode', async () => {
    const renderSpy = vi
      .spyOn(SimpleMarkdown, 'render')
      .mockImplementation(() => {
        const el = document.createElement('div');
        el.className = 'simple-markdown';
        el.innerHTML = '<p>Noun: test, experiment</p>';
        return el;
      });

    const dictionaryWrapper = await mountDisplay({
      content: 'Noun: test, experiment',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    expect(renderSpy).toHaveBeenCalled();
    expect(dictionaryWrapper.find('.simple-markdown').text()).toBe('Noun: test, experiment');

    renderSpy.mockClear();

    const normalWrapper = await mountDisplay({
      content: 'Noun: test, experiment',
      lastTranslation: null,
    });

    expect(renderSpy).not.toHaveBeenCalled();
    expect(normalWrapper.find('.simple-markdown').exists()).toBe(true);
    expect(normalWrapper.find('.simple-markdown').text()).toBe('Noun: test, experiment');
  });

  it('preserves the simple-markdown wrapper in the rendered HTML', async () => {
    const wrapper = await mountDisplay({
      content: '**Noun**: test, experiment',
      lastTranslation: {
        mode: TranslationMode.Dictionary_Translation,
      },
    });

    expect(wrapper.find('.simple-markdown').exists()).toBe(true);
  });

  it('neutralizes unsafe links and removes their href', async () => {
    const wrapper = await mountDisplay({
      content: '[Click](javascript:alert(1))',
      lastTranslation: null,
    });

    expect(wrapper.find('.simple-markdown').exists()).toBe(true);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toContain('Click');
    expect(wrapper.html()).not.toContain('javascript:');
  });

  it('strips raw HTML XSS attributes from rendered content', async () => {
    const wrapper = await mountDisplay({
      content: '<img src=x onerror=alert(1)>',
      lastTranslation: null,
    });

    expect(wrapper.html()).not.toContain('onerror');
    expect(wrapper.html()).not.toContain('alert(1)');
    expect(wrapper.element.querySelector('[onerror]')).toBeNull();
  });

  it('keeps safe links with target blank and noopener noreferrer', async () => {
    const wrapper = await mountDisplay({
      content: '[Click](https://example.com)',
      lastTranslation: null,
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });
});

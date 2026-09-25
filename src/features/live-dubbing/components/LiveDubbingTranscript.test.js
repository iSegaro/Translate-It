import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import LiveDubbingTranscript from './LiveDubbingTranscript.vue';
import {
  acceptLiveDubbingTranscript,
  resetLiveDubbingTranscriptState,
} from '../content/liveDubbingTranscriptStore.js';

const envelope = (eventSequence, text, kind = 'translated') => ({
  sessionId: 'session-1',
  providerId: 'gemini',
  eventSequence,
  transcriptSequence: eventSequence,
  transcript: { kind, text },
});

describe('LiveDubbingTranscript renderer', () => {
  beforeEach(() => resetLiveDubbingTranscriptState());

  it('renders source above translated as two rows, both dir=auto', async () => {
    acceptLiveDubbingTranscript(envelope(1, 'Hello world'));
    acceptLiveDubbingTranscript(envelope(2, 'Bonjour le monde', 'source'));

    const wrapper = mount(LiveDubbingTranscript, {
      props: { showTranslatedTranscript: true, showOriginalTranscript: true },
    });
    const container = wrapper.find('.live-dubbing-transcript');
    const source = wrapper.find('.live-dubbing-transcript__source');
    const translated = wrapper.find('.live-dubbing-transcript__translated');

    expect(container.exists()).toBe(true);
    expect(container.attributes('aria-live')).toBeUndefined();
    expect(container.attributes('aria-atomic')).toBeUndefined();
    expect(source.text()).toBe('Bonjour le monde');
    expect(translated.text()).toBe('Hello world');
    expect(source.attributes('dir')).toBe('auto');
    expect(translated.attributes('dir')).toBe('auto');
    // Source row sits above the primary translated row.
    expect(source.element.nextElementSibling).toBe(translated.element);

    wrapper.unmount();
  });

  it('renders only the primary translated row when no source is present', () => {
    acceptLiveDubbingTranscript(envelope(1, 'Only translated'));

    const wrapper = mount(LiveDubbingTranscript, { props: { showTranslatedTranscript: true } });

    expect(wrapper.find('.live-dubbing-transcript__translated').text()).toBe('Only translated');
    expect(wrapper.find('.live-dubbing-transcript__source').exists()).toBe(false);

    wrapper.unmount();
  });

  it('renders only the source row when no translation is present', () => {
    acceptLiveDubbingTranscript(envelope(1, 'Only source', 'source'));

    const wrapper = mount(LiveDubbingTranscript, { props: { showOriginalTranscript: true } });

    expect(wrapper.find('.live-dubbing-transcript__source').text()).toBe('Only source');
    expect(wrapper.find('.live-dubbing-transcript__translated').exists()).toBe(false);

    wrapper.unmount();
  });

  it('renders nothing while the store is empty', () => {
    const wrapper = mount(LiveDubbingTranscript);

    expect(wrapper.find('.live-dubbing-transcript').exists()).toBe(false);

    wrapper.unmount();
  });

  it.each([
    ['translated only', { showTranslatedTranscript: true }, 'translated', 'translated only'],
    ['original only', { showOriginalTranscript: true }, 'source', 'original only'],
  ])('renders %s according to its preference', (_name, props, kind, text) => {
    acceptLiveDubbingTranscript(envelope(1, text, kind));
    const wrapper = mount(LiveDubbingTranscript, { props });

    expect(wrapper.find(`.live-dubbing-transcript__${kind}`).text()).toBe(text);
    expect(wrapper.find('.live-dubbing-transcript').exists()).toBe(true);
    expect(wrapper.find(`.live-dubbing-transcript__${kind === 'source' ? 'translated' : 'source'}`).exists())
      .toBe(false);
    wrapper.unmount();
  });

  it('renders nothing when both transcript displays are disabled', () => {
    acceptLiveDubbingTranscript(envelope(1, 'Hidden translated'));
    acceptLiveDubbingTranscript(envelope(2, 'Hidden source', 'source'));
    const wrapper = mount(LiveDubbingTranscript, {
      props: { showTranslatedTranscript: false, showOriginalTranscript: false },
    });

    expect(wrapper.find('.live-dubbing-transcript').exists()).toBe(false);
    wrapper.unmount();
  });

  it('updates both rows reactively through the store subscription', async () => {
    const wrapper = mount(LiveDubbingTranscript, {
      props: { showTranslatedTranscript: true, showOriginalTranscript: true },
    });
    expect(wrapper.find('.live-dubbing-transcript').exists()).toBe(false);

    acceptLiveDubbingTranscript(envelope(1, 'Hi'));
    acceptLiveDubbingTranscript(envelope(2, 'Salut', 'source'));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.live-dubbing-transcript__translated').text()).toBe('Hi');
    expect(wrapper.find('.live-dubbing-transcript__source').text()).toBe('Salut');

    wrapper.unmount();
  });

  it('keeps both rows non-interactive with feature-local styles only', () => {
    const vueSource = readFileSync('src/features/live-dubbing/components/LiveDubbingTranscript.vue', 'utf8');
    const scss = readFileSync('src/features/live-dubbing/components/LiveDubbingTranscript.scss', 'utf8');

    // No click capture on the transcript surface.
    expect(vueSource).not.toMatch(/@click|v-on:click|addEventListener/);
    expect(scss).toContain('pointer-events: none');
    expect(scss).toContain('.live-dubbing-transcript__source');
    expect(scss).toContain('.live-dubbing-transcript__translated');
  });

  it('keeps the visible transcript surface bounded and pinned to newest text', () => {
    const scss = readFileSync('src/features/live-dubbing/components/LiveDubbingTranscript.scss', 'utf8');
    const source = scss.match(
      /\.live-dubbing-transcript__source\s*\{\s*color:[\s\S]*?\n\}/
    )?.[0];
    const translated = scss.match(
      /\.live-dubbing-transcript__translated\s*\{\s*font-size:[\s\S]*?\n\}/
    )?.[0];

    expect(source).toMatch(/font-size:\s*clamp\(16px,\s*1\.5vw,\s*19px\)/);
    expect(source).toMatch(/font-weight:\s*500/);
    expect(source).toMatch(/line-height:\s*1\.35(?:\s*!important)?/);
    expect(source).toMatch(/rgb\(255\s+255\s+255\s*\/\s*82%\)/);
    expect(source).not.toMatch(/font-size:[^;]*(?:rem|em)/);
    expect(source).toMatch(/max-height:\s*1\.35em/);

    expect(translated).toMatch(/font-size:\s*clamp\(20px,\s*2vw,\s*26px\)/);
    expect(translated).toMatch(/font-weight:\s*500/);
    expect(translated).toMatch(/line-height:\s*1\.35(?:\s*!important)?/);
    expect(translated).not.toMatch(/font-size:[^;]*(?:rem|em)/);
    expect(translated).toMatch(/max-height:\s*2\.7em/);

    expect(scss).not.toMatch(/-webkit-line-clamp/);
    expect(scss).toMatch(/justify-content:\s*flex-end/);
    expect(scss).toMatch(/overflow:\s*hidden/);
    expect(scss).toMatch(/min-width:\s*0/);
    expect(scss).toMatch(/overflow-wrap:\s*anywhere/);
    expect(scss).toMatch(/word-break:\s*break-word/);
    expect(scss).toMatch(/box-sizing:\s*border-box/);
    expect(scss).toMatch(/@media\s*\(max-width:\s*36rem\),\s*\(max-height:\s*30rem\)/);
  });
});

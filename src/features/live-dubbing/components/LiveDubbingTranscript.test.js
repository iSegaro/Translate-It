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

    const wrapper = mount(LiveDubbingTranscript);
    const container = wrapper.find('.live-dubbing-transcript');
    const source = wrapper.find('.live-dubbing-transcript__source');
    const translated = wrapper.find('.live-dubbing-transcript__translated');

    expect(container.exists()).toBe(true);
    expect(container.attributes('aria-live')).toBe('polite');
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

    const wrapper = mount(LiveDubbingTranscript);

    expect(wrapper.find('.live-dubbing-transcript__translated').text()).toBe('Only translated');
    expect(wrapper.find('.live-dubbing-transcript__source').exists()).toBe(false);

    wrapper.unmount();
  });

  it('renders only the source row when no translation is present', () => {
    acceptLiveDubbingTranscript(envelope(1, 'Only source', 'source'));

    const wrapper = mount(LiveDubbingTranscript);

    expect(wrapper.find('.live-dubbing-transcript__source').text()).toBe('Only source');
    expect(wrapper.find('.live-dubbing-transcript__translated').exists()).toBe(false);

    wrapper.unmount();
  });

  it('renders nothing while the store is empty', () => {
    const wrapper = mount(LiveDubbingTranscript);

    expect(wrapper.find('.live-dubbing-transcript').exists()).toBe(false);

    wrapper.unmount();
  });

  it('updates both rows reactively through the store subscription', async () => {
    const wrapper = mount(LiveDubbingTranscript);
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
});

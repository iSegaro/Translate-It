import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LiveCaptionOverlay from './LiveCaptionOverlay.vue';
import LiveCaptionCaptionTrack from './LiveCaptionCaptionTrack.vue';
import LiveCaptionControls from './LiveCaptionControls.vue';
import { LIVE_CAPTION_CAPTION_DISPLAY_MODES } from '../core/LiveCaptionCaptionDisplayMode.js';

const mocks = vi.hoisted(() => ({
  translationAdapter: vi.fn(),
  sttFactory: vi.fn(),
  offscreenBridge: vi.fn(),
  cacheFacade: vi.fn()
}));

vi.mock('@/features/live-caption/background/LiveCaptionTranslationAdapter.js', () => ({
  LiveCaptionTranslationAdapter: mocks.translationAdapter
}));

vi.mock('@/features/live-caption/stt/STTProviderFactory.js', () => ({
  STTProviderFactory: mocks.sttFactory
}));

vi.mock('@/features/live-caption/background/LiveCaptionOffscreenBridge.js', () => ({
  LiveCaptionOffscreenBridge: mocks.offscreenBridge
}));

vi.mock('@/features/live-caption/cache/LiveCaptionCache.js', () => ({
  LiveCaptionCache: mocks.cacheFacade
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption overlay shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders idle, active, and error shell states', async () => {
    const wrapper = mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        runtimeStatus: 'running',
        activeSessionState: 'active',
        activeVideoState: {
          videoFingerprint: 'video-1'
        },
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 100,
            segmentEndMs: 200,
            originalText: 'Hello',
            translatedText: 'سلام',
            isFinal: true
          }
        ],
        controlsState: {
          canStart: true,
          canStop: true,
          canRetry: true,
          canClearCache: true
        }
      }
    });

    expect(wrapper.attributes('data-status')).toBe('idle');
    expect(wrapper.attributes('data-runtime-status')).toBe('running');
    expect(wrapper.attributes('data-active-session-state')).toBe('active');
    expect(wrapper.attributes('data-active-video-fingerprint')).toBe('video-1');
    expect(wrapper.find('.live-caption-caption-track').exists()).toBe(true);
    expect(wrapper.text()).toContain('سلام');
    expect(wrapper.text()).not.toContain('Hello');

    await wrapper.setProps({ status: 'active' });
    expect(wrapper.attributes('data-status')).toBe('active');

    await wrapper.setProps({ status: 'error', lastError: { message: 'boom' } });
    expect(wrapper.find('.live-caption-overlay__error').text()).toBe('boom');
  });

  it('renders finalized caption lines only', () => {
    const wrapper = mount(LiveCaptionCaptionTrack, {
      props: {
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 100,
            segmentEndMs: 200,
            originalText: 'Hello',
            translatedText: 'سلام',
            isFinal: true
          },
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 200,
            segmentEndMs: 300,
            originalText: 'Partial',
            translatedText: 'درحال',
            isFinal: false
          }
        ]
      }
    });

    expect(wrapper.findAll('.live-caption-caption-line')).toHaveLength(1);
    expect(wrapper.text()).toContain('سلام');
    expect(wrapper.text()).not.toContain('Hello');
    expect(wrapper.text()).not.toContain('Partial');
  });

  it('renders transcript-only and bilingual caption display modes', () => {
    const transcriptOnlyWrapper = mount(LiveCaptionCaptionTrack, {
      props: {
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 100,
            segmentEndMs: 200,
            originalText: 'Hello',
            translatedText: 'سلام',
            isFinal: true
          }
        ]
      }
    });

    expect(transcriptOnlyWrapper.text()).toContain('Hello');
    expect(transcriptOnlyWrapper.text()).not.toContain('سلام');

    const bilingualWrapper = mount(LiveCaptionCaptionTrack, {
      props: {
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 100,
            segmentEndMs: 200,
            originalText: 'Hello',
            translatedText: 'سلام',
            isFinal: true
          }
        ]
      }
    });

    expect(bilingualWrapper.text()).toContain('Hello');
    expect(bilingualWrapper.text()).toContain('سلام');
  });

  it('defaults to translated-only rendering when no display mode is supplied', () => {
    const wrapper = mount(LiveCaptionCaptionTrack, {
      props: {
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 100,
            segmentEndMs: 200,
            originalText: 'Hello',
            translatedText: 'سلام',
            isFinal: true
          }
        ]
      }
    });

    expect(wrapper.text()).toContain('سلام');
    expect(wrapper.text()).not.toContain('Hello');
  });


  it('emits control actions only', async () => {
    const wrapper = mount(LiveCaptionControls, {
      props: {
        controlsState: {
          canStart: true,
          canStop: true,
          canPause: true,
          canResume: true,
          canRetry: true,
          canClearCache: true
        }
      }
    });

    const buttons = wrapper.findAll('button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');
    await buttons[3].trigger('click');
    await buttons[4].trigger('click');
    await buttons[5].trigger('click');

    expect(wrapper.emitted('start')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    expect(wrapper.emitted('pause')).toHaveLength(1);
    expect(wrapper.emitted('resume')).toHaveLength(1);
    expect(wrapper.emitted('retry')).toHaveLength(1);
    expect(wrapper.emitted('clear-cache')).toHaveLength(1);
  });

  it('does not call STT, capture, translation, or cache modules', () => {
    mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY,
        captionLines: []
      }
    });

    expect(mocks.translationAdapter).not.toHaveBeenCalled();
    expect(mocks.sttFactory).not.toHaveBeenCalled();
    expect(mocks.offscreenBridge).not.toHaveBeenCalled();
    expect(mocks.cacheFacade).not.toHaveBeenCalled();
  });

  it('updates reactively on new translated segments, formats per-line timing, and renders multiple lines', async () => {
    const wrapper = mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        runtimeStatus: 'running',
        activeSessionState: 'active',
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 1000,
            segmentEndMs: 3000,
            originalText: 'Hello',
            translatedText: 'سلام',
            isFinal: true
          }
        ]
      }
    });

    expect(wrapper.text()).toContain('سلام');
    expect(wrapper.text()).toContain('Hello');
    expect(wrapper.text()).toContain('1s - 3s');
    expect(wrapper.findAll('.live-caption-caption-line')).toHaveLength(1);

    await wrapper.setProps({
      captionLines: [
        {
          sessionId: 'session-1',
          videoFingerprint: 'video-1',
          startMs: 1000,
          endMs: 3000,
          originalText: 'Hello',
          translatedText: 'سلام',
          isFinal: true
        },
        {
          sessionId: 'session-1',
          videoFingerprint: 'video-1',
          segmentStartMs: 4000,
          segmentEndMs: 6000,
          originalText: 'World',
          translatedText: 'جهان',
          isFinal: true
        }
      ]
    });

    expect(wrapper.text()).toContain('سلام');
    expect(wrapper.text()).toContain('جهان');
    expect(wrapper.text()).toContain('1s - 3s');
    expect(wrapper.text()).toContain('4s - 6s');
    expect(wrapper.findAll('.live-caption-caption-line')).toHaveLength(2);
  });

  it('filters empty, incomplete, or non-final segments', async () => {
    const wrapper = mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        runtimeStatus: 'running',
        activeSessionState: 'active',
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 1000,
            segmentEndMs: 3000,
            originalText: '',
            translatedText: '  ',
            isFinal: true
          },
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 4000,
            segmentEndMs: 6000,
            originalText: 'Valid',
            translatedText: 'معتبر',
            isFinal: true
          },
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 7000,
            segmentEndMs: 9000,
            originalText: 'Non-final',
            translatedText: 'غیر نهایی',
            isFinal: false
          }
        ]
      }
    });

    expect(wrapper.text()).toContain('معتبر');
    expect(wrapper.text()).not.toContain('Non-final');
    expect(wrapper.findAll('.live-caption-caption-line')).toHaveLength(1);
  });

  it('forwards start, stop, pause, resume, and retry events from controls', async () => {
    const wrapper = mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        runtimeStatus: 'running',
        activeSessionState: 'active',
        controlsState: {
          canStart: true,
          canStop: true,
          canPause: true,
          canResume: true,
          canRetry: true,
          canClearCache: false
        }
      }
    });

    const controls = wrapper.findComponent(LiveCaptionControls);
    expect(controls.exists()).toBe(true);

    controls.vm.$emit('start');
    controls.vm.$emit('stop');
    controls.vm.$emit('pause');
    controls.vm.$emit('resume');
    controls.vm.$emit('retry');

    expect(wrapper.emitted('start')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    expect(wrapper.emitted('pause')).toHaveLength(1);
    expect(wrapper.emitted('resume')).toHaveLength(1);
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('limits rendering to the most recent 2 caption segments and keeps bilingual pairs together', () => {
    const wrapper = mount(LiveCaptionCaptionTrack, {
      props: {
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 1000,
            segmentEndMs: 2000,
            originalText: 'Line 1 Original',
            translatedText: 'Line 1 Translation',
            isFinal: true
          },
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 2000,
            segmentEndMs: 3000,
            originalText: 'Line 2 Original',
            translatedText: 'Line 2 Translation',
            isFinal: true
          },
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 3000,
            segmentEndMs: 4000,
            originalText: 'Line 3 Original',
            translatedText: 'Line 3 Translation',
            isFinal: true
          }
        ]
      }
    });

    const lines = wrapper.findAll('.live-caption-caption-line');
    expect(lines).toHaveLength(2);

    // Should only contain Line 2 and Line 3 (the most recent ones)
    expect(wrapper.text()).not.toContain('Line 1 Original');
    expect(wrapper.text()).not.toContain('Line 1 Translation');
    expect(wrapper.text()).toContain('Line 2 Original');
    expect(wrapper.text()).toContain('Line 2 Translation');
    expect(wrapper.text()).toContain('Line 3 Original');
    expect(wrapper.text()).toContain('Line 3 Translation');
  });

  it('keeps DOM order chronological while reversing only the visual stacking in CSS', () => {
    const wrapper = mount(LiveCaptionCaptionTrack, {
      props: {
        captionDisplayMode: LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY,
        captionLines: [
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 1000,
            segmentEndMs: 2000,
            originalText: 'Older caption',
            translatedText: 'Older caption translated',
            isFinal: true
          },
          {
            sessionId: 'session-1',
            videoFingerprint: 'video-1',
            segmentStartMs: 2000,
            segmentEndMs: 3000,
            originalText: 'Newer caption',
            translatedText: 'Newer caption translated',
            isFinal: true
          }
        ]
      }
    });

    const renderedLines = wrapper.findAll('.live-caption-caption-line');

    expect(renderedLines).toHaveLength(2);
    expect(renderedLines[0].text()).toContain('Older caption');
    expect(renderedLines[1].text()).toContain('Newer caption');

    const stylesheet = readFileSync(resolve('src/features/live-caption/overlay/LiveCaptionOverlay.scss'), 'utf8');
    expect(stylesheet).toContain('flex-direction: column-reverse');
  });
});

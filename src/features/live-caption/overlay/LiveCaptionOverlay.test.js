import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LiveCaptionOverlay from './LiveCaptionOverlay.vue';
import LiveCaptionConsentNotice from './LiveCaptionConsentNotice.vue';
import LiveCaptionCaptionTrack from './LiveCaptionCaptionTrack.vue';
import LiveCaptionControls from './LiveCaptionControls.vue';

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
        consentAccepted: true,
        showConsentNotice: false,
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
    expect(wrapper.find('.live-caption-caption-track').exists()).toBe(true);

    await wrapper.setProps({ status: 'active' });
    expect(wrapper.attributes('data-status')).toBe('active');

    await wrapper.setProps({ status: 'error', lastError: { message: 'boom' } });
    expect(wrapper.find('.live-caption-overlay__error').text()).toBe('boom');
  });

  it('blocks captions until consent is accepted', async () => {
    const wrapper = mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        consentAccepted: false,
        showConsentNotice: true,
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

    expect(wrapper.findComponent(LiveCaptionConsentNotice).exists()).toBe(true);
    expect(wrapper.findComponent(LiveCaptionCaptionTrack).exists()).toBe(false);

    await wrapper.setProps({ showConsentNotice: false, consentAccepted: true });
    expect(wrapper.findComponent(LiveCaptionConsentNotice).exists()).toBe(false);
    expect(wrapper.findComponent(LiveCaptionCaptionTrack).exists()).toBe(true);
  });

  it('renders finalized caption lines only', () => {
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
    expect(wrapper.text()).toContain('Hello');
    expect(wrapper.text()).not.toContain('Partial');
  });

  it('emits consent actions only', async () => {
    const wrapper = mount(LiveCaptionConsentNotice, {
      props: {
        visible: true
      }
    });

    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.findAll('button')[1].trigger('click');

    expect(wrapper.emitted('accept')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('emits control actions only', async () => {
    const wrapper = mount(LiveCaptionControls, {
      props: {
        controlsState: {
          canStart: true,
          canStop: true,
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

    expect(wrapper.emitted('start')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    expect(wrapper.emitted('retry')).toHaveLength(1);
    expect(wrapper.emitted('clear-cache')).toHaveLength(1);
  });

  it('does not call STT, capture, translation, or cache modules', () => {
    mount(LiveCaptionOverlay, {
      props: {
        visible: true,
        status: 'idle',
        consentAccepted: true,
        showConsentNotice: false,
        captionLines: []
      }
    });

    expect(mocks.translationAdapter).not.toHaveBeenCalled();
    expect(mocks.sttFactory).not.toHaveBeenCalled();
    expect(mocks.offscreenBridge).not.toHaveBeenCalled();
    expect(mocks.cacheFacade).not.toHaveBeenCalled();
  });
});

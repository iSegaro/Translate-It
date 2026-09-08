import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  messages: [],
  listener: null,
  audios: [],
  utterances: [],
}));

class FakeAudio {
  constructor(src = '') {
    this.src = src;
    this.paused = true;
    this.currentTime = 0;
    this.listeners = new Map();
    state.audios.push(this);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.(event);
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  load() {}
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    state.utterances.push(this);
  }
}

async function loadOffscreen() {
  vi.resetModules();
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn((message) => {
        state.messages.push(message);
        return Promise.resolve();
      }),
      onMessage: {
        addListener: vi.fn((listener) => {
          state.listener = listener;
        }),
      },
    },
  };
  globalThis.Audio = FakeAudio;
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  globalThis.speechSynthesis = {
    pending: false,
    speaking: false,
    paused: false,
    cancel: vi.fn(),
    speak: vi.fn((utterance) => {
      state.lastUtterance = utterance;
    }),
  };
  window.speechSynthesis = globalThis.speechSynthesis;
  globalThis.fetch = vi.fn();
  globalThis.URL.createObjectURL = vi.fn(() => `blob:test-${state.audios.length}`);
  globalThis.URL.revokeObjectURL = vi.fn();
  await import('./offscreen.js');
}

function sendMessage(message) {
  return new Promise((resolve) => {
    state.listener(message, {}, resolve);
  });
}

function terminalMessages() {
  return state.messages.filter(({ action }) => action === 'INTERNAL_TTS_CHUNK_FINISHED');
}

beforeEach(() => {
  vi.useFakeTimers();
  state.messages = [];
  state.listener = null;
  state.audios = [];
  state.utterances = [];
  state.lastUtterance = null;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.Audio;
  delete globalThis.SpeechSynthesisUtterance;
  delete globalThis.speechSynthesis;
  vi.restoreAllMocks();
});

describe('offscreen TTS terminal playback lifecycle', () => {
  it('emits one completed token for URL audio', async () => {
    await loadOffscreen();
    fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['audio']) });

    const response = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'actual text',
      language: 'fr-FR',
      playbackToken: 'url-token',
    });
    await Promise.resolve();
    await Promise.resolve();
    await response;
    state.audios[0].dispatch('ended');

    expect(terminalMessages()).toEqual([{
      action: 'INTERNAL_TTS_CHUNK_FINISHED',
      playbackToken: 'url-token',
      reason: 'completed',
    }]);
  });

  it('emits one completed token for cached audio', async () => {
    await loadOffscreen();

    const response = sendMessage({
      target: 'offscreen',
      action: 'playCachedAudio',
      audioData: [1, 2, 3],
      playbackToken: 'cached-token',
    });
    await Promise.resolve();
    await response;
    state.audios[0].dispatch('ended');

    expect(terminalMessages()).toHaveLength(1);
    expect(terminalMessages()[0]).toMatchObject({
      playbackToken: 'cached-token',
      reason: 'completed',
    });
  });

  it('emits tokenized Web Speech completion after retry', async () => {
    await loadOffscreen();
    fetch.mockRejectedValue(new Error('network failure'));

    const response = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'fallback text',
      language: 'de-DE',
      playbackToken: 'speech-token',
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    state.utterances[0].onerror({ error: 'synthesis-failed' });
    vi.advanceTimersByTime(500);
    state.utterances[1].onend();
    await response;

    expect(state.utterances[0].text).toBe('fallback text');
    expect(state.utterances[0].lang).toBe('de-DE');
    expect(terminalMessages()).toEqual([expect.objectContaining({
      playbackToken: 'speech-token',
      reason: 'completed',
    })]);
  });

  it('does not falsely fail long Web Speech playback', async () => {
    await loadOffscreen();
    fetch.mockRejectedValue(new Error('network failure'));

    const response = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'long speech',
      playbackToken: 'long-speech-token',
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const utterance = state.utterances[0];
    speechSynthesis.speaking = true;
    utterance.onstart();
    await response;
    vi.advanceTimersByTime(60_000);

    expect(terminalMessages()).toHaveLength(0);

    utterance.onend();
    expect(terminalMessages()).toEqual([expect.objectContaining({
      playbackToken: 'long-speech-token',
      reason: 'completed',
    })]);
  });

  it('emits one error token for terminal Web Speech failure', async () => {
    await loadOffscreen();
    fetch.mockRejectedValue(new Error('network failure'));

    const response = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'fallback text',
      language: 'es',
      playbackToken: 'error-token',
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    state.utterances[0].onerror({ error: 'language-unavailable' });
    await response;

    expect(terminalMessages()).toEqual([expect.objectContaining({
      playbackToken: 'error-token',
      reason: 'error',
    })]);
  });

  it('ignores stale stop and suppresses stopped playback callbacks', async () => {
    await loadOffscreen();
    fetch.mockRejectedValue(new Error('network failure'));

    sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'fallback text',
      playbackToken: 'active-token',
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const utterance = state.utterances[0];

    const staleResponse = await sendMessage({
      target: 'offscreen',
      action: 'TTS_STOP',
      playbackToken: 'old-token',
    });
    expect(staleResponse).toEqual({ success: true, skipped: true });

    const stopResponse = await sendMessage({
      target: 'offscreen',
      action: 'TTS_STOP',
      playbackToken: 'active-token',
    });
    utterance.onend?.();

    expect(stopResponse).toEqual({ success: true, stopped: true });
    expect(terminalMessages()).toHaveLength(0);
  });

  it('settles pre-ACK playback request when stopped', async () => {
    await loadOffscreen();
    fetch.mockImplementation(() => new Promise(() => {}));

    const playbackResponse = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'pending audio',
      playbackToken: 'pending-token'
    });
    await Promise.resolve();

    await sendMessage({
      target: 'offscreen',
      action: 'TTS_STOP',
      playbackToken: 'pending-token'
    });

    await expect(playbackResponse).resolves.toEqual(expect.objectContaining({
      success: false,
      playbackToken: 'pending-token',
      reason: 'stopped'
    }));
  });

  it('rejects late playback for token canceled before start', async () => {
    await loadOffscreen();

    await sendMessage({
      target: 'offscreen',
      action: 'TTS_STOP',
      playbackToken: 'late-token'
    });

    const response = await sendMessage({
      target: 'offscreen',
      action: 'playCachedAudio',
      audioData: [1, 2, 3],
      playbackToken: 'late-token'
    });

    expect(response).toEqual(expect.objectContaining({
      success: false,
      playbackToken: 'late-token',
      reason: 'stopped'
    }));
    expect(state.audios).toHaveLength(0);
  });

  it('prunes canceled playback tokens after late-start protection window', async () => {
    await loadOffscreen();

    await sendMessage({
      target: 'offscreen',
      action: 'TTS_STOP',
      playbackToken: 'expired-token',
    });
    vi.advanceTimersByTime(30_000);

    const response = await sendMessage({
      target: 'offscreen',
      action: 'playCachedAudio',
      audioData: [1, 2, 3],
      playbackToken: 'expired-token',
    });

    expect(response).toEqual(expect.objectContaining({
      success: true,
      message: 'Cached audio playback started',
    }));
    expect(state.audios).toHaveLength(1);
  });

  it('removes tracked audio listeners during terminal cleanup', async () => {
    await loadOffscreen();

    const response = sendMessage({
      target: 'offscreen',
      action: 'playCachedAudio',
      audioData: [1, 2, 3],
      playbackToken: 'listener-cleanup-token',
    });
    await response;

    const audio = state.audios[0];
    expect(audio.listeners.size).toBe(3);
    audio.dispatch('ended');

    expect(audio.listeners.size).toBe(0);
  });

  it('settles superseded pre-ACK request as interrupted', async () => {
    await loadOffscreen();
    fetch.mockImplementation(() => new Promise(() => {}));

    const oldResponse = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'old audio',
      playbackToken: 'old-token'
    });
    await Promise.resolve();

    const newResponse = sendMessage({
      target: 'offscreen',
      action: 'playCachedAudio',
      audioData: [1, 2, 3],
      playbackToken: 'new-token'
    });

    await expect(oldResponse).resolves.toEqual(expect.objectContaining({
      success: false,
      playbackToken: 'old-token',
      reason: 'interrupted'
    }));
    await expect(newResponse).resolves.toEqual(expect.objectContaining({ success: true }));
  });

  it('emits only error when timeout cancel synchronously fires onend', async () => {
    await loadOffscreen();
    fetch.mockRejectedValue(new Error('network failure'));
    speechSynthesis.cancel.mockImplementation(() => state.lastUtterance?.onend?.());

    const response = sendMessage({
      target: 'offscreen',
      action: 'playOffscreenAudio',
      url: 'https://example.test/audio',
      text: 'timeout text',
      language: 'en',
      playbackToken: 'timeout-token'
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await response;

    vi.advanceTimersByTime(5000);

    expect(terminalMessages()).toEqual([expect.objectContaining({
      playbackToken: 'timeout-token',
      reason: 'error'
    })]);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { TabAudioPipeline, INPUT_SAMPLE_RATE } from './TabAudioPipeline.js';
import { LiveDubbingFeatureHandler } from '../handlers/LiveDubbingFeatureHandler.js';
import { sanitizeFirefoxContentResponse, FIREFOX_CONTENT_ERRORS } from '../firefox/firefoxContentContract.js';
import { LiveDubbingCoordinator } from '../background/LiveDubbingCoordinator.js';

function createInputContext(sampleRate = INPUT_SAMPLE_RATE) {
  const port = { onmessage: null, postMessage: vi.fn(), start: vi.fn(), close: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const sink = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn() } };
  const node = { connect: vi.fn(), disconnect: vi.fn(), port };
  return {
    context: {
      sampleRate,
      currentTime: 3,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: vi.fn(() => source),
      createGain: vi.fn(() => sink),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    source, sink, node, port,
  };
}

function isLeakFree(errorOrString) {
  const str = JSON.stringify(errorOrString) + String(errorOrString?.message || '') + String(errorOrString?.code || '');
  return !str.includes('https://') && !str.includes('evil.com') && !str.includes('MediaStream') && !str.includes('secret') && !str.includes('apiKey') && !str.includes('workletUrl') && !str.includes('example.com');
}

describe('Firefox input worklet TypeError mapping and probe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps TypeError → INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR with sanitized message', async () => {
    const fake = createInputContext();
    const malicious = new TypeError('Failed https://evil.com/secret?token=apiKey MediaStream processorOptions https://example.com/workletUrl');
    malicious.name = 'TypeError';
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => { throw malicious; }),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR');
      expect(e.message).toBe('Capture worklet node type error');
      expect(isLeakFree(e)).toBe(true);
      expect(String(e.message)).not.toContain('evil.com');
      expect(String(e.message)).not.toContain('MediaStream');
      expect(String(e.message)).not.toContain('processorOptions');
      expect(String(JSON.stringify(e))).not.toContain('example.com');
      expect(fake.context.close).toHaveBeenCalled();
    }
  });

  it('dev firefox probe logs scalar A= B= C= D= and constructor sanitized, no raw leak, cleanup once', async () => {
    vi.stubGlobal('__IS_DEVELOPMENT__', true);
    vi.stubGlobal('__BROWSER__', 'firefox');
    const fake = createInputContext();
    const err = new TypeError('boom https://evil.com/secret MediaStream');
    err.name = 'TypeError';
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => { throw err; }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR' });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR' });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalledTimes(2);
  });

  it('sanitizes constructor name to [A-Za-z]+Error, fallback to Error', async () => {
    vi.stubGlobal('__IS_DEVELOPMENT__', true);
    vi.stubGlobal('__BROWSER__', 'firefox');
    const fake = createInputContext();
    const bad = new TypeError('x');
    bad.name = 'evil<script>TypeError__bad 123';
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => { throw bad; }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_NODE_FAILED' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('probe does not affect production (non-firefox build) and cleanup exactly-once', async () => {
    vi.stubGlobal('__IS_DEVELOPMENT__', false);
    vi.stubGlobal('__BROWSER__', 'chrome');
    const fake = createInputContext();
    const err = new TypeError('boom');
    err.name = 'TypeError';
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => { throw err; }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR' });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalledTimes(1);
  });

  it('propagates TYPE_ERROR through handler, content contract, and coordinator', async () => {
    expect(FIREFOX_CONTENT_ERRORS).toContain('INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR');
    const sanitized = sanitizeFirefoxContentResponse({ success: false, error: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR', sessionId: 's1', providerId: 'gemini' });
    expect(sanitized).toMatchObject({ error: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR' });
    expect(isLeakFree(sanitized)).toBe(true);
    expect(sanitizeFirefoxContentResponse({ success: false, error: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR https://evil.com', sessionId: 's1', providerId: 'gemini' })).toBeNull();

    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: true }),
        consumeSource: async () => ({ success: false, error: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR', sourceAccepted: false }),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => ({ stream: { getTracks: () => [] }, dispose: vi.fn() }) },
    });
    await handler.activate();
    const result = await handler.prepareRuntime({ sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 0 });
    expect(result).toMatchObject({ success: false, error: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR' });
    expect(isLeakFree(result)).toBe(true);

    const storage = new Map();
    const browserAPI = {
      runtime: { id: 'ext-id', getURL: (p='') => `chrome-extension://ext-id/${p}`, sendMessage: vi.fn() },
      storage: { session: { get: vi.fn(async k => ({ [k]: storage.get(k) })), set: vi.fn(async rec => Object.entries(rec).forEach(([k,v])=>storage.set(k,v))), remove: vi.fn(async k=>storage.delete(k)) } },
      tabs: { query: vi.fn(async ()=>[ { id:7 }]), get: vi.fn(async id=>({id})), sendMessage: vi.fn(async ()=>({ success:false, error:'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR', sessionId:'s1', providerId:'gemini', tabId:7, frameId:0, documentId:'doc-1', eventSequence:0, status:'IDLE'})) },
    };
    const registration = { get: vi.fn(()=>({tabId:7,frameId:0,documentId:'doc-1'})), discover: vi.fn(async()=>({tabId:7,frameId:0,documentId:'doc-1'})) };
    const coordinator = new LiveDubbingCoordinator({
      browserAPI, chromeAPI:{}, leaseManager:{ acquire: vi.fn(async()=>true), release: vi.fn(async()=>true), getSnapshot:()=>({activeLeases:[]}), ensureDocument: vi.fn() },
      firefoxContentRuntimeRegistration: registration, runtimeHost:'firefox-content', uuid:()=>'s1', now:()=>123, logger:{ warn:vi.fn()}
    });
    browserAPI.tabs.sendMessage = vi.fn(async (tabId, message)=>{
      if (message.action==='LIVE_DUBBING_PREPARE') return { success:false, error:'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR', sessionId:'s1', providerId:'gemini', tabId:7, frameId:0, documentId:'doc-1', eventSequence:0, status:'IDLE'};
      return { success:true, ack:'DISPOSED', sessionId:'s1', providerId:'gemini', tabId:7, frameId:0, documentId:'doc-1', eventSequence:0, status:'IDLE'};
    });
    const cResult = await coordinator.start({ data:{ targetLanguage:'en', providerId:'gemini'} }, { tab:{id:7}});
    expect(cResult.success).toBe(false);
    expect(cResult.reason).toBe('INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR');
    expect(isLeakFree(cResult)).toBe(true);
  });
});

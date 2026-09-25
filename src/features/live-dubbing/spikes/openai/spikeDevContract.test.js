import { describe, expect, it } from 'vitest';
import {
  OPENAI_SPIKE_DEV_ACTIONS,
  OPENAI_SPIKE_DEV_TARGET,
  createSpikeDevStart,
  createSpikeDevStatus,
  createSpikeDevStop,
  isSpikeDevMessage,
  parseSpikeDevAck,
  parseSpikeDevStart,
  parseSpikeDevStatus,
  parseSpikeDevStatusAck,
  parseSpikeDevStop,
  sanitizeSpikeTelemetry,
} from './spikeDevContract.js';
import { LIVE_DUBBING_ACTIONS } from '../../constants.js';

const BOOTSTRAP = { secret: 'ek_test_secret', targetLanguage: 'es', model: 'gpt-realtime-translate' };

function startMessage(overrides = {}) {
  return {
    target: OPENAI_SPIKE_DEV_TARGET,
    action: OPENAI_SPIKE_DEV_ACTIONS.START,
    data: { transactionId: 'tx-1', targetLanguage: 'es', streamId: 'stream-1', bootstrap: { ...BOOTSTRAP } },
    ...overrides,
  };
}

describe('spikeDevContract (SPIKE)', () => {
  it('uses dev-only actions disjoint from production live-dubbing actions', () => {
    const productionActions = new Set(Object.values(LIVE_DUBBING_ACTIONS));
    expect(Object.values(OPENAI_SPIKE_DEV_ACTIONS)).toEqual([
      'OPENAI_SPIKE_DEV_START',
      'OPENAI_SPIKE_DEV_STOP',
      'OPENAI_SPIKE_DEV_STATUS',
    ]);
    for (const action of Object.values(OPENAI_SPIKE_DEV_ACTIONS)) {
      expect(productionActions.has(action)).toBe(false);
    }
  });

  it('builds well-formed dispatches carrying the transaction identity', () => {
    expect(createSpikeDevStart({
      transactionId: 'tx-1',
      targetLanguage: 'es',
      streamId: 'stream-1',
      bootstrap: BOOTSTRAP,
    })).toEqual({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.START,
      data: { transactionId: 'tx-1', targetLanguage: 'es', streamId: 'stream-1', bootstrap: BOOTSTRAP },
    });
    expect(createSpikeDevStop('tx-1')).toEqual({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-1' },
    });
    expect(createSpikeDevStatus('tx-1')).toEqual({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STATUS,
      data: { transactionId: 'tx-1' },
    });
  });

  it('routes only spike dev messages, never production traffic', () => {
    expect(isSpikeDevMessage(createSpikeDevStart({
      transactionId: 'tx-1',
      targetLanguage: 'es',
      streamId: 's',
      bootstrap: BOOTSTRAP,
    }))).toBe(true);
    expect(isSpikeDevMessage(createSpikeDevStop('tx-1'))).toBe(true);
    expect(isSpikeDevMessage(createSpikeDevStatus('tx-1'))).toBe(true);
    // Same action shape but the production target must not route here.
    expect(isSpikeDevMessage({ target: 'offscreen', action: OPENAI_SPIKE_DEV_ACTIONS.START })).toBe(false);
    expect(isSpikeDevMessage({ target: OPENAI_SPIKE_DEV_TARGET, action: 'LIVE_DUBBING_START' })).toBe(false);
    expect(isSpikeDevMessage(null)).toBe(false);
    expect(isSpikeDevMessage({})).toBe(false);
  });

  it('parses a valid START dispatch', () => {
    expect(parseSpikeDevStart(startMessage())).toEqual({
      transactionId: 'tx-1',
      targetLanguage: 'es',
      streamId: 'stream-1',
      bootstrap: BOOTSTRAP,
    });
  });

  it('rejects malformed START dispatches', () => {
    expect(parseSpikeDevStart(null)).toBeNull();
    expect(parseSpikeDevStart(startMessage({ target: 'offscreen' }))).toBeNull();
    expect(parseSpikeDevStart(startMessage({ action: OPENAI_SPIKE_DEV_ACTIONS.STOP }))).toBeNull();
    expect(parseSpikeDevStart(startMessage({ data: null }))).toBeNull();
    expect(parseSpikeDevStart(startMessage({
      data: { transactionId: '', targetLanguage: 'es', streamId: 's', bootstrap: { ...BOOTSTRAP } },
    }))).toBeNull();
    expect(parseSpikeDevStart(startMessage({
      data: { transactionId: 'tx-1', targetLanguage: 'es', streamId: '', bootstrap: { ...BOOTSTRAP } },
    }))).toBeNull();
    expect(parseSpikeDevStart(startMessage({
      data: { transactionId: 'tx-1', targetLanguage: 'es', streamId: 's', bootstrap: { targetLanguage: 'es' } },
    }))).toBeNull();
  });

  it('parses STOP and STATUS dispatches', () => {
    expect(parseSpikeDevStop(createSpikeDevStop('tx-1'))).toEqual({ transactionId: 'tx-1' });
    expect(parseSpikeDevStop(createSpikeDevStart({
      transactionId: 'tx-1',
      targetLanguage: 'es',
      streamId: 's',
      bootstrap: BOOTSTRAP,
    }))).toBeNull();
    expect(parseSpikeDevStop(createSpikeDevStop(''))).toBeNull();
    expect(parseSpikeDevStatus(createSpikeDevStatus('tx-1'))).toEqual({ transactionId: 'tx-1' });
    expect(parseSpikeDevStatus(createSpikeDevStop('tx-1'))).toBeNull();
  });

  it('accepts only current-transaction acks', () => {
    expect(parseSpikeDevAck({ success: true, transactionId: 'tx-1', targetLanguage: 'es' }, 'tx-1'))
      .toEqual({ transactionId: 'tx-1', success: true, error: undefined, targetLanguage: 'es' });
    expect(parseSpikeDevAck({ success: false, transactionId: 'tx-1', error: 'CONSUME_FAILED' }, 'tx-1'))
      .toMatchObject({ success: false, error: 'CONSUME_FAILED' });
    // Stale, foreign, and malformed acks can never affect a run.
    expect(parseSpikeDevAck({ success: true, transactionId: 'tx-0' }, 'tx-1')).toBeNull();
    expect(parseSpikeDevAck({ success: true }, 'tx-1')).toBeNull();
    expect(parseSpikeDevAck({ transactionId: 'tx-1' }, 'tx-1')).toBeNull();
    expect(parseSpikeDevAck(null, 'tx-1')).toBeNull();
    expect(parseSpikeDevAck({ success: true, transactionId: 'tx-1' }, '')).toBeNull();
  });

  it('parses STATUS acks with scalar-only telemetry', () => {
    const ack = {
      success: true,
      transactionId: 'tx-1',
      active: true,
      targetLanguage: 'es',
      captureReady: true,
      telemetry: { transcriptEvents: 2 },
    };
    expect(parseSpikeDevStatusAck(ack, 'tx-1')).toEqual({
      success: true,
      transactionId: 'tx-1',
      active: true,
      targetLanguage: 'es',
      captureReady: true,
      telemetry: {
        offerCreated: false,
        answerApplied: false,
        transcriptEvents: 2,
        remoteTracks: 0,
        milestones: {
          start: null,
          offerCreated: null,
          answerApplied: null,
          firstRemoteAudio: null,
          firstTranscriptEvent: null,
          cleanup: null,
        },
      },
    });
    expect(parseSpikeDevStatusAck({ ...ack, telemetry: 'nope' }, 'tx-1'))
      .toMatchObject({ telemetry: null });
    expect(parseSpikeDevStatusAck({ ...ack, transactionId: 'tx-0' }, 'tx-1')).toBeNull();
    expect(parseSpikeDevStatusAck({ ...ack, active: 'yes' }, 'tx-1')).toBeNull();
    expect(parseSpikeDevStatusAck({ ...ack, success: false }, 'tx-1')).toBeNull();
  });

  it('sanitizes telemetry to known safe scalars, dropping everything else', () => {
    expect(sanitizeSpikeTelemetry(null)).toBeNull();
    expect(sanitizeSpikeTelemetry('telemetry')).toBeNull();
    expect(sanitizeSpikeTelemetry([])).toBeNull();

    // Malicious/nested/sensitive-looking fields are all discarded; only the
    // allowlisted scalar shape survives with safe defaults.
    expect(sanitizeSpikeTelemetry({
      offerCreated: true,
      answerApplied: 1,
      transcriptEvents: 7,
      remoteTracks: Number.MAX_SAFE_INTEGER + 1,
      milestones: {
        start: 1000.5,
        offerCreated: Number.NaN,
        answerApplied: Number.POSITIVE_INFINITY,
        firstRemoteAudio: 'soon',
        firstTranscriptEvent: 2000,
        cleanup: null,
        injected: 'drop me',
      },
      transcript: 'hola mundo secreto',
      sdp: 'v=0\r\no=malicious',
      secret: 'ek_live_secret',
      streamId: 'stream-secret-1',
      nested: { deep: ['x'] },
      tags: ['a', 'b'],
      unknownField: 42,
    })).toEqual({
      offerCreated: true,
      answerApplied: false,
      transcriptEvents: 7,
      remoteTracks: 0,
      milestones: {
        start: 1000.5,
        offerCreated: null,
        answerApplied: null,
        firstRemoteAudio: null,
        firstTranscriptEvent: 2000,
        cleanup: null,
      },
    });

    // A well-formed transport snapshot passes through unchanged in shape.
    expect(sanitizeSpikeTelemetry({
      offerCreated: true,
      answerApplied: true,
      transcriptEvents: 2,
      remoteTracks: 1,
      milestones: {
        start: 10,
        offerCreated: 20,
        answerApplied: 30,
        firstRemoteAudio: 40,
        firstTranscriptEvent: 50,
        cleanup: null,
      },
    })).toEqual({
      offerCreated: true,
      answerApplied: true,
      transcriptEvents: 2,
      remoteTracks: 1,
      milestones: {
        start: 10,
        offerCreated: 20,
        answerApplied: 30,
        firstRemoteAudio: 40,
        firstTranscriptEvent: 50,
        cleanup: null,
      },
    });
  });

  it('keeps spike code out of production routers (DEV-gated entry installs only)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const entries = {
      'src/html/offscreen.js': 'installOpenAISpikeDevOffscreenListener',
      'src/core/background/index.js': 'installOpenAISpikeDevBackgroundHook',
    };

    for (const [entry, installer] of Object.entries(entries)) {
      const lines = (await readFile(join(process.cwd(), entry), 'utf8')).split('\n');
      let spikeLines = 0;
      lines.forEach((line, index) => {
        if (!line.includes('spikes/openai')) return;
        spikeLines += 1;
        const guardNearby = lines.slice(Math.max(0, index - 5), index + 1)
          .some((candidate) => candidate.includes('__IS_DEVELOPMENT__'));
        expect(guardNearby).toBe(true);
      });
      expect(spikeLines).toBeGreaterThan(0);
      expect(lines.join('\n')).toContain(installer);
    }
    const offscreenEntry = await readFile(join(process.cwd(), 'src/html/offscreen.js'), 'utf8');
    expect(offscreenEntry).not.toContain('__translateItOpenAIRealtimeSpike');
  });
});

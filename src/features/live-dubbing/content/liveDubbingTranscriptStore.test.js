import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptLiveDubbingTranscript,
  clearLiveDubbingTranscript,
  getLiveDubbingTranscriptSnapshot,
  resetLiveDubbingTranscriptState,
  subscribeLiveDubbingTranscript,
} from './liveDubbingTranscriptStore.js';

const envelope = (
  sessionId,
  eventSequence,
  text,
  transcriptSequence = eventSequence,
  providerId = 'gemini',
  kind = 'translated',
) => ({
  sessionId,
  providerId,
  eventSequence,
  transcriptSequence,
  transcript: { kind, text },
});

const sourceEnvelope = (sessionId, eventSequence, text, transcriptSequence = eventSequence, providerId = 'gemini') =>
  envelope(sessionId, eventSequence, text, transcriptSequence, providerId, 'source');

describe('live dubbing content transcript state', () => {
  beforeEach(() => resetLiveDubbingTranscriptState());

  it('accepts ordered fragments and ignores stale or empty input', () => {
    expect(acceptLiveDubbingTranscript(envelope('a', 1, 'one'))).not.toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('a', 1, 'duplicate'))).toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('a', 0, 'old'))).toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('a', 2, ''))).toBeNull();
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments).toEqual(['one']);
  });

  it('rejects unknown transcript kinds', () => {
    expect(acceptLiveDubbingTranscript(envelope('a', 1, 'no', 1, 'gemini', 'partial'))).toBeNull();
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments).toEqual([]);
    expect(getLiveDubbingTranscriptSnapshot().sourceFragments).toEqual([]);
  });

  it('retains translated and source fragments independently', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'Hello'));
    acceptLiveDubbingTranscript(sourceEnvelope('a', 2, 'Bonjour'));
    acceptLiveDubbingTranscript(envelope('a', 3, ' world', 3));
    acceptLiveDubbingTranscript(sourceEnvelope('a', 4, ' le monde', 4));

    const snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.translatedFragments).toEqual(['Hello', ' world']);
    expect(snapshot.sourceFragments).toEqual(['Bonjour', ' le monde']);
  });

  it('preserves whitespace, punctuation, and split-word deltas exactly', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'Hel'));
    acceptLiveDubbingTranscript(envelope('a', 1, 'lo, ' , 2));
    acceptLiveDubbingTranscript(envelope('a', 1, 'world!', 3));
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments.join('')).toBe('Hello, world!');
    acceptLiveDubbingTranscript(envelope('a', 1, '   ', 4));
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments.join('')).toBe('Hello, world!   ');
  });

  it('preserves source whitespace exactly', () => {
    acceptLiveDubbingTranscript(sourceEnvelope('a', 1, '  Bonjour'));
    acceptLiveDubbingTranscript(sourceEnvelope('a', 2, ' le monde  ', 2));
    expect(getLiveDubbingTranscriptSnapshot().sourceFragments.join('')).toBe('  Bonjour le monde  ');
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments).toEqual([]);
  });

  it('orders by transcript sequence, not event sequence', () => {
    acceptLiveDubbingTranscript(envelope('a', 9, 'A', 1));
    expect(acceptLiveDubbingTranscript(envelope('a', 9, 'B', 2))).not.toBeNull();
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments.join('')).toBe('AB');
  });

  it('shares one monotonic transcript sequence across both kinds', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'T1', 1));
    acceptLiveDubbingTranscript(sourceEnvelope('a', 1, 'S1', 2));
    // A stale sequence is stale for every kind, not just its own buffer.
    expect(acceptLiveDubbingTranscript(envelope('a', 1, 'T-stale', 2))).toBeNull();
    expect(acceptLiveDubbingTranscript(sourceEnvelope('a', 1, 'S-stale', 1))).toBeNull();
    acceptLiveDubbingTranscript(envelope('a', 1, 'T2', 3));

    const snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.translatedFragments).toEqual(['T1', 'T2']);
    expect(snapshot.sourceFragments).toEqual(['S1']);
    expect(snapshot.latestTranscriptSequence).toBe(3);
  });

  it('keeps pre-mount snapshot data and publishes ordered post-mount updates', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'before'));
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments).toEqual(['before']);

    const updates = [];
    const unsubscribe = subscribeLiveDubbingTranscript(snapshot => updates.push(snapshot.translatedFragments.join('')));
    acceptLiveDubbingTranscript(envelope('a', 2, 'after'));
    unsubscribe();

    expect(updates).toEqual(['beforeafter']);
  });

  it('keeps a bounded rolling buffer', () => {
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      acceptLiveDubbingTranscript(envelope('a', sequence, `fragment-${sequence}`));
    }
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments).toHaveLength(12);

    for (let sequence = 13; sequence <= 16; sequence += 1) {
      acceptLiveDubbingTranscript(envelope('a', sequence, 'x'.repeat(4096)));
    }
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments.join('').length).toBeLessThanOrEqual(12000);
    expect(getLiveDubbingTranscriptSnapshot().translatedFragments.at(-1)).toHaveLength(4096);
  });

  it('bounds each kind independently so one cannot evict the other', () => {
    acceptLiveDubbingTranscript(sourceEnvelope('a', 1, 'source-keep'));
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      acceptLiveDubbingTranscript(envelope('a', sequence, 'x'.repeat(4096)));
    }

    let snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.sourceFragments).toEqual(['source-keep']);
    expect(snapshot.translatedFragments.join('').length).toBeLessThanOrEqual(12000);
    expect(snapshot.translatedFragments.at(-1)).toHaveLength(4096);
  });

  it('bounds source pressure without evicting translated fragments', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'translated-keep'));
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      acceptLiveDubbingTranscript(sourceEnvelope('a', sequence, 'y'.repeat(4096)));
    }

    const snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.translatedFragments).toEqual(['translated-keep']);
    expect(snapshot.sourceFragments.join('').length).toBeLessThanOrEqual(12000);
    expect(snapshot.sourceFragments.at(-1)).toHaveLength(4096);
  });

  it('replaces sessions and rejects delayed fragments of either kind from retired sessions', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'old'));
    acceptLiveDubbingTranscript(sourceEnvelope('a', 2, 'old-source'));
    acceptLiveDubbingTranscript(envelope('b', 0, 'new', 1));

    const snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.translatedFragments).toEqual(['new']);
    expect(snapshot.sourceFragments).toEqual([]);
    expect(acceptLiveDubbingTranscript(envelope('a', 3, 'late'))).toBeNull();
    expect(acceptLiveDubbingTranscript(sourceEnvelope('a', 4, 'late-source'))).toBeNull();
  });

  it('clears both kinds in one kind-agnostic call and retires the session', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'active'));
    acceptLiveDubbingTranscript(sourceEnvelope('a', 2, 'active-source'));

    clearLiveDubbingTranscript('other');
    let snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.translatedFragments).toEqual(['active']);
    expect(snapshot.sourceFragments).toEqual(['active-source']);

    clearLiveDubbingTranscript('a');
    snapshot = getLiveDubbingTranscriptSnapshot();
    expect(snapshot.translatedFragments).toEqual([]);
    expect(snapshot.sourceFragments).toEqual([]);
    expect(acceptLiveDubbingTranscript(envelope('a', 2, 'late'))).toBeNull();
    expect(acceptLiveDubbingTranscript(sourceEnvelope('a', 3, 'late-source'))).toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('other', 1, 'late'))).toBeNull();
  });
});

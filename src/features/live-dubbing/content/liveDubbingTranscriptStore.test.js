import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptLiveDubbingTranscript,
  clearLiveDubbingTranscript,
  getLiveDubbingTranscriptSnapshot,
  resetLiveDubbingTranscriptState,
  subscribeLiveDubbingTranscript,
} from './liveDubbingTranscriptStore.js';

const envelope = (sessionId, eventSequence, text, transcriptSequence = eventSequence, providerId = 'gemini') => ({
  sessionId,
  providerId,
  eventSequence,
  transcriptSequence,
  transcript: { kind: 'translated', text },
});

describe('live dubbing content transcript state', () => {
  beforeEach(() => resetLiveDubbingTranscriptState());

  it('accepts ordered fragments and ignores stale or empty input', () => {
    expect(acceptLiveDubbingTranscript(envelope('a', 1, 'one'))).not.toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('a', 1, 'duplicate'))).toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('a', 0, 'old'))).toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('a', 2, ''))).toBeNull();
    expect(getLiveDubbingTranscriptSnapshot().fragments).toEqual(['one']);
  });

  it('preserves whitespace, punctuation, and split-word deltas exactly', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'Hel'));
    acceptLiveDubbingTranscript(envelope('a', 1, 'lo, ' , 2));
    acceptLiveDubbingTranscript(envelope('a', 1, 'world!', 3));
    expect(getLiveDubbingTranscriptSnapshot().fragments.join('')).toBe('Hello, world!');
    acceptLiveDubbingTranscript(envelope('a', 1, '   ', 4));
    expect(getLiveDubbingTranscriptSnapshot().fragments.join('')).toBe('Hello, world!   ');
  });

  it('orders by transcript sequence, not event sequence', () => {
    acceptLiveDubbingTranscript(envelope('a', 9, 'A', 1));
    expect(acceptLiveDubbingTranscript(envelope('a', 9, 'B', 2))).not.toBeNull();
    expect(getLiveDubbingTranscriptSnapshot().fragments.join('')).toBe('AB');
  });

  it('keeps pre-mount snapshot data and publishes ordered post-mount updates', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'before'));
    expect(getLiveDubbingTranscriptSnapshot().fragments).toEqual(['before']);

    const updates = [];
    const unsubscribe = subscribeLiveDubbingTranscript(snapshot => updates.push(snapshot.fragments.join('')));
    acceptLiveDubbingTranscript(envelope('a', 2, 'after'));
    unsubscribe();

    expect(updates).toEqual(['beforeafter']);
  });

  it('keeps a bounded rolling buffer', () => {
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      acceptLiveDubbingTranscript(envelope('a', sequence, `fragment-${sequence}`));
    }
    expect(getLiveDubbingTranscriptSnapshot().fragments).toHaveLength(12);

    for (let sequence = 13; sequence <= 16; sequence += 1) {
      acceptLiveDubbingTranscript(envelope('a', sequence, 'x'.repeat(4096)));
    }
    expect(getLiveDubbingTranscriptSnapshot().fragments.join('').length).toBeLessThanOrEqual(12000);
    expect(getLiveDubbingTranscriptSnapshot().fragments.at(-1)).toHaveLength(4096);
  });

  it('replaces sessions and rejects delayed fragments from retired sessions', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'old'));
    acceptLiveDubbingTranscript(envelope('b', 0, 'new', 1));
    expect(getLiveDubbingTranscriptSnapshot().fragments).toEqual(['new']);
    expect(acceptLiveDubbingTranscript(envelope('a', 2, 'late'))).toBeNull();
  });

  it('clears only the active session and retires it', () => {
    acceptLiveDubbingTranscript(envelope('a', 1, 'active'));
    clearLiveDubbingTranscript('other');
    expect(getLiveDubbingTranscriptSnapshot().fragments).toEqual(['active']);
    clearLiveDubbingTranscript('a');
    expect(getLiveDubbingTranscriptSnapshot().fragments).toEqual([]);
    expect(acceptLiveDubbingTranscript(envelope('a', 2, 'late'))).toBeNull();
    expect(acceptLiveDubbingTranscript(envelope('other', 1, 'late'))).toBeNull();
  });
});

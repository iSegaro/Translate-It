import {
  LIVE_DUBBING_ORIGINAL_TRANSCRIPT_KIND,
  LIVE_DUBBING_TRANSLATED_TRANSCRIPT_KIND,
} from '../constants.js';

const MAX_RETIRED_SESSIONS = 16;
const MAX_FRAGMENT_CHARACTERS = 4096;
const MAX_TRANSCRIPT_CHARACTERS = 12000;

// One buffer per transcript kind. The budgets are applied per kind so the
// original (source) row can never evict translated fragments, or vice versa.
const FRAGMENT_LIST_BY_KIND = {
  [LIVE_DUBBING_TRANSLATED_TRANSCRIPT_KIND]: 'translatedFragments',
  [LIVE_DUBBING_ORIGINAL_TRANSCRIPT_KIND]: 'sourceFragments',
};

const current = {
  sessionId: null,
  providerId: null,
  // Single monotonic envelope sequence shared by both kinds: ordering is
  // decided per envelope, never per kind.
  latestTranscriptSequence: null,
  translatedFragments: [],
  sourceFragments: [],
};
const retiredSessions = new Set();
const listeners = new Set();

function retireSession(sessionId) {
  if (!sessionId) return;
  retiredSessions.add(sessionId);
  while (retiredSessions.size > MAX_RETIRED_SESSIONS) {
    retiredSessions.delete(retiredSessions.values().next().value);
  }
}

/**
 * Append a fragment within the character budget of its own kind, evicting
 * the oldest fragments of that kind first. Fragment text is stored verbatim
 * (whitespace included). Returns null when a single fragment exceeds the
 * budget, which sanitize already prevents.
 * @param {string[]} fragments
 * @param {string} text
 * @returns {string[]|null}
 */
function appendFragmentWithinBudget(fragments, text) {
  const next = [...fragments, text];
  let total = next.reduce((sum, fragment) => sum + fragment.length, 0);
  while (next.length > 1 && total > MAX_TRANSCRIPT_CHARACTERS) {
    total -= next[0].length;
    next.shift();
  }
  return total > MAX_TRANSCRIPT_CHARACTERS ? null : next;
}

function snapshot() {
  return {
    sessionId: current.sessionId,
    providerId: current.providerId,
    latestTranscriptSequence: current.latestTranscriptSequence,
    translatedFragments: [...current.translatedFragments],
    sourceFragments: [...current.sourceFragments],
  };
}

function notify() {
  const value = snapshot();
  listeners.forEach(listener => listener(value));
}

/**
 * Validate an untrusted transcript envelope. Accepts both the translated and
 * the original (source) kind; text is preserved exactly as received.
 * @param {unknown} value
 * @returns {object|null}
 */
export function sanitizeLiveDubbingTranscriptEnvelope(value) {
  if (!value || typeof value !== 'object') return null;
  const { sessionId, providerId, eventSequence, transcriptSequence, transcript } = value;
  const text = typeof transcript?.text === 'string' ? transcript.text : '';
  const kind = transcript?.kind;
  if (typeof sessionId !== 'string' || !sessionId.trim()
    || typeof providerId !== 'string' || !providerId.trim()
    || !Number.isSafeInteger(eventSequence) || eventSequence < 0
    || !Number.isSafeInteger(transcriptSequence) || transcriptSequence < 1
    || !FRAGMENT_LIST_BY_KIND[kind] || !text
    || text.length > MAX_FRAGMENT_CHARACTERS) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    providerId: providerId.trim(),
    eventSequence,
    transcriptSequence,
    transcript: { kind, text },
  };
}

/**
 * Accept a transcript envelope into the buffer of its kind. A single session
 * and provider stay active; envelope sequences are ordered monotonically
 * across both kinds, and retired sessions are rejected.
 * @param {unknown} value
 * @returns {object|null} the accepted envelope, or null when rejected
 */
export function acceptLiveDubbingTranscript(value) {
  const envelope = sanitizeLiveDubbingTranscriptEnvelope(value);
  if (!envelope || retiredSessions.has(envelope.sessionId)) return null;
  if (current.sessionId === envelope.sessionId && current.providerId !== envelope.providerId) return null;

  const isNewSession = current.sessionId !== envelope.sessionId;
  if (!isNewSession && envelope.transcriptSequence <= current.latestTranscriptSequence) return null;

  if (isNewSession) {
    retireSession(current.sessionId);
    current.sessionId = envelope.sessionId;
    current.providerId = envelope.providerId;
    current.latestTranscriptSequence = null;
    current.translatedFragments = [];
    current.sourceFragments = [];
  }

  const listKey = FRAGMENT_LIST_BY_KIND[envelope.transcript.kind];
  const fragments = appendFragmentWithinBudget(current[listKey], envelope.transcript.text);
  if (!fragments) return null;

  current.latestTranscriptSequence = envelope.transcriptSequence;
  current[listKey] = fragments;
  notify();
  return envelope;
}

/**
 * Kind-agnostic clear: resets both the translated and the source buffer and
 * retires the session in a single path, so STOP/terminal handling never
 * needs a per-kind variant.
 * @param {string|null} sessionId session to clear/retire; null clears the active one
 */
export function clearLiveDubbingTranscript(sessionId = null) {
  if (sessionId) retireSession(sessionId);
  if (sessionId && sessionId !== current.sessionId) return;
  if (current.sessionId) retireSession(current.sessionId);
  current.sessionId = null;
  current.providerId = null;
  current.latestTranscriptSequence = null;
  current.translatedFragments = [];
  current.sourceFragments = [];
  notify();
}

export function getLiveDubbingTranscriptSnapshot() {
  return snapshot();
}

export function subscribeLiveDubbingTranscript(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetLiveDubbingTranscriptState() {
  clearLiveDubbingTranscript();
  retiredSessions.clear();
}

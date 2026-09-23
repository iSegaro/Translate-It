const MAX_RETIRED_SESSIONS = 16;
const MAX_FRAGMENT_CHARACTERS = 4096;
const MAX_TRANSCRIPT_CHARACTERS = 12000;

const current = {
  sessionId: null,
  providerId: null,
  latestTranscriptSequence: null,
  fragments: [],
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

function snapshot() {
  return {
    sessionId: current.sessionId,
    providerId: current.providerId,
    latestTranscriptSequence: current.latestTranscriptSequence,
    fragments: [...current.fragments],
  };
}

function notify() {
  const value = snapshot();
  listeners.forEach(listener => listener(value));
}

export function sanitizeLiveDubbingTranscriptEnvelope(value) {
  if (!value || typeof value !== 'object') return null;
  const { sessionId, providerId, eventSequence, transcriptSequence, transcript } = value;
  const text = typeof transcript?.text === 'string' ? transcript.text : '';
  if (typeof sessionId !== 'string' || !sessionId.trim()
    || typeof providerId !== 'string' || !providerId.trim()
    || !Number.isSafeInteger(eventSequence) || eventSequence < 0
    || !Number.isSafeInteger(transcriptSequence) || transcriptSequence < 1
    || transcript?.kind !== 'translated' || !text
    || text.length > MAX_FRAGMENT_CHARACTERS) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    providerId: providerId.trim(),
    eventSequence,
    transcriptSequence,
    transcript: { kind: 'translated', text },
  };
}

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
    current.fragments = [];
  }

  const fragments = [...current.fragments, envelope.transcript.text];
  while (fragments.length > 1
    && fragments.reduce((total, fragment) => total + fragment.length, 0) > MAX_TRANSCRIPT_CHARACTERS) {
    fragments.shift();
  }
  if (fragments.reduce((total, fragment) => total + fragment.length, 0) > MAX_TRANSCRIPT_CHARACTERS) return null;

  current.latestTranscriptSequence = envelope.transcriptSequence;
  current.fragments = fragments;
  notify();
  return envelope;
}

export function clearLiveDubbingTranscript(sessionId = null) {
  if (sessionId) retireSession(sessionId);
  if (sessionId && sessionId !== current.sessionId) return;
  if (current.sessionId) retireSession(current.sessionId);
  current.sessionId = null;
  current.providerId = null;
  current.latestTranscriptSequence = null;
  current.fragments = [];
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

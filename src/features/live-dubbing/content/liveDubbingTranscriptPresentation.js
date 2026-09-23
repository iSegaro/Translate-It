export const LIVE_DUBBING_VISIBLE_CHARACTER_LIMIT = 400;

export function getVisibleLiveDubbingTranscript(snapshot, limit = LIVE_DUBBING_VISIBLE_CHARACTER_LIMIT) {
  const text = Array.isArray(snapshot?.fragments) ? snapshot.fragments.join('') : '';
  if (text.length <= limit) return text;
  const suffix = text.slice(-limit);
  const boundary = suffix.search(/\s/);
  return boundary === -1 ? suffix : suffix.slice(boundary + 1);
}

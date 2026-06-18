import { describe, expect, it } from 'vitest';
import {
  isLiveCaptionTimelineAnchorCompatible,
  normalizeLiveCaptionTimelineAnchor,
  projectLiveCaptionSegmentToMediaTime
} from './LiveCaptionTimelineProjection.js';

describe('live-caption timeline projection', () => {
  it('maps a single anchor correctly', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 100,
        sourceEndMs: 200,
        sourceClockId: 'clock-1',
        sourceResetId: 'reset-1',
        sourceTimelineType: 'provider'
      },
      [
        {
          anchorId: 'anchor-1',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceResetId: 'reset-1',
          sourceTimelineType: 'provider',
          sourceMs: 50,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 1,
          wallClockMs: 100
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 1050,
      mediaEndMs: 1150,
      anchorId: 'anchor-1',
      reason: null
    });
  });

  it('applies playbackRate scaling', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 100,
        sourceEndMs: 140,
        sourceClockId: 'clock-1',
        sourceTimelineType: 'capture'
      },
      [
        {
          anchorId: 'anchor-1',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'capture',
          sourceMs: 0,
          mediaMs: 1000,
          playbackRate: 2,
          sequence: 1,
          wallClockMs: 100
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 1200,
      mediaEndMs: 1280,
      anchorId: 'anchor-1',
      reason: null
    });
  });

  it('selects the newest compatible anchor', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 120,
        sourceEndMs: 160,
        sourceClockId: 'clock-1',
        sourceTimelineType: 'provider'
      },
      [
        {
          anchorId: 'anchor-old',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 1,
          wallClockMs: 100
        },
        {
          anchorId: 'anchor-new',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 100,
          mediaMs: 1100,
          playbackRate: 1,
          sequence: 2,
          wallClockMs: 200
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 1120,
      mediaEndMs: 1160,
      anchorId: 'anchor-new',
      reason: null
    });
  });

  it('ignores session and video mismatches', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 50,
        sourceEndMs: 100,
        sourceClockId: 'clock-1',
        sourceTimelineType: 'provider'
      },
      [
        {
          anchorId: 'anchor-1',
          sessionId: 'session-2',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 1,
          wallClockMs: 100
        },
        {
          anchorId: 'anchor-2',
          sessionId: 'session-1',
          videoFingerprint: 'video-b',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 2000,
          playbackRate: 1,
          sequence: 2,
          wallClockMs: 200
        },
        {
          anchorId: 'anchor-3',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 3000,
          playbackRate: 1,
          sequence: 3,
          wallClockMs: 300
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 3050,
      mediaEndMs: 3100,
      anchorId: 'anchor-3',
      reason: null
    });
  });

  it('ignores source clock, reset, and timeline type mismatches', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 120,
        sourceEndMs: 160,
        sourceClockId: 'clock-1',
        sourceResetId: 'reset-1',
        sourceTimelineType: 'provider'
      },
      [
        {
          anchorId: 'anchor-clock-mismatch',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-2',
          sourceResetId: 'reset-1',
          sourceTimelineType: 'provider',
          sourceMs: 100,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 1,
          wallClockMs: 100
        },
        {
          anchorId: 'anchor-reset-mismatch',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceResetId: 'reset-2',
          sourceTimelineType: 'provider',
          sourceMs: 100,
          mediaMs: 1100,
          playbackRate: 1,
          sequence: 2,
          wallClockMs: 200
        },
        {
          anchorId: 'anchor-type-mismatch',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceResetId: 'reset-1',
          sourceTimelineType: 'capture',
          sourceMs: 100,
          mediaMs: 1200,
          playbackRate: 1,
          sequence: 3,
          wallClockMs: 300
        },
        {
          anchorId: 'anchor-match',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceResetId: 'reset-1',
          sourceTimelineType: 'provider',
          sourceMs: 100,
          mediaMs: 1300,
          playbackRate: 1,
          sequence: 4,
          wallClockMs: 400
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 1320,
      mediaEndMs: 1360,
      anchorId: 'anchor-match',
      reason: null
    });
  });

  it('returns unmapped when no anchor is available', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 10,
        sourceEndMs: 20
      },
      []
    );

    expect(result).toEqual({
      status: 'unmapped',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: null,
      reason: 'no_compatible_anchor'
    });
  });

  it('returns invalid for invalid segment timestamps', () => {
    expect(projectLiveCaptionSegmentToMediaTime({ sourceStartMs: 'nope', sourceEndMs: 20 }, [])).toEqual({
      status: 'invalid',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: null,
      reason: 'invalid_source_timestamps'
    });

    expect(projectLiveCaptionSegmentToMediaTime({ sourceStartMs: 30, sourceEndMs: 20 }, [])).toEqual({
      status: 'invalid',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: null,
      reason: 'invalid_source_timestamps'
    });
  });

  it('ignores invalid anchors', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 100,
        sourceEndMs: 120,
        sourceClockId: 'clock-1',
        sourceTimelineType: 'provider'
      },
      [
        null,
        {
          anchorId: 'invalid-negative-rate',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 1000,
          playbackRate: 0,
          sequence: 1,
          wallClockMs: 100
        },
        {
          anchorId: 'invalid-source',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 'nope',
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 2,
          wallClockMs: 200
        },
        {
          anchorId: 'valid-anchor',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 50,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 3,
          wallClockMs: 300
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 1050,
      mediaEndMs: 1070,
      anchorId: 'valid-anchor',
      reason: null
    });
  });

  it('returns boundary_crossing when the segment spans a newer anchor', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 100,
        sourceEndMs: 200,
        sourceClockId: 'clock-1',
        sourceTimelineType: 'provider'
      },
      [
        {
          anchorId: 'anchor-1',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 1,
          wallClockMs: 100
        },
        {
          anchorId: 'anchor-2',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 150,
          mediaMs: 1150,
          playbackRate: 1,
          sequence: 2,
          wallClockMs: 200
        }
      ]
    );

    expect(result).toEqual({
      status: 'boundary_crossing',
      mediaStartMs: null,
      mediaEndMs: null,
      anchorId: 'anchor-1',
      reason: 'segment_crosses_anchor_boundary'
    });
  });

  it('handles exact boundary behavior deterministically', () => {
    const result = projectLiveCaptionSegmentToMediaTime(
      {
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        sourceStartMs: 100,
        sourceEndMs: 200,
        sourceClockId: 'clock-1',
        sourceTimelineType: 'provider'
      },
      [
        {
          anchorId: 'anchor-1',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 0,
          mediaMs: 1000,
          playbackRate: 1,
          sequence: 1,
          wallClockMs: 100
        },
        {
          anchorId: 'anchor-2',
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          sourceClockId: 'clock-1',
          sourceTimelineType: 'provider',
          sourceMs: 200,
          mediaMs: 1200,
          playbackRate: 1,
          sequence: 2,
          wallClockMs: 200
        }
      ]
    );

    expect(result).toEqual({
      status: 'mapped',
      mediaStartMs: 1100,
      mediaEndMs: 1200,
      anchorId: 'anchor-1',
      reason: null
    });
  });

  it('normalizes anchors safely', () => {
    expect(normalizeLiveCaptionTimelineAnchor({
      anchorId: ' anchor-1 ',
      sessionId: ' session-1 ',
      videoFingerprint: ' video-a ',
      sourceClockId: ' clock-1 ',
      sourceResetId: ' reset-1 ',
      sourceTimelineType: ' PROVIDER ',
      sourceMs: '10',
      mediaMs: '20',
      wallClockMs: '30',
      playbackRate: '1.5',
      reason: ' start ',
      sequence: '4'
    })).toEqual({
      anchorId: 'anchor-1',
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      sourceClockId: 'clock-1',
      sourceResetId: 'reset-1',
      sourceTimelineType: 'provider',
      sourceMs: 10,
      mediaMs: 20,
      wallClockMs: 30,
      playbackRate: 1.5,
      reason: 'start',
      sequence: 4
    });
  });

  it('normalizes invalid source timeline types to unknown', () => {
    expect(normalizeLiveCaptionTimelineAnchor({
      anchorId: 'anchor-1',
      sourceMs: 10,
      mediaMs: 20,
      sourceTimelineType: 'bad-type'
    })).toMatchObject({
      sourceTimelineType: 'unknown'
    });
  });

  it('exposes anchor compatibility checks', () => {
    const segment = {
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      sourceStartMs: 100,
      sourceEndMs: 150,
      sourceClockId: 'clock-1',
      sourceResetId: 'reset-1',
      sourceTimelineType: 'provider'
    };

    expect(isLiveCaptionTimelineAnchorCompatible(segment, {
      anchorId: 'anchor-1',
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      sourceClockId: 'clock-1',
      sourceResetId: 'reset-1',
      sourceTimelineType: 'provider',
      sourceMs: 90,
      mediaMs: 1000,
      playbackRate: 1
    })).toBe(true);
  });
});

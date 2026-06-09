# Live Video Caption Translation Feature

## Overview

This document captures the agreed architectural decisions, scope, requirements, constraints, and future direction for the planned **Live Video Caption Translation** feature in Translate-It.

The goal is to provide real-time subtitle generation and translation for videos playing inside browser tabs while maintaining the existing architectural principles of Translate-It:

- Modular feature-based architecture
- Clean separation of concerns
- Reuse of the existing Translation Provider System
- Future extensibility
- Low-risk MVP implementation
- Strong cache and lifecycle management

---

# High-Level Goal

Allow users to:

1. Capture audio from a playing video inside the current browser tab.
2. Convert audio into text using Speech-to-Text (STT).
3. Translate the transcript using the existing Translation Provider System.
4. Display translated captions as an overlay on the video.
5. Cache transcripts and translations to avoid repeated STT and translation work.

---

# MVP Scope

## Supported Platforms

- Chrome Desktop
- Edge Desktop

## Not Included in MVP

- Firefox
- Android
- Mobile browsers
- Safari
- Auto-start behavior
- Streaming STT
- Partial captions
- Multiple active video sessions
- Provider failover

---

# Activation Model

The feature must be user-triggered.

Possible entry points:

- Overlay button on video
- Desktop FAB integration
- Future Popup integration

Audio capture should not automatically start without explicit user interaction.

---

# Feature Architecture

The feature must be implemented as an independent module.

Recommended location:

```txt
src/features/live-caption/
```

The feature must NOT be merged into:

```txt
translation/
tts/
subtitle-translation/
```

It should remain a dedicated standalone feature.

---

# Core Pipeline

```txt
Tab Audio Capture
        ↓
Speech-To-Text Provider
        ↓
Transcript
        ↓
Translation Provider System
        ↓
Caption Overlay
```

---

# STT Architecture

The STT system must be completely separate from the Translation Provider System.

## Required Components

```txt
live-caption/
└── stt/
    ├── BaseSTTProvider.js
    ├── STTProviderFactory.js
    ├── STTProviderManifest.js
    └── providers/
```

---

# STT Provider Responsibility

STT providers are responsible ONLY for:

```txt
Audio
  ↓
Transcript
```

They must NOT perform translation.

Translation must continue using the existing Translate-It Translation Provider System.

---

# Initial STT Provider

MVP Provider:

```txt
OpenAI Whisper
```

Mode:

```txt
Batch STT
```

No streaming support required in MVP.

---

# Future STT Providers

Planned future support:

```txt
OpenAI Whisper
Deepgram
Google Speech-to-Text
Azure Speech
Local Whisper
whisper.cpp
faster-whisper
```

---

# STT Provider Contract

Future-proof provider interface:

```js
{
  text,
  detectedLanguage,
  confidence,
  startTime,
  endTime,
  isFinal,
  provider
}
```

Provider APIs should be designed to eventually support:

```js
transcribeChunk(audioChunk, {
  previousTranscript,
  language,
  hints
})
```

Even if those parameters are unused during MVP.

---

# Caption Mode

MVP:

```txt
Final captions only
```

Not supported initially:

```txt
Partial captions
Live correction updates
Streaming transcript updates
```

Reason:

- Simpler implementation
- Lower UI complexity
- Reduced flicker
- Better translation stability

---

# Active Video Model

The system must process:

```txt
One active video per tab
```

Only.

---

# Multi-Video Pages

Examples:

- Twitter/X
- Reddit
- Facebook
- News sites
- Learning platforms

The architecture must support:

```txt
PageLiveCaptionSession
    └── VideoCaptionSession
```

Each video must have its own identity and cache.

---

# Active Video Detection

Priority order:

```txt
1. Playing
2. Visible
3. Has audio
4. Largest visible area
```

The detector should identify a single active video.

---

# Session Architecture

```txt
PageLiveCaptionSession
├── Active Video Detection
├── Session Coordination
└── Cache Access

VideoCaptionSession
├── Video Identity
├── Transcript State
├── Translation State
├── Overlay State
└── Cache State
```

---

# Cache Strategy

## Design Principle

Cache must be:

```txt
Per Video
```

NOT:

```txt
Per Page
```

---

# Cache Layers

## Session Cache

In-memory cache.

Purpose:

- Replay support
- Seeking support
- Fast access

Lifetime:

```txt
Current tab/session only
```

---

## Persistent Cache

Storage:

```txt
IndexedDB
```

Purpose:

- Reuse transcript and captions
- Avoid repeated STT costs
- Avoid repeated translation costs

---

# Transcript Cache

Store:

```txt
Original transcript only
```

Example:

```js
{
  startTime,
  endTime,
  originalText
}
```

---

# Translation Cache

Store:

```txt
Translated captions
```

Example:

```js
{
  targetLanguage,
  provider,
  translatedText
}
```

---

# Important Design Rule

Original transcript and translated captions must be stored separately.

Reason:

If the user changes target language:

```txt
No STT rerun required.
```

Only translation is regenerated.

---

# Cache Key Strategy

Cache keys must be:

```txt
Per Video
```

Never:

```txt
location.href only
```

because pages such as Twitter/X can contain multiple videos.

---

# Cache Management

Requirements:

- Configurable maximum cache size
- Automatic cleanup policy
- User can clear all cache
- No need for per-item cache deletion

---

# Incognito Behavior

Persistent cache:

```txt
Disabled
```

Only:

```txt
Session Cache
```

should be used.

---

# Seek Behavior

When user seeks backward:

```txt
If captions exist in cache:
    Show cached captions

Else:
    Resume STT from seek position
```

---

# Overlay UI

MVP:

```txt
Simple overlay on video
```

Future setting:

```txt
Show captions on video
ON/OFF
```

Overlay styling details are intentionally deferred.

---

# Fullscreen Support

The architecture must allow future fullscreen support.

Not required for MVP.

---

# Quality Profiles

Planned settings:

```txt
Fast
Balanced
Accurate
```

Examples:

Fast:
- Lower latency
- Smaller chunks

Accurate:
- Higher latency
- Larger chunks

Balanced:
- Default mode

---

# Privacy Requirements

Before starting capture:

Display a clear notice:

```txt
Audio from this tab will be sent to the selected speech-to-text provider.
```

Users must understand audio is being processed externally.

---

# Error Handling

MVP:

```txt
Retry only
```

No automatic provider fallback.

---

# Failure Scenarios

Examples:

```txt
Invalid API key
Network failure
Rate limit
Audio capture failure
Provider error
```

---

# Future Provider Fallback

Possible future setting:

```txt
Automatic provider fallback
```

Example:

```txt
Whisper
   ↓
Deepgram
   ↓
Google Speech
```

Not included in MVP.

---

# Health Monitoring

Future architecture should support monitoring:

```txt
Success rate
Latency
Failed segments
Retry counts
Provider health
```

---

# Context Preservation

MVP:

```txt
Stateless chunk processing
```

Each chunk is processed independently.

Future providers may use:

```txt
Previous transcript
Language hints
Context hints
```

---

# Export Support

Not required in MVP.

Data structures should allow future export:

```txt
SRT
VTT
TXT Transcript
```

without redesign.

---

# Architectural Principles

## Reuse Existing Translation System

Do NOT create a second translation pipeline.

Use:

```txt
Transcript
    ↓
Existing Translation Provider System
```

---

## Keep STT Independent

STT and Translation must remain separate systems.

---

## Modular Design

Everything should remain isolated inside:

```txt
src/features/live-caption/
```

---

## Conservative MVP

The MVP should prioritize:

```txt
Simplicity
Reliability
Low maintenance cost
Low implementation risk
Future extensibility
```

over feature completeness.

---

# Final Agreed MVP Summary

```txt
✓ Chrome/Edge Desktop
✓ User-triggered activation
✓ Active tab audio capture
✓ OpenAI Whisper Batch STT
✓ Final captions only
✓ One active video per tab
✓ Shadow DOM overlay
✓ Per-video cache
✓ Session Cache + IndexedDB Cache
✓ Separate transcript and translation caches
✓ Retry support
✓ Privacy notice
✓ Quality profiles
✓ Future-ready STT provider architecture

✗ Firefox
✗ Mobile
✗ Streaming STT
✗ Partial captions
✗ Multi-video processing
✗ Automatic provider fallback
✗ Auto-start
```

## TranslationWindow same-frame TTS cleanup ownership bug

### Status

Known pre-existing bug.
Not caused by Phase 0 shared Offscreen ownership work.

### Symptom

When Screen Capture OCR finishes and WindowsManager replaces/displays a `TranslationWindow`, unrelated TTS playback in the same tab/frame can stop unexpectedly.

Observed sequence:

```text
Screen Capture OCR active
→ start unrelated TTS
→ OCR extraction completes
→ WindowsManager replaces TranslationWindow
→ old TranslationWindow unmounts
→ active unrelated TTS stops
```

### Root Cause

`TranslationWindow.vue` registers cleanup using:

```js
tts.stopAll({ stopOnlyIfOwner: true })
```

The stop request has no `ttsId`.

Current content-script TTS ownership is scoped to:

```text
tab.id + frameId
```

Therefore another TTS consumer in the same tab/frame is considered the same owner.

When the old `TranslationWindow` unmounts, its cleanup can stop playback started by another feature such as FAB or another TTS control.

### Exact Runtime Path

```text
SCREEN_CAPTURE_OCR_RESULT
→ ScreenCaptureCoordinator
→ GLOBAL_SELECTION_TRIGGER
→ DisplayManager.show()
→ new WindowsManager window ID
→ translationWindows replacement
→ keyed TranslationWindow unmount
→ TranslationWindow cleanup
→ useTTSSmart.stopAll()
→ ID-less TTS_STOP
→ Google/Edge stop handler
→ same tab/frame owner accepted
→ TTSStateManager.stopPlayback()
```

### Ownership Limitation

Current ownership rules:

* Content scripts: `tab.id + frameId`
* Extension pages: sender URL
* `ttsId` exists and is supported by stop handlers
* Component/window identity is not part of ownership
* ID-less `stopOnlyIfOwner` is therefore too broad for same-frame component cleanup

### Affected Scope

Confirmed:

* `TranslationWindow`

Other same-frame consumers should be considered potentially affected by the same ownership limitation:

* `DesktopFabMenu`
* `MobileSheet`
* `useTranslationModes`
* `TranslationIcon`
* shared `TTSButton`
* field/FAB TTS controls

Popup and Side Panel normally have different extension-page sender URLs and are less affected by this specific same-frame collision.

### Recommended Fix

Use existing `ttsId` ownership instead of introducing a new ownership model.

For `TranslationWindow`:

1. Remove the parent-level unused `useTTSSmart()` cleanup that calls global `stopAll`.
2. On window cleanup, use the toolbar TTS instance/ref that owns the window's playback.
3. Call its existing stop method with:

```js
stopTTS({ stopOnlyIfOwner: true })
```

4. Ensure the stop request includes the toolbar's exact `ttsId`.
5. Make cleanup null-safe if the toolbar is not mounted or never started TTS.

Expected result:

```text
window's own TTS → stops on unmount
unrelated same-frame TTS → continues playing
```

### Do Not

Do not:

* add OCR-specific suppression;
* weaken global `stopOnlyIfOwner`;
* change `TTSStateManager` ownership architecture;
* introduce component/session ownership unless a broader audit later proves it necessary;
* make WindowsManager responsible for TTS ownership.

### Required Tests

Add regression coverage for:

1. Replacing/unmounting `TranslationWindow` does not stop unrelated same-frame FAB TTS.
2. `TranslationWindow` unmount does not send ID-less global `stopAll`.
3. Active toolbar TTS sends its matching `ttsId` stop on unmount.
4. Same sender + mismatched committed `ttsId` returns `skipped` and does not call `stopPlayback()`.
5. Matching committed `ttsId` still stops correctly.
6. Pending matching `ttsId` behavior remains correct.
7. Explicit global stop behavior remains unchanged.

### Preferred Implementation Scope

Keep the fix local to `TranslationWindow` / toolbar TTS lifecycle unless tests prove a shared contract change is required.

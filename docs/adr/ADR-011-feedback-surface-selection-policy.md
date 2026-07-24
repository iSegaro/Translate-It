# ADR: Feedback Surface Selection Policy

**Status:** Accepted

---

## Context

PDF workflows originally selected feedback surfaces directly. This coupled workflow code to toast, banner, and progress components and made surface changes cross-cutting.

The PDF Viewer now has a presentation subsystem. `PdfApp` remains its composition root: it owns feature callbacks and active cancellation commands, while presentation layers own communication and surface state.

---

## Decision

PDF workflows emit canonical `DomainEvents` through the Presentation Host. A Domain Event contains domain data and a `name`; it contains no surface, rendered wording, or adapter payload.

```text
PDF workflow callback
    ↓
PdfApp → DomainEvents
    ↓
Presentation Host / Facade
    ↓
Presenter
    ↓ Presentation Intent
Dispatcher
    ↓
Policy
    ↓
Toast / Banner / Progress adapter
    ↓
vue-sonner / PdfStatusBanner / PdfProgressBar
```

### Runtime Layers

| Layer | Responsibility | Does Not Own |
|---|---|---|
| `PdfApp` | Feature composition, Domain Event emission, active cancellation command | Surface wording, adapter payloads, surface routing |
| `DomainEvents` | Canonical domain payload creators | Wording, severity, surface selection |
| Presentation Host | Facade wiring and reactive banner/progress snapshots | Feature lifecycle or domain state |
| Presentation Facade | Presenter-to-Dispatcher pipeline | Vue state or concrete surfaces |
| Presenter | Domain Event to Presentation Intent; wording and severity | Adapters, components, routing |
| Dispatcher | Routes global Presentation Intents to an adapter | Wording, domain logic, component rendering |
| Policy | Maps intent to surface | Scope or input data |
| Adapter | Toast delivery or banner/progress surface state | Domain workflow |

### Intent-to-Surface Mapping

| Presentation Intent | Surface | Runtime behavior |
|---|---|---|
| `acknowledgement` | Toast | Toast adapter calls `vue-sonner` |
| `outcome` | Banner | Banner adapter retains translation or developer outcome snapshot |
| `activity` | Progress bar | Progress adapter retains current operation snapshot |

The current dispatcher only routes global intents. Inline component and element states remain owned by their rendering components; they are not emitted through the global presentation pipeline.

---

## Event Examples

### Export

```text
exportTxt / exportMarkdown / exportHtml
    ↓
DomainEvents.exportCompleted or exportFailed
    ↓
acknowledgement → toast
```

### Page OCR

```text
usePdfOcr callback
    ↓
ocrStarted → activity → progress bar
ocrProgressUpdated → activity → progress bar
activityCompleted → clear progress bar
ocrLanguageMissing / ocrFailed → acknowledgement → toast
```

### Translation

```text
translationStarted → activity → progress bar
translationPartial / translationFailed → outcome → banner
translationOutcomeCleared → clears retained translation banner outcome
activityCompleted → clear progress bar
```

### Region OCR

```text
regionOcrStarted → activity → progress bar
recognized text → PdfWindowsHost.openTranslation()
no text / failure → acknowledgement → toast
activityCompleted → clear progress bar
```

### Region Comparison

```text
comparisonStarted → activity → progress bar
comparisonCompleted / comparisonFailed → outcome → banner
completed artifact export → acknowledgement → toast
```

---

## Ownership and Cancellation

The progress adapter only represents activity. `PdfApp` owns `activeProgressCancel`, which identifies the current page translation, page OCR, region OCR, or region comparison cancellation command. `PdfProgressBar` requests cancellation through `PdfApp`; cancellation remains owned by the feature operation that delegated work.

Banner state is separate from domain state. The banner adapter retains translation outcomes and developer comparison notifications. `PdfApp` combines those snapshots with PDF error and loading state through `createPdfStatusBannerController`.

Banner priority is deterministic:

```text
PDF error → loading → translation outcome → debug developer outcome → none
```

---

## Architectural Invariants

1. PDF workflows emit `DomainEvents`; they do not call toast, banner, or progress adapters directly.
2. Domain Events contain domain data only; Presenter owns wording, severity, and presentation intent.
3. Dispatcher routes only global intents and has no domain workflow responsibility.
4. Policy maps Presentation Intent to surface and never receives scope or domain data.
5. Adapters own concrete surface behavior only.
6. `PdfApp` owns feature lifecycle and cancellation commands; presentation layers never cancel work directly.
7. Inline component and element states remain local to their rendering owners.

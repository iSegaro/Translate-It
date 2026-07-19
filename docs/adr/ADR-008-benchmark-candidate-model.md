# ADR-008: Benchmark Candidate Model

## Status

Accepted

---

## Context

Region Benchmark compares repeated executions of production Region OCR under defined OCR configurations. Current benchmark configurations include render scale and OCR language; future configurations may vary additional OCR parameters.

## Problem

Region Benchmark previously used provider terminology and resolved translation-provider metadata. Translation providers are neither OCR implementations nor benchmark configurations, so this model cannot describe scale comparisons or execute the intended OCR path.

## Decision

The benchmark unit is an immutable `BenchmarkCandidate`. A candidate identifies one OCR configuration, not an OCR engine.

```js
{
  candidateId: 'scale-1.5-eng',
  configuration: {
    scale: 1.5,
    language: 'eng'
  }
}
```

Provider terminology is removed from Region Benchmark. Benchmark policy supplies OCR configurations to candidate planning. Candidate planning generates immutable candidates only; it does not choose configurations, resolve runtime dependencies, or execute OCR.

Evaluation remains independent from execution. `BenchmarkEvaluator` consumes benchmark outputs only after execution and only when a caller explicitly supplies ground truth; no automatic reference lookup is allowed.

`PdfRegionOcrExecutor` remains the sole production OCR executor. Benchmark orchestration supplies candidates and sequences their execution; it does not own rendering, OCR, cleanup, or cancellation implementation.

## Ownership

- `PdfRegion` remains canonical geometry under ADR-006.
- `RegionExecutionDispatcher` remains request routing under ADR-007.
- Benchmark policy owns the configured OCR configurations.
- `BenchmarkCandidatePlanner` owns candidate generation from supplied configurations.
- Benchmark runner owns benchmark lifecycle only.
- `PdfRegionOcrExecutor` owns render, OCR, cleanup, and cancellation.
- OCR evaluation owns normalization and metrics independently from execution.

## Candidate Model

`OCRConfiguration` is an immutable domain value containing OCR parameters, initially `scale` and `language`. It is not an OCR executor, runtime state, or provider metadata. Future OCR parameters extend `OCRConfiguration`.

`BenchmarkCandidate` owns one `OCRConfiguration` and contains:

- `candidateId`: stable identifier for one configuration.
- `configuration`: immutable `OCRConfiguration`.

Candidates must not contain translation-provider metadata, OCR executor instances, or mutable runtime state.

## Consequences

- Scale comparisons have direct domain representation.
- Future OCR parameters extend `configuration` without introducing provider abstractions.
- Dynamic translation-provider lookup is removed from Region Benchmark.
- `BenchmarkArtifactWriter` produces immutable offline artifacts from completed results without affecting execution or evaluation.
- This decision does not add reporting or multi-engine support.

# Bing Translation Reliability Backlog

Status: Deferred

These items were identified during earlier translation-provider audits. They are intentionally deferred and should be reviewed separately before implementation.

## 1. Token Fetch Bypasses ProxyManager

Bing token acquisition appears to bypass the standard `ProxyManager` request path.

Audit goals:

* Trace token-fetch transport ownership.
* Confirm whether proxy configuration is ignored.
* Compare token requests with normal Bing translation requests.
* Determine whether token fetch should use the existing proxy abstraction.
* Check cancellation, timeout, and network-error behavior.

Do not change proxy architecture before the audit confirms the gap.

## 2. HTML Adaptive Recovery

Bing can return HTML where a translation response is expected.

Audit goals:

* Identify all HTML-response cases.
* Separate transient upstream responses from deterministic failures.
* Determine when retry or recovery is safe.
* Prevent malformed HTML from being treated as valid translation data.
* Avoid broad fallback rules that hide real provider failures.

Recovery behavior must be based on proven response semantics.

## 3. JSON Parse Adaptive Recovery

Bing response parsing can fail when the returned payload does not match the expected JSON structure.

Audit goals:

* Identify current JSON parsing failure paths.
* Separate malformed/transient responses from deterministic schema changes.
* Determine whether retry, alternate parsing, or hard failure is appropriate.
* Preserve canonical error classification.
* Avoid turning arbitrary parse failures into retry loops.

## Workflow

Each item must follow:

`Audit → Review → Approval → Implementation → Review/Fix → Approval → Commit`

Do not combine these items into one implementation unless the audits prove they share the same root cause.

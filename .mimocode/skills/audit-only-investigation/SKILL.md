---
name: audit-only-investigation
description: "Systematic bug investigation workflow: audit codebase without implementing, identify root cause, then apply minimal targeted fix. Use when user says 'audit only' or reports a bug that needs diagnosis before changes."
---

# Audit-Only Bug Investigation

A structured workflow for diagnosing bugs by reading code first, then fixing surgically. Prevents premature implementation and ensures root cause is understood before any changes.

## When to Use

- User reports a bug and says "audit only" or "do not implement yet"
- User pastes logs/console output for analysis
- Bug involves complex cross-component interactions (e.g., manifest, background script, content script boundaries)
- Issue spans multiple files and the root cause is unclear

## Workflow Steps

### Phase 1: Context Collection
1. Read all relevant source files mentioned in the bug report
2. Read related documentation (`docs/technical/*.md`)
3. Trace the call chain from entry point to failure point
4. Identify all files in the path (composables, handlers, services, configs)

### Phase 2: Static Audit
1. Map the full data/control flow for the failing feature
2. Identify every candidate that could cause the reported symptom
3. For each candidate, determine: is it provably correct, provably wrong, or ambiguous?
4. Rank candidates by likelihood
5. Produce an audit report with findings

### Phase 3: Runtime Investigation (if static audit is inconclusive)
1. Design targeted instrumentation points (what to log, where, why first)
2. Ask user to reproduce with instrumentation
3. Collect real logs
4. Eliminate candidates based on evidence

### Phase 4: Root Cause Confirmation
1. State the root cause with file path, line number, and the exact mechanism
2. Explain why the bug manifests with the observed symptoms
3. Identify any related code that should also be checked

### Phase 5: Minimal Fix
1. Implement only the smallest change that fixes the root cause
2. Do NOT refactor, clean up, or add features
3. Verify the fix doesn't break existing functionality
4. If additional cleanup is needed, do it in a separate step after the fix is confirmed

## Output Format

```
## AUDIT REPORT: [Bug Title]

### 1. ROOT CAUSE IDENTIFIED
**Location:** `file:line`
**Mechanism:** [exact description of what goes wrong]

### 2. CANDIDATES EVALUATED
| # | Candidate | File | Verdict | Evidence |
|---|-----------|------|---------|----------|

### 3. FIX
[Minimal change with before/after code]

### 4. VERIFICATION
[How to confirm the fix works]
```

## Anti-Patterns to Avoid

- Jumping to implementation before understanding root cause
- Fixing symptoms instead of the root cause
- Making multiple unrelated changes in one fix
- Refactoring while debugging (conflates debugging with cleanup)
- Guessing without evidence — always trace the code path first

## Related Investigation Methodology

For overlay rendering bugs specifically, follow the proven methodology from the Live Caption YouTube Shorts investigation:
1. Static code audit to identify candidates
2. Runtime investigation plan with instrumentation points
3. Narrow instrumentation to the specific subsystem
4. Collect real logs to eliminate candidates
5. Diagnose from evidence

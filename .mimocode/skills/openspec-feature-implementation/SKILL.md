---
name: openspec-feature-implementation
description: "OpenSpec-driven feature implementation workflow: read proposal/design/tasks/spec, audit current state, implement in phases, run post-implementation audit. Use when implementing a feature from openspec/changes/."
---

# OpenSpec Feature Implementation

A structured workflow for implementing features defined in the `openspec/changes/` directory. Ensures specs are read before coding, implementation follows planned phases, and a post-implementation audit catches issues before merge.

## When to Use

- User asks to implement a feature from `openspec/changes/<feature-name>/`
- User says "implement Phase N" for a feature with existing OpenSpec docs
- Resuming work on a multi-phase feature after context reset

## Workflow Steps

### Phase 0: Spec Reading
1. Read ALL files in `openspec/changes/<feature-name>/`:
   - `proposal.md` — vision, goals, constraints
   - `design.md` — architecture, data flow, component boundaries
   - `tasks.md` — phased task breakdown with completion status
   - `specs/<feature>/spec.md` — detailed technical specification
2. Read the relevant `docs/technical/*.md` for affected subsystems
3. Read `AGENTS.md` for architectural directives
4. Understand which phases are complete and what comes next

### Phase 1: Current State Audit
1. Read all existing implementation files for the feature
2. Verify that completed phases match what `tasks.md` claims
3. Identify any gaps, stubs, or incomplete implementations
4. Check for existing tests and their coverage
5. Report: "Here is what exists and what is missing"

### Phase 2: Phase Implementation
1. Implement the specified phase following the task breakdown
2. Follow architectural directives from `AGENTS.md`:
   - Clean Code principles
   - Feature-based organization (`src/features/<feature>/`)
   - Composable owns business logic, component is presentation-only
   - Strict Shadow DOM isolation
3. Update `tasks.md` to mark completed tasks
4. Run tests after each meaningful unit of work

### Phase 3: Post-Implementation Audit
1. Run full test suite
2. Run build validation (Chrome + Firefox if applicable)
3. Check for:
   - Unused imports
   - Duplicated/orphan i18n keys in `messages.json`
   - Missing or stale documentation
   - Consistency with existing patterns
4. Fix any correctness issues found
5. Do NOT add new features — fix only

### Phase 4: Summary
Produce a summary with:
- Files changed
- What was implemented
- Test results
- Any issues found and fixed
- Remaining work for next phase

## Output Format

```
## Phase N Implementation: [Feature Name]

### Files Changed
- `path/to/file.js` — [what changed]

### Implementation Summary
[Brief description of what was done]

### Test Results
[Pass/fail counts]

### Audit Findings
[Issues found and fixed, or "No issues found"]

### Remaining Work
[What's left for next phases]
```

## Anti-Patterns to Avoid

- Implementing without reading specs first
- Skipping the current state audit (leads to duplicate/conflicting work)
- Implementing multiple phases in one pass (harder to review and debug)
- Skipping post-implementation audit (catches real issues)
- Adding features beyond the current phase scope

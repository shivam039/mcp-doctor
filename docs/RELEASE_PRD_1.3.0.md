# Release PRD: mcp-medic 1.3.0 — Selective CLI Checks

**Status:** Proposed
**Target:** 1.3.0
**Owner:** mcp-medic maintainers

## Summary

Let CLI users select a subset of registered checks with `--only-checks` for `check`, `score`, and `watch`. This makes the existing coverage-aware score useful for focused investigations and repeated local validation, while preserving the current all-checks default and surfacing partial coverage.

## Problem

The library accepts a restricted check set, and the quality score reports coverage gaps, but CLI users cannot select checks. Every CLI run executes all checks. That makes targeted diagnosis and focused watch runs unnecessarily noisy, while leaving CLI quality coverage unable to represent a deliberately partial assessment.

## Goals

1. Add `--only-checks <id[,id...]>` to `check`, `score`, and `watch`.
2. Resolve IDs against the checks active for the run, including policy checks loaded with `--policy`.
3. Reject missing, empty, duplicate, unknown, or unsupported-command selections as usage errors (exit code 2) before any server connection is attempted.
4. Preserve default behavior when the flag is omitted.
5. When a subset is selected, include the quality score and its coverage in human output; keep JSON coverage accurate and let `quality.minimumScore` continue warning on partial assessment.

## Non-goals

- Filtering checks for `check-all` or `fix` in this release.
- Changing check order, check implementations, scoring weights, or default check behavior.
- Loading third-party check plugins.

## Acceptance criteria

- Comma-separated IDs are trimmed and run in the registry's stable check order.
- Duplicate IDs, empty list items, missing values, unknown IDs, and unsupported command combinations fail with actionable usage errors and code 2.
- Unknown IDs are rejected before a server process or network connection is started.
- `check`, `score`, and `watch` run only selected checks; default runs still use the complete active check set.
- Restricted runs show accurate `quality.coverage` in JSON and human output; an active minimum-score policy still reports its partial-coverage warning.

## Adversarial review

- Validate the flag with missing values, leading/trailing commas, duplicate IDs, whitespace, unknown IDs, and commands outside the supported set.
- Ensure policy checks are selectable only when the matching policy is loaded.
- Confirm an empty or invalid selection cannot silently turn a validation run into a passing no-op.
- Confirm a restricted run cannot appear to have full coverage in human or JSON reports.

## Iteration

One GitHub issue and one PR will deliver the CLI option, documentation, tests, adversarial review, and release notes.

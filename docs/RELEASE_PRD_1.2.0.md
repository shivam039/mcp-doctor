# Release PRD: mcp-medic 1.2.0 — Reliable Fleet Validation

**Status:** Proposed  
**Target:** 1.2.0  
**Owner:** mcp-medic maintainers

## Summary

Make `mcp-medic check-all` predictable and safe to use as a CI gate across large repositories. The release focuses on reliable file discovery, bounded parallel execution, complete drift detection without leaking credentials, trustworthy machine-readable reports, and clear behavior when no configs match.

## Problem

Fleet validation is marked experimental and has limited edge-case coverage. Recursive matches are returned in filesystem order; checks run one file at a time; `diff` overlooks HTTP headers and token-refresh configuration; fleet JUnit suite totals do not include parse failures consistently; and a glob matching zero files currently produces a successful exit. These behaviors make runs harder to reproduce and can produce misleading CI results.

## Goals

1. Make config discovery deterministic and constrain filesystem traversal to intended files.
2. Let users speed up fleet checks with an explicit concurrency limit while preserving stable result order.
3. Detect relevant transport/auth configuration drift while never printing credential values.
4. Make fleet JUnit output internally consistent and represent each scanned file, including malformed files.
5. Fail clearly when the fleet glob matches nothing, while retaining documented error/warning threshold behavior.

## Non-goals

- Invoking MCP tools or changing protocol handshakes.
- Changing the config schema or adding JSONC parsing.
- Automatically fixing configuration drift.
- Changing the default diagnostic threshold or making warnings blocking by default.
- Claiming heuristic security checks are a complete security audit.

## User stories

- As a CI maintainer, I get the same ordered fleet report on every run and a nonzero status if the glob is wrong.
- As a monorepo maintainer, I can set a safe concurrency cap to shorten large fleet checks without spawning unbounded work.
- As an operator comparing staging and production, I can see whether auth/transport settings differ without exposing secret contents in terminal or JSON output.
- As a CI dashboard user, JUnit counts and test cases accurately represent every config file scanned.

## Iterations and acceptance criteria

### Iteration 1 — Discovery correctness

- Sort matching paths deterministically.
- Support the documented `*` and `**` patterns without matching paths outside the requested root.
- Do not follow symlinked directories during recursion; handle inaccessible entries without crashing.
- Add focused regression tests for ordering, nested paths, exclusion directories, and traversal boundaries.

### Iteration 2 — Bounded parallel fleet checks

- Add `--jobs <n>` for `check-all`, requiring a positive safe integer.
- Default to one worker for backwards-compatible process behavior.
- Never exceed the requested worker count; preserve sorted result order regardless of completion order.
- Verify workers settle safely when one file is malformed or a connection/check rejects.

### Iteration 3 — Complete, secret-safe drift comparison

- Include headers, token refresh URL, and token refresh body in `diff` results.
- Compare nested objects independent of key insertion order.
- Redact credential-like values in text and JSON output while still reporting that a secret-bearing field changed.
- Add tests proving secrets are neither returned nor printed.

### Iteration 4 — Trustworthy fleet JUnit

- Ensure aggregate and per-file test/failure counts match emitted testcases.
- Represent config parse/validation failures as test failures and retain warnings as non-failing output.
- Escape XML-sensitive paths, names, and diagnostic text.
- Cover empty fleets and mixed valid/invalid inputs.

### Iteration 5 — CI gate clarity and release documentation

- A zero-match fleet run must exit nonzero with a clear actionable message.
- Keep `--fail-on error|warning` behavior explicit and test threshold boundaries.
- Document `--jobs`, matching semantics, zero-match behavior, and the security boundary for live config execution.
- Update changelog and remove the fleet experimental limitation only if all acceptance criteria pass.

## Adversarial review required in every iteration

Before opening each PR, review its diff as an attacker and a CI operator. Probe malformed input, boundary values, partial failures, nondeterministic completion, path escape/symlink cases, XML injection, and secret leakage as applicable. Record findings and resolutions in the PR description. Block merge on any unresolved correctness or security finding.

## Release-level verification

- Run the complete unit suite, package typecheck, and production build after each iteration.
- Run targeted regression/sanity checks for each changed behavior.
- Run the live fleet benchmark only when its external server/network prerequisites are available; report it separately from deterministic CI checks.
- Confirm the five GitHub issues are implemented and closed by merged PRs.

## Success measures

- All deterministic regression checks pass on supported Node versions.
- Matching the wrong path cannot silently pass CI.
- Output is stable across repeated runs and never discloses credentials.
- The fleet command stays bounded by the configured concurrency value.

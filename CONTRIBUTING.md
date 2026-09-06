# Contributing to mcp-medic

Thanks for considering a contribution. This project is small and moves fast, so a few ground rules keep it maintainable.

## Getting started

```bash
git clone https://github.com/shivam039/mcp-doctor.git
cd mcp-doctor
npm install
npm run build
npm run typecheck
npm test
```

All four of those should pass on a clean checkout before you start changing anything.

## Project layout

- `src/types.ts` — the frozen core interfaces (`MCPConfig`, `MCPConnection`, `DiagnosticResult`, `Check`, `RunReport`). Changing these is a breaking change — see [docs/STABILITY_POLICY.md](./docs/STABILITY_POLICY.md).
- `src/protocol/` — the handshake/transport layer (stdio, SSE, HTTP).
- `src/checks/` — built-in diagnostic checks. See [docs/AUTHORING_CHECKS.md](./docs/AUTHORING_CHECKS.md) if you're adding one.
- `src/cli.ts` — the CLI entry point (`check`, `watch`, `check-all`, `diff`, `fix`, `--help`, `--version`).
- `src/fix.ts` — the `mcp-medic fix` auto-apply logic.
- `src/policy.ts`, `src/fleet.ts`, `src/junit.ts` — policy-as-code, multi-config fleet scanning, and CI report export.
- `test/` mirrors `src/` — most modules have a matching `*.test.ts`.

## Making a change

1. Open an issue first for anything non-trivial (new checks, CLI flags, breaking changes) so we can agree on the approach before you write code. Small, obvious fixes (typos, a clearly broken edge case) can go straight to a PR.
2. Write or update tests alongside the change. `npm test` should stay green — the CI matrix runs it on Node 18, 20, and 22 across Linux, macOS, and Windows.
3. Run `npm run typecheck` and `npm run build` before opening a PR.
4. Keep PRs scoped to one change. Unrelated cleanup, even if correct, makes review slower.

## Adding a built-in check

Built-in checks (`src/checks/*.ts`) ship enabled for everyone, so the bar is high — see [GOVERNANCE.md](./GOVERNANCE.md#1-decision-process-for-new-built-in-checks) for the acceptance criteria (unambiguous diagnostic value, near-zero false positives, must pass `runCheckConformanceSuite()`). If your rule is more subjective (style preferences, naming conventions, org-specific policy), it likely belongs in `.mcp-medic-policy.json` (policy-as-code) or as a standalone `mcp-medic-check-*` community package instead of a built-in.

## Reporting bugs / requesting features

Use the [issue templates](./.github/ISSUE_TEMPLATE/) — they ask for the minimum needed to reproduce a bug or evaluate a feature request. Search existing issues first.

## Security issues

Do not open a public issue for a security vulnerability. See [SECURITY.md](./SECURITY.md) for the private reporting process.

## Code of conduct

Be respectful and assume good faith. Disagreements about technical direction are fine and expected; personal attacks are not.

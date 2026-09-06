# DECISIONS.md — append-only log

Add a new entry at the bottom whenever you make a choice that isn't obvious
from the code alone (a timeout value, a fallback behavior, a scope cut).
Never edit or delete past entries — if a decision is reversed, add a new
entry that supersedes it and says so.

Format:
```
## YYYY-MM-DD — [owner] short title
Decision: ...
Reason: ...
Supersedes: (link to earlier entry, if any)
```

---

## 2026-09-06 — [core] v1 scope frozen to CONTRACT.md's "Scope of v1"
Decision: v1 = parse config, handshake, schema validation, sample-call
simulation, human+JSON report. No auto-fix, GUI, multi-server orchestration,
or VS Code extension in v1.
Reason: narrow scope shipped fast beats broad scope shipped never (lesson
carried over from token-budget's distribution phase).

## 2026-09-06 — [core] Check interface must never throw
Decision: `Check.run()` implementations must catch their own errors and
return an `error`-severity `DiagnosticResult` instead of throwing.
Reason: one malformed community/future check shouldn't crash the whole run;
matches the "isolate failures" pattern used elsewhere in these kinds of
diagnostic tools.

## 2026-09-06 — [antigravity] picocolors for CLI color output
Decision: use `picocolors` (added to `dependencies`, not devDependencies —
it's needed at runtime by `dist/cli.js`) for red/yellow/green terminal
output in `src/cli.ts`.
Reason: no color library existed in package.json yet. picocolors is ~500
bytes, zero dependencies, and is the smallest/fastest of the common options
(chalk/kleur/colorette/ansi-colors) — a CLI this small doesn't need chalk's
API surface.

## 2026-09-06 — [antigravity] CLI imports checks/protocol via non-literal
dynamic `import()`, not the static re-export pattern from the task spec
Decision: `src/cli.ts` loads `./checks/index.js` and `./protocol/index.js`
through a shared `importOptional(specifier: string)` helper (specifier
passed as a runtime string, not a string literal in the `import()` call
itself) and swallows module-not-found errors, falling back to an empty
check list / the orchestrator's built-in `connectStub`. Same reasoning
applies to `src/index.ts`: the `export { allChecks } from './checks/index.js'`
re-export named in the task spec is left as a comment, not live code.
Reason: as of this session, `src/checks/` and `src/protocol/` are both
still empty (`.gitkeep` only) — Codex and Jules haven't started (see
STATUS.md). A literal `import('./checks/index.js')` makes `tsc` try to
resolve that module at type-check time and fails the build for everyone
until those modules land, which breaks the "nobody blocks on another
module's implementation" rule in CONTRACT.md. This makes the CLI/library
work today (reporting a clear "protocol layer not yet implemented"
per-server error) and pick up the real implementations automatically, with
zero CLI changes required, the moment Codex/Jules land their `index.ts`
files exporting `connect`/`registerProtocol` and `allChecks` respectively.
Once `src/checks/index.ts` lands, uncomment the static re-export in
`src/index.ts` — the dynamic-import path in `cli.ts` can stay either way,
but switching it to a static import at that point is a fine cleanup, not
required.

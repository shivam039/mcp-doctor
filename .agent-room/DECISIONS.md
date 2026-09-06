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

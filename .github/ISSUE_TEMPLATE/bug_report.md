---
name: Bug report
about: Something in mcp-medic isn't working as expected
title: ''
labels: bug
assignees: ''
---

**What happened?**
A clear description of the incorrect behavior.

**What did you expect to happen?**

**Steps to reproduce**
1. Config used (redact secrets/tokens — see note below):
   ```json

   ```
2. Command run:
   ```
   mcp-medic ...
   ```
3. Output / error:
   ```

   ```

**Environment**
- `mcp-medic` version (`mcp-medic --version`):
- Node version (`node --version`):
- OS:
- Installed via: npx / global install / GitHub Action

**Additional context**
Anything else that might help — e.g. this only happens with a specific transport (stdio/sse/http), only in CI, only with `--policy`, etc.

---
> ⚠️ Before posting: if this is a **security vulnerability** (e.g. a check failing to catch something exploitable, or an auth/data-handling bug), please do not file a public issue — see [SECURITY.md](../../SECURITY.md) for the private reporting process instead. Also double-check your config snippet doesn't contain real tokens, API keys, or internal hostnames before pasting it here.

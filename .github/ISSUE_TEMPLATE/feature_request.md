---
name: Feature request
about: Suggest a new check, CLI flag, or capability for mcp-medic
title: ''
labels: enhancement
assignees: ''
---

**What problem does this solve?**
Describe the situation where mcp-medic currently falls short — a config mistake it doesn't catch, a workflow it doesn't support, etc.

**Proposed solution**
What would you like mcp-medic to do? If you're proposing a new built-in check, note that built-in checks have a high bar (near-zero false positives, unambiguous diagnostic value — see [GOVERNANCE.md](../../GOVERNANCE.md#1-decision-process-for-new-built-in-checks)); a policy rule (`.mcp-medic-policy.json`) or a standalone `mcp-medic-check-*` community package may fit better for anything subjective or org-specific.

**Alternatives considered**
Any workarounds you're using today, or other approaches you considered.

**Would you be willing to open a PR for this?**
Yes / No / Maybe, with guidance

---
> For anything that changes core types, the CLI command structure, or another frozen 1.0 surface (see [docs/STABILITY_POLICY.md](../../docs/STABILITY_POLICY.md)), consider opening an [RFC](../../docs/RFC_TEMPLATE.md) instead of (or alongside) this issue.

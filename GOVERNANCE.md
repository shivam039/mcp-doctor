# Governance & Project Sustainability

This document outlines the decision-making process, security check threshold, and maintainer continuity plan for `mcp-medic`.

---

## 1. Decision Process for New Built-In Checks

Built-in checks ship enabled by default for all users. Because false positives break CI builds and erode developer trust, adding new built-in checks requires meeting strict criteria:

1. **Definitive Diagnostic Value**: The check must identify an unambiguous error, contradiction, or standard protocol violation — not subjective style preferences.
2. **High Security Bar**: Security and policy checks must maintain a <1% false-positive rate on standard compliant MCP servers.
3. **Strict Conformance**: All candidate checks must pass `runCheckConformanceSuite()`, guaranteeing zero uncaught exceptions and robust error boundaries.
4. **Subjective Rules Belong in Policy-as-Code or Community Checks**: Rules such as description length minimums, banned transports, or naming conventions must be implemented as optional policies (`.mcp-medic-policy.json`) or community check packages (`mcp-medic-check-*`), rather than forced defaults.

---

## 2. Request for Comments (RFC) Process

Substantial additions to `mcp-medic` core, type interfaces, or CLI command structure follow the public RFC process:
- Open an RFC issue using [docs/RFC_TEMPLATE.md](./docs/RFC_TEMPLATE.md).
- Follow the process detailed in [docs/RFC_PROCESS.md](./docs/RFC_PROCESS.md).
- Solicit review and approval from the project's maintainer(s) before merging — today that's a single maintainer; this will require at least two once the maintainer group grows.

---

## 3. Maintainer Bus-Factor & Continuity Plan

- **Decoupled Architecture**: `mcp-medic` maintains clean separation between protocol transports (`src/protocol`), diagnostic checks (`src/checks`), configuration parsing (`src/config-loader`), and interfaces (`src/types.ts`). Any module can be updated independently without breaking sibling components.
- **Contract as Single Source of Truth**: Interfaces are frozen and mirrored in [`.agent-room/CONTRACT.md`](./.agent-room/CONTRACT.md).
- **Automated Verification**: Full CI regression suite runs across multiple Node.js environments on every PR.

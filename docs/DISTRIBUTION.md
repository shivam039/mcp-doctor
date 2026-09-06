# Distribution & Growth Strategy

`mcp-medic` features a comprehensive diagnostic and governance surface (core handshake diagnostics, schema validation, auto-fix suggestions, VS Code extension, policy-as-code, fleet drift detection). However, developer tooling only creates value when actively adopted by real engineers. This document outlines the distribution flywheel, outbound messaging playbooks, honesty checks, and operational boundaries.

---

## Why mcp-medic's Distribution Advantages Matter

1. **Narrow, Emerging Ecosystem**: The Model Context Protocol (MCP) ecosystem is rapidly expanding without an entrenched config diagnostic standard.
2. **Concentrated Community**: Discussion occurs in high-intent hubs (Anthropic MCP Discord, `modelcontextprotocol/servers`, `modelcontextprotocol/typescript-sdk`, and Claude Desktop / Claude Code user communities).
3. **Immediate Hour-One Pain**: Developers hit broken transports, spawning issues, or invalid JSON schemas during their first hour of setup, making the time-to-value immediate.
4. **Early Search Advantage**: High-intent search terms ("MCP server not connecting", "MCP handshake failed") currently have minimal competition.

---

## The 4-Stage Growth Flywheel

```
[ Stage 1: First 10 Users ]
       │  Direct diagnostic offers on active GitHub issues / Discord
       ▼
[ Stage 2: First 50 Users ]
       │  Server authors adopting mcp-medic in CI & pre-publish hooks
       ▼
[ Stage 3: First 100 Users ]
       │  Public dependents, case studies, and VS Code Marketplace discovery
       ▼
[ Stage 4: 1,000+ Users ]
       │  Organic search landing pages & official framework recommendations
       ▼
[ Sustainable Ecosystem Standard ]
```

---

### Stage 1: First 10 Users (High-Intent Diagnostic Outreach)

- **Target Locations**:
  - Issues on `modelcontextprotocol/servers`, `modelcontextprotocol/typescript-sdk`.
  - Active support channels in Anthropic Discord where developers paste broken configs.
- **Diagnostic Offer Pattern**:
  Never send a generic promotional pitch. Reference their exact symptom and offer a standalone diagnosis:
  > *"Saw your issue about the handshake timing out on stdio. I built a CLI that runs the exact MCP initialize handshake standalone and tells you whether the failure is in the process spawn, protocol negotiation, or tools/list schema: `npx mcp-medic check ./mcp.json --verbose`. Might help isolate whether the bug is in the client configuration or server startup."*
- **Signal Filter**:
  - **Useful Signal**: *"It caught a missing required field in my schema that Claude Desktop was silently ignoring."* / *"It failed on this specific SSE redirect."*
  - **Noise**: Stars without usage feedback.

---

### Stage 2: First 50 Users (Server Author CI Adoption)

- **Target Audience**: MCP server authors (not just end consumers).
- **Core Value Proposition**: Prevent publishing broken schemas with exit codes and JUnit CI export:
  - Run `mcp-medic check --fail-on error --export-junit results.xml` in GitHub Actions.
- **High-Leverage Move**: Contributing guide PRs to popular community server repos suggesting `mcp-medic` as a pre-publish check.
- **Differentiated Content**: Walkthroughs analyzing real-world MCP schema security pitfalls (prompt injection risk patterns, missing description traps, unconstrained parameters).

---

### Stage 3: First 100 Users (Dependents & In-Editor Discovery)

- **Dependency Flywheel**: Server authors adding `mcp-medic` to `devDependencies` appear in npm and GitHub dependency graphs.
- **Case Study**: Partner with an active server author to publish an honest 2-minute retrospective: *"How we caught 4 schema regressions in CI before releasing v1.2"*.
- **VS Code Extension Discovery**: The in-editor extension catches errors during active editing, serving as an organic acquisition funnel directly from the VS Code Marketplace.

---

### Stage 4: 1,000+ Users (Search & Framework Integration)

- **Search-Optimized Landing Content**: Ranking for exact-match diagnostic queries:
  - *"MCP server not connecting"*
  - *"MCP handshake failed"*
  - *"Validate MCP tool schema"*
- **Upstream Recommendation**: Pursue inclusion in official MCP documentation via well-tested documentation PRs once stability is proven across 100+ production repositories.

---

## Kill Criteria & Honesty Check

To prevent blindly scaling outreach volume when positioning is not resonating:

> ⚠️ **Honesty Check**:
> If after **25 targeted outreach attempts** fewer than **15% (3–4 developers)** produce real engagement, diagnostic usage, or actionable bug reports:
> 1. **STOP outreach immediately.**
> 2. Revisit the CLI error output and diagnostic clarity.
> 3. Interview the engaged users to diagnose why the offer did not solve an immediate blocker before resuming outreach.

---

## Strict Don't-Do List

To protect project reputation and community trust:

1. ❌ **No Mass-Posting**: Never copy-paste identical template messages across multiple GitHub threads or Discord channels. Every message must address a specific developer's concrete error.
2. ❌ **No Star-Begging**: Never ask for GitHub stars in outreach messages, docs, or CLI output. Measure success by verified diagnostic runs and CI integrations.
3. ❌ **No Premature Upstream PRs**: Never submit a PR recommending `mcp-medic` to `modelcontextprotocol/servers` before achieving proven stability across real-world usage and passing 100% of test suites.
4. ❌ **No Unsolicited Mass DMs**: Keep all conversations in public support threads where others facing the same error can benefit.

# Outreach Tracking Log

Use this log to track developer interactions, diagnose message resonance, and enforce the honesty check criteria defined in [DISTRIBUTION.md](./DISTRIBUTION.md).

---

## Outreach Metrics Dashboard

- **Total Outreach Attempts**: 0
- **Meaningful Engagements**: 0
- **CI / CLI Conversions**: 0
- **Conversion Rate**: 0.0% *(Target: >15%)*
- **Current Status**: 🟢 Active (Proceeding with first 25 targeted diagnostic offers)

---

## Interaction Log

| Date | Platform | Target Repo / User | Error Symptom Referenced | Message Sent Summary | Response / Feedback | Outcome |
|---|---|---|---|---|---|---|
| *2026-09-06* | *GitHub Issue* | *example/mcp-server#42* | *Handshake timed out on stdio spawn* | *Offered standalone diagnostic via npx mcp-medic check* | *Pending* | *Pending* |

---

## Logging Guidelines

1. **Log Every Interaction**: Record every message sent on GitHub issues, PRs, Discord, or forums immediately.
2. **Classify Feedback**:
   - `Signal`: Specific error caught, bug report filed, feature request, CI integration.
   - `Neutral`: Friendly acknowledgement without running the tool.
   - `Ignored`: No response after 7 days.
3. **Trigger Honesty Check**: If after 25 rows fewer than 4 rows have `Signal`, pause outreach and review CLI output clarity.

Expect (per server, against a live connection — see the unit-tested equivalents in `test/checks/security-untrusted-remote.test.ts` for the exact assertions):
- `trusted`: no `security.untrusted-remote` diagnostics (https + domain).
- `insecure-domain`: one `warning` (non-https), with a fixable `patch` upgrading to `https://`.
- `ip-literal`: one `warning` (raw IP host), no `patch` (no safe mechanical fix — there's no way to know the intended domain name).
- `insecure-and-ip-literal`: two independent `warning` diagnostics (non-https, and raw IP host); only the non-https one is fixable.
- `local-dev`: one `warning` (non-https) but no raw-IP-host warning — loopback addresses are excluded from that check since local dev configs pointing at 127.0.0.1 are expected and not "untrusted" in the same sense as a public IP.

All diagnostics are `warning`, never `error` — per FR3-2.3 this check is informational, not blocking, since legitimate local dev configs exist.

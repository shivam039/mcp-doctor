# CI Integration Guide for MCP Server Authors

Prevent publishing broken schemas and failing handshakes by integrating `mcp-medic` directly into your server's CI pipeline.

---

## 1. GitHub Actions (Official Action)

Add `.github/workflows/mcp-medic.yml` to your repository:

```yaml
name: Validate MCP Server
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run MCP Medic
        uses: shivam039/mcp-doctor@main
        with:
          config-path: './.mcp.json'
          fail-on: 'error'
          show-fixes: 'true'
```

---

## 2. GitHub Actions (Direct CLI with JUnit Reporting)

If you prefer using `npx` directly and rendering native JUnit test results:

```yaml
name: MCP Validation with Test Report
on: [push, pull_request]

jobs:
  mcp-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run Diagnostics & Export JUnit
        run: npx --yes mcp-medic check --export-junit junit-results.xml
      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          junit_files: 'junit-results.xml'
```

---

## 3. Pre-Publish NPM / PyPI Hook

Add `mcp-medic` to your `package.json` scripts:

```json
{
  "scripts": {
    "prepublishOnly": "mcp-medic check --fail-on error"
  },
  "devDependencies": {
    "mcp-medic": "^1.0.0"
  }
}
```

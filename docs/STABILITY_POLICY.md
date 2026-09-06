# 1.0 API Stability & Deprecation Policy

`mcp-doctor` follows [Semantic Versioning 2.0.0](https://semver.org/).

---

## 1. Frozen Public Surfaces (v1.0)

The following core interfaces and contracts are frozen:

1. **Check Plugin Contract**:
   - `Check` interface (`id`, `description`, `run(connection: MCPConnection): Promise<DiagnosticResult[]> | DiagnosticResult[]`).
   - `DiagnosticResult` shape (`checkId`, `severity`, `message`, `serverName`, `toolName`, `details`, `suggestedFix`).
   - Non-throwing guarantee (`Check.run()` must catch internally).

2. **Orchestration API**:
   - `runChecks(config: MCPConfig, options?: RunOptions): Promise<RunReport>`
   - `loadConfig(rawJson: unknown, sourcePath?: string): ConfigLoadResult`

3. **CLI Commands & Flags**:
   - `check [configPath]`, `watch <configPath>`
   - `--config`, `--registry`, `--show-fixes`, `--fail-on`, `--verbose`, `--json`, `--timeout`
   - Exit code taxonomy: `0` (clean), `1` (diagnostic failure), `2` (usage/config error).

---

## 2. Deprecation Policy

- **Deprecation Notices**: Any feature or API planned for removal will be marked as deprecated for at least one major release cycle with runtime warnings.
- **Breaking Changes**: Breaking changes to core types or CLI flags will only occur in major version increments (e.g. `2.0.0`).

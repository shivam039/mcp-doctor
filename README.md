# mcp-doctor

Diagnose broken MCP (Model Context Protocol) server configs before they
break your agent silently.

`mcp-doctor` checks an MCP server config, performs the real `initialize`
handshake, validates every tool's JSON schema, and simulates a sample tool
call — then tells you exactly where and why something is wrong.

## Status

Early development. Not yet published to npm. See
[`.agent-room/STATUS.md`](./.agent-room/STATUS.md) for current build state.

## Install (once published)

```bash
npm install -g mcp-doctor
mcp-doctor check ./mcp-config.json
```

## Development

This repo is being built collaboratively across multiple AI coding
sessions/tools with no shared memory between them. See
[`.agent-room/CONTRACT.md`](./.agent-room/CONTRACT.md) for the frozen
interfaces every module implements against, and
[`.agent-room/STATUS.md`](./.agent-room/STATUS.md) for what's done/pending.

```bash
npm install
npm run build
npm run typecheck
npm run test
```

## License

MIT

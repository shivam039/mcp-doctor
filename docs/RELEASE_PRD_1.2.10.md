# Release PRD: mcp-medic 1.2.10 — VS Code Extension Build Validation

**Status:** Complete — ready for 1.2.10 release
**Target:** 1.2.10
**Owner:** mcp-medic maintainers

## Summary

Make the experimental VS Code extension's build reproducible and continuously validated alongside the core package. This release adds a root command that builds the core package, installs the extension's locked development dependencies, and compiles it; CI runs that command, and local setup docs use clean dependency installation steps.

## Problem

The extension has a committed lockfile and compile script, but the CI workflow never installs its dependencies or compiles it. A baseline compile without installing the extension dependencies failed with missing `vscode` types; after `npm ci --prefix vscode-extension`, compilation passed. Without CI coverage, changes to the extension or shared diagnostic API can break it unnoticed.

## Goals

1. Provide a single root command that builds the parent package, installs the extension's locked development dependencies, and compiles the extension.
2. Run the root command in CI so the extension compiles against the freshly built parent package.
3. Document reproducible `npm ci` setup for local extension development.

## Non-goals

- Publishing the extension to the VS Code Marketplace or changing its experimental status.
- Packaging a self-contained VSIX or changing extension behavior.
- Adding VS Code UI integration tests.

## Acceptance criteria

- `npm run check:vscode-extension` builds the root package, installs from `vscode-extension/package-lock.json`, and compiles the extension from a clean checkout.
- CI runs `npm run check:vscode-extension` as the build and compile guard.
- Local setup documentation uses the lockfile-based install flow.
- Existing core tests, typecheck, build, and extension compile pass.

## Adversarial review

- Confirm the extension build can resolve the parent `dist/extension/index.js` type import by running after the root build.
- Confirm CI installs the extension dependencies from its lockfile rather than relying on root `node_modules` or a developer's machine.
- Confirm generated extension output remains ignored and is not accidentally published in the root npm package.

## Iteration

One issue and one PR will deliver the command, CI coverage, docs, and regression verification for this release.

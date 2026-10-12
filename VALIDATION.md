# Validation record — 2026-10-12

## Executed here

- Windows, Node.js 24.12.0: 12 automated tests passed, 0 failed, 1 skipped.
- Coverage: known byte totals, hidden and Unicode files, empty folders, overlapping roots, bounded rankings, root boundary checks, cancellation, entry/time limits, injected access denial, disappearing files, changing files/directories, metadata-only behavior, configuration overrides and platform-specific path fixtures for all three operating systems.
- A real SDK client launched the MCP server over stdio, negotiated the protocol, listed all three tools, invoked them, compared scan totals with the CLI, and checked access denial and attempted scope expansion.
- The MCP/CLI integration test also passed against the standalone bundled builds.
- The official MCPB tool validated the manifest and built the extension.
- The skill-creator validator passed the skill's frontmatter and content checks.

The skipped test attempts to create an actual junction/symlink: this Windows sandbox disallows creating one. Link-rejection logic is additionally tested with injected filesystem metadata and passes; real link behavior remains for the CI matrix or an unrestricted test machine.

A read-only live scan from Codex exercised the scanner against local agent/workspace data. It returned partial results with explicit coverage warnings and a 45-second limit. Local names and measurements are deliberately excluded from distributable packages.

## Not executed here

- macOS and Linux runtime tests. Path fixtures pass on Windows, and the included CI workflow runs tests on Windows/macOS/Linux with Node 22 and 24 once hosted in a repository. That workflow has not been remotely run.
- Installation and skill auto-discovery inside Claude Code, Cursor, Gemini CLI, Copilot or OpenCode.
- Claude Desktop extension installation and UI interactions. Package/schema validation and protocol tests do not substitute for a live client installation test.
- Marketplace publication, package signing, automatic updates or continuous monitoring; none are included.

See SETUP.md for the documentation-backed integration matrix and runtime prerequisites.

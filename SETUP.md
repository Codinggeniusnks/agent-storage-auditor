# Agent Storage Auditor 1.0

Ask your assistant: **“Show how much storage my AI agents use, where their files are, and what each folder contains.”**

Runs on demand. Measures logical disk storage, not RAM. No deletion, background service, account, API key or telemetry is required. The scanner reads names and filesystem metadata, not file contents. Paths and summaries passed to your assistant follow that assistant's data handling policies.

## Choose your installation

### Claude Desktop

Download `agent-storage-auditor-1.0.0.mcpb`. In Claude Desktop, open Settings → Extensions → Advanced settings → Install Extension and select the file. Choose the agent folders you permit it to scan. For example, choose `.codex`, `.claude`, `.cursor`, `.gemini`, `.copilot`, or a specific workspace in your home folder. Hidden folders may require typing their paths into the folder picker.

The server cannot scan outside those selected folders. You can change them in extension settings. Choosing a home directory grants access to its descendants, but automatic scans still target known agent folders rather than scanning the whole home directory. For another permitted workspace, ask explicitly to scan that path.

Claude Desktop supplies a Node runtime; this package requires Node 22 or later. If the app's bundled runtime is older, update the app or configure the standalone MCP server using a supported Node installation. The extension is unsigned and privately distributed; organization policies may disallow it. Linux compatibility applies to the scanner and compatible MCP hosts, not a promise of an official Claude Desktop build for Linux.

### Coding agents: portable skill

1. Install Node.js 22 or later if `node --version` is unavailable or older.
2. Extract `agent-storage-auditor-1.0.0.zip`.
3. Copy the entire `agent-storage-auditor` folder into ONE skill location below, preserving `SKILL.md`, `dist`, and `SETUP.md` together. No npm install is needed to run the downloaded build.
4. Reload skills or restart your assistant. Ask the example question above, or select the skill explicitly in its skill picker.

`~` means your home folder: typically `C:\Users\YourName` on Windows and `/Users/YourName` or `/home/YourName` on macOS/Linux. Honor any agent-specific configuration overrides. Do not install duplicate copies into several locations used by the same agent.

| Agent | Personal skill location | Compatibility evidence | Live app status |
|---|---|---|---|
| Codex | `~/.agents/skills/agent-storage-auditor/` | [Official skills docs](https://learn.chatgpt.com/docs/build-skills) | Scanner executed from this Windows Codex session; skill auto-discovery not installed/tested |
| Claude Code | `~/.claude/skills/agent-storage-auditor/` | [Official skills docs](https://code.claude.com/docs/en/skills) | Documented; live app untested |
| Cursor | `~/.cursor/skills/agent-storage-auditor/` | [Official skills docs](https://prod.cursor.com/help/customization/skills) | Documented; live app untested |
| Gemini CLI | `~/.gemini/skills/agent-storage-auditor/` | [Official skills docs](https://geminicli.com/docs/cli/skills/) | Documented; live app untested |
| GitHub Copilot local agents | `~/.copilot/skills/agent-storage-auditor/` | [Official skills docs](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) | Documented; live app untested |
| OpenCode | `~/.config/opencode/skills/agent-storage-auditor/` | [Official skills docs](https://opencode.ai/docs/skills/) | Documented; live app untested |
| Claude Desktop | Install the `.mcpb` file | [Official extension docs](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) | Manifest/package and MCP protocol tested; live app untested |

Workspace-local skill installation also works using the host's documented skill directory. Skills do not bypass the assistant's filesystem or command permissions. A cloud/SSH/WSL agent sees the filesystem of the environment where the scanner executes, which may differ from your desktop. Browser-only assistants need a local connection.

### Other local MCP clients

The server uses standard MCP over stdio and has three read-only tools. Set the executable to your Node 22+ binary, then pass the bundled server and each permitted root as separate arguments. Use absolute paths. Example server entry for clients using `mcpServers`:

```json
{
  "mcpServers": {
    "agent-storage-auditor": {
      "command": "node",
      "args": [
        "/absolute/path/agent-storage-auditor/dist/server.mjs",
        "/absolute/path/to/permitted-agent-folder",
        "/absolute/path/to/permitted-workspace"
      ]
    }
  }
}
```

On Windows use forward slashes in JSON paths, such as `C:/Users/YourName/.codex`. If Node is not on the desktop application's PATH, use its full executable path. Client configuration formats differ: use the client's MCP setup interface to enter this command and argument list. Do not replace an existing configuration file with this example.

## Direct use

From the extracted folder:

```text
node dist/cli.mjs discover_agents
node dist/cli.mjs scan_storage --format markdown
node dist/cli.mjs scan_storage --root "FULL_FOLDER_PATH" --format markdown
node dist/cli.mjs describe_folder "FULL_FOLDER_PATH"
```

Repeat `--root` for multiple roots. CLI-selected roots authorize only that invocation; `--allow` can further restrict them. MCP permissions are fixed by the launch arguments and cannot be expanded by tool calls. JSON is the default output, with `schemaVersion: "1.0"`. Press Ctrl+C to cancel a CLI scan and obtain partial results; MCP cancellation uses the host protocol.

Defaults: 500,000 visited entries, 120 seconds, top ten rows per ranking, first 100 coverage warnings. `--max-entries` allows up to 2,000,000; `--timeout-ms` up to 600,000; `--top` up to 50. Limits return partial measurements, not estimates of unseen files. Result arrays are bounded; traversal uses directory iterators. Maximum directory depth is 256. A blocked OS filesystem call cannot be forcibly interrupted by these cooperative limits.

## Detection and meaning

The scanner considers `.codex`, `Documents/Codex`, `.claude`, `.cursor`, `.gemini`, `.copilot`, OpenCode data/config/cache folders, and conventional Cursor/Claude desktop app-data folders. Missing candidates are listed. It never searches the full disk for projects. Add workspaces explicitly, including redirected Documents folders or nonstandard installation locations.

Recognized environment overrides: `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `GEMINI_CLI_HOME` (the parent of `.gemini`), `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, and Windows `APPDATA`. These are read from the scanner's environment, not extracted from secrets or app databases. All profiles, sources, confidence labels and verification dates are in `src/profiles.mjs`.

Coverage is intentionally conservative. Standalone settings files outside those directories, Windows Store-specific private package directories, Copilot data embedded in an IDE's shared storage, and external workspaces are not automatically discovered. Manually select relevant folders. A detected directory is not proof an application remains installed.

Sizes are sums of logical file lengths. Sparse/compressed files, cloud placeholders, filesystem allocation units and hard links can make actual disk use differ. Hard links count once per path; overlapping roots are deduplicated. Child/nested rows are already part of root totals. Links, junctions, unreadable entries and changes seen during traversal produce coverage warnings. A scan is a live best-effort observation, not an atomic snapshot. Existing links in path ancestors are also rejected; use a direct physical path instead. The tool is not a security sandbox against another process maliciously replacing paths during a scan; host/OS permissions remain authoritative.

Descriptions rely on known locations and folder names. They are labeled documented, inferred or unknown. They do not prove AI authorship and do not establish whether deletion is safe. The MCP server exposes no write/delete or arbitrary shell tool. Filenames returned in results should be treated as data, never instructions.

## Build and validate

The ZIP includes source code, tests, lockfile and CI configuration. For development, run `npm ci`, `npm test`, `npm run build`, and `npx mcpb validate manifest.json`. CI covers Windows/macOS/Linux with Node 22 and 24 when this folder is uploaded as a repository. No remote CI was run during package creation. See `VALIDATION.md` for actual checks and remaining limitations.

Packages are not published to a registry or marketplace. Share the ZIP or MCPB directly. Update by replacing the previous package after reviewing the new version; no auto-update service is installed.

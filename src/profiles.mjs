import os from 'node:os';
import path from 'node:path';

export const verifiedOn = '2026-10-12';
export function candidates({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const join = (...parts) => p.join(...parts);
  const app = platform === 'win32' ? (env.APPDATA || join(home, 'AppData', 'Roaming'))
    : platform === 'darwin' ? join(home, 'Library', 'Application Support') : (env.XDG_CONFIG_HOME || join(home, '.config'));
  const rows = [];
  const add = (agent, location, purpose, source, confidence = 'documented') => rows.push({ agent, path: p.resolve(location), purpose, source, confidence, verifiedOn });
  add('Codex', env.CODEX_HOME || join(home, '.codex'), 'Codex settings, sessions, skills and application-managed files', 'https://developers.openai.com/codex/config-basic/');
  add('Codex', join(home, 'Documents', 'Codex'), 'Possible Codex workspaces and generated deliverables', 'https://developers.openai.com/codex/app/', 'inferred');
  add('Claude Code', env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'Claude Code settings, sessions, skills and supporting data', 'https://code.claude.com/docs/en/settings');
  add('Cursor', join(home, '.cursor'), 'Cursor agent configuration, extensions and project-related data', 'https://cursor.com/docs/agent/overview');
  add('Cursor', join(app, 'Cursor'), 'Possible Cursor desktop application data and caches', 'https://cursor.com/docs/agent/overview', 'inferred');
  add('Gemini CLI', join(env.GEMINI_CLI_HOME || home, '.gemini'), 'Gemini CLI settings, temporary session files and skills', 'https://geminicli.com/docs/reference/configuration/');
  add('GitHub Copilot', join(home, '.copilot'), 'Copilot CLI configuration and session artifacts', 'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference');
  add('OpenCode', join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'opencode'), 'OpenCode session and application data', 'https://opencode.ai/docs/troubleshooting/');
  add('OpenCode', env.OPENCODE_CONFIG_DIR || join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode'), 'OpenCode settings and plugins', 'https://opencode.ai/docs/config/');
  add('OpenCode', join(env.XDG_CACHE_HOME || join(home, '.cache'), 'opencode'), 'OpenCode cache', 'https://opencode.ai/docs/troubleshooting/');
  add('Claude Desktop', join(app, 'Claude'), 'Possible Claude Desktop application files and extension data', 'https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop', 'inferred');
  return rows;
}

export function describe(location, profiles = []) {
  const name = path.basename(location).toLowerCase();
  const match = profiles.filter(r => location === r.path || location.startsWith(r.path + path.sep)).sort((a,b) => b.path.length-a.path.length)[0];
  const rules = [
    [/^(node_modules|\.venv|venv|.*_venv|vendor|audit-libs)$/, 'dependencies', 'Libraries or execution environment used by projects'],
    [/^(cache|caches|\.cache|\.pytest_cache|tmp|\.tmp|temp|code cache|gpucache)$/, 'caches', 'Temporary or cached application data; deletion safety is not assessed'],
    [/^(sessions|archived_sessions|session-state|logs?|history|dictation-history)$/, 'history', 'Session records, history or application logs'],
    [/^(outputs?|generated_images|visualizations|reports|artifacts)$/, 'generated outputs', 'Likely deliverables or generated assets; AI authorship is unverified'],
    [/^(\.chatgpt-projects|worktrees|workspaces|projects)$/, 'workspaces', 'Project-related storage; may include metadata, source files and dependencies'],
    [/^(skills|plugins|settings|config|\.metadata)$/, 'settings', 'Configuration, extensions, skills or supporting metadata']
  ];
  const rule = rules.find(([regex]) => regex.test(name));
  return { path: location, agent: match?.agent || 'Unattributed', category: rule?.[1] || 'unknown',
    purpose: rule?.[2] || (match?.path === location ? match.purpose : 'Purpose unknown; inspect filenames or ask the owner for context'),
    confidence: rule ? 'inferred' : match?.path === location ? match.confidence : 'unknown',
    evidence: rule ? `Folder name: ${name}` : match?.path === location ? match.source : 'No content inspected', aiAuthorship: 'unverified' };
}

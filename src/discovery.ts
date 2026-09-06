import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

export interface DiscoveredConfig {
  path: string;
  label: string;
}

/**
 * Auto-discovers common MCP config locations based on OS and current working directory.
 * Returns only configs that exist on disk.
 */
export function discoverConfigFiles(cwd: string = process.cwd()): DiscoveredConfig[] {
  const osPlatform = platform();
  const home = homedir();
  const candidates: { path: string; label: string }[] = [];

  // 1. Current working directory configs (highest precedence for local projects)
  candidates.push(
    { path: resolve(cwd, '.mcp.json'), label: 'Project (.mcp.json)' },
    { path: resolve(cwd, 'mcp.json'), label: 'Project (mcp.json)' },
    { path: resolve(cwd, '.vscode/mcp.json'), label: 'VS Code workspace (.vscode/mcp.json)' },
    { path: resolve(cwd, '.cursor/mcp.json'), label: 'Cursor workspace (.cursor/mcp.json)' },
  );

  // 2. Claude Desktop config path per OS
  if (osPlatform === 'darwin') {
    candidates.push({
      path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      label: 'Claude Desktop (macOS)',
    });
  } else if (osPlatform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    candidates.push({
      path: join(appData, 'Claude', 'claude_desktop_config.json'),
      label: 'Claude Desktop (Windows)',
    });
  } else {
    // Linux and other POSIX
    const configDir = process.env.XDG_CONFIG_HOME ?? join(home, '.config');
    candidates.push({
      path: join(configDir, 'Claude', 'claude_desktop_config.json'),
      label: 'Claude Desktop (Linux)',
    });
  }

  // 3. User-level VS Code & Cursor settings
  if (osPlatform === 'darwin') {
    candidates.push(
      {
        path: join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
        label: 'VS Code User Settings (macOS)',
      },
      {
        path: join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'),
        label: 'Cursor User Settings (macOS)',
      },
    );
  } else if (osPlatform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    candidates.push(
      {
        path: join(appData, 'Code', 'User', 'settings.json'),
        label: 'VS Code User Settings (Windows)',
      },
      {
        path: join(appData, 'Cursor', 'User', 'settings.json'),
        label: 'Cursor User Settings (Windows)',
      },
    );
  } else {
    const configDir = process.env.XDG_CONFIG_HOME ?? join(home, '.config');
    candidates.push(
      {
        path: join(configDir, 'Code', 'User', 'settings.json'),
        label: 'VS Code User Settings (Linux)',
      },
      {
        path: join(configDir, 'Cursor', 'User', 'settings.json'),
        label: 'Cursor User Settings (Linux)',
      },
    );
  }

  // Filter to paths that actually exist
  const existing: DiscoveredConfig[] = [];
  const seenPaths = new Set<string>();

  for (const candidate of candidates) {
    if (existsSync(candidate.path) && !seenPaths.has(candidate.path)) {
      seenPaths.add(candidate.path);
      existing.push(candidate);
    }
  }

  return existing;
}

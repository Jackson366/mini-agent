import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase } from './db.js';
import { createAppServer } from './server.js';
import { startSchedulerLoop } from './task-scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });
if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  const parentEnv = path.resolve(ROOT, '..', '.env');
  if (fs.existsSync(parentEnv)) {
    dotenv.config({ path: parentEnv });
  }
}

const PORT = parseInt(process.env.PORT || '3210', 10);
const WORKSPACE_BASE = path.resolve(ROOT, 'workspace');
const GLOBAL_DIR = WORKSPACE_BASE;
const DATA_DIR = path.resolve(ROOT, 'data');
const SKILLS_SRC = path.resolve(ROOT, 'skills');
const MCP_SERVER_PATH_JS = path.resolve(__dirname, 'mcp-server.js');
const MCP_SERVER_PATH_TS = path.resolve(__dirname, 'mcp-server.ts');
const MCP_SERVER_PATH = fs.existsSync(MCP_SERVER_PATH_JS) ? MCP_SERVER_PATH_JS : MCP_SERVER_PATH_TS;

const SKILL_SYNC_EXCLUDED_DIRS = new Set(['conversation', 'conversations']);
const SKILL_SYNC_AGENT_WHITELIST = new Set(
  (process.env.SKILL_SYNC_AGENT_WHITELIST ?? 'main')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
);

function syncSkills(agentDir: string): void {
  if (!fs.existsSync(SKILLS_SRC)) return;
  const claudeDir = path.join(agentDir, '.claude');
  const skillsDst = path.join(claudeDir, 'skills');

  const settingsFile = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        env: {
          CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
        },
      }, null, 2) + '\n',
    );
  }

  for (const entry of fs.readdirSync(SKILLS_SRC, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcDir = path.join(SKILLS_SRC, entry.name);
    const dstDir = path.join(skillsDst, entry.name);
    fs.cpSync(srcDir, dstDir, { recursive: true });
  }
}

initDatabase(DATA_DIR);

const subDirs = fs.readdirSync(WORKSPACE_BASE, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.'))
  .map(e => e.name);

for (const dir of subDirs) {
  if (
    !SKILL_SYNC_EXCLUDED_DIRS.has(dir) &&
    SKILL_SYNC_AGENT_WHITELIST.has(dir)
  ) {
    syncSkills(path.join(WORKSPACE_BASE, dir));
  }
}
if (SKILL_SYNC_AGENT_WHITELIST.has('main')) {
  syncSkills(WORKSPACE_BASE);
}

process.env.HOME = process.env.HOME || '/tmp';

const { start, broadcast } = createAppServer({
  port: PORT,
  workspaceBaseDir: WORKSPACE_BASE,
  globalDir: GLOBAL_DIR,
  mcpServerPath: MCP_SERVER_PATH,
  dataDir: DATA_DIR,
});

startSchedulerLoop({
  workspaceBaseDir: WORKSPACE_BASE,
  globalDir: GLOBAL_DIR,
  dataDir: DATA_DIR,
  mcpServerPath: MCP_SERVER_PATH,
  onTaskMessage: (agentId, text, taskId) => {
    broadcast({ type: 'task_message', text, taskId, agentId });
  },
});

start();

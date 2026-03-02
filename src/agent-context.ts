import fs from 'fs';
import path from 'path';

export const MAIN_AGENT_ID = 'main';

export interface ResolvedAgentContext {
  agentId: string;
  isMainAgent: boolean;
  mainDir: string;
  agentDir: string;
}

export function normalizeAgentId(value?: string): string {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : MAIN_AGENT_ID;
}

export function resolveAgentId(input?: { agentId?: string; workspace?: string }): string {
  return normalizeAgentId(input?.agentId ?? input?.workspace);
}

export function resolveAgentContext(workspaceBaseDir: string, rawAgentId?: string): ResolvedAgentContext {
  const mainDir = path.resolve(workspaceBaseDir);
  const agentId = normalizeAgentId(rawAgentId);
  const isMainAgent = agentId === MAIN_AGENT_ID;
  const agentDir = isMainAgent ? mainDir : path.resolve(mainDir, agentId);
  return { agentId, isMainAgent, mainDir, agentDir };
}

export function listAgentIds(workspaceBaseDir: string): string[] {
  const ids = new Set<string>([MAIN_AGENT_ID]);
  if (!fs.existsSync(workspaceBaseDir)) {
    return [MAIN_AGENT_ID];
  }

  const entries = fs.readdirSync(workspaceBaseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'conversations') continue;
    ids.add(entry.name);
  }
  return Array.from(ids);
}

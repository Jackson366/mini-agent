import { apiJson, apiFetch } from './api';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3210' : '';

export interface FilePreviewData {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
  truncated: boolean;
}

export interface CheckpointRecord {
  id: string;
  agent_id: string;
  session_id: string;
  checkpoint_id: string;
  turn_index: number;
  description: string;
  created_at: string;
}

export async function fetchFilePreview(agentId: string, filePath: string): Promise<FilePreviewData> {
  const params = new URLSearchParams({ agentId, path: filePath });
  return apiJson<FilePreviewData>(`${API_BASE}/api/files/preview?${params}`);
}

export async function fetchCheckpoints(agentId: string): Promise<CheckpointRecord[]> {
  const data = await apiJson<{ checkpoints: CheckpointRecord[] }>(`${API_BASE}/api/checkpoints?agentId=${agentId}`);
  return data.checkpoints || [];
}

export async function rewindToCheckpoint(agentId: string, checkpointRecordId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/checkpoints/rewind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, checkpointRecordId }),
  });
}

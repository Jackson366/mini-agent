import { apiJson } from './api';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3210' : '';

export interface FilePreviewData {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
  truncated: boolean;
}

export async function fetchFilePreview(agentId: string, filePath: string): Promise<FilePreviewData> {
  const params = new URLSearchParams({ agentId, path: filePath });
  return apiJson<FilePreviewData>(`${API_BASE}/api/files/preview?${params}`);
}

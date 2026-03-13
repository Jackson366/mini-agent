import path from 'path';
import fs from 'fs';

export const FILE_EXT_RE = /\.(md|txt|ts|tsx|js|jsx|json|yaml|yml|css|html|py|sh|sql|xml|csv|toml|ini|env)$/;

export const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.json': 'json', '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml',
  '.css': 'css', '.html': 'html', '.py': 'python', '.sh': 'bash',
  '.sql': 'sql', '.xml': 'xml', '.txt': 'plaintext', '.csv': 'csv',
  '.env': 'plaintext', '.toml': 'toml', '.ini': 'ini',
};

export const MAX_PREVIEW_BYTES = 512 * 1024; // 512 KB

export function extractRelatedFiles(
  text: string,
  agentDir: string,
): Array<{ path: string; name: string; language?: string }> {
  const seen = new Set<string>();
  const results: Array<{ path: string; name: string; language?: string }> = [];
  const pathPattern = /(?:^|\s|`|\(|"|')([./]?[\w\-./]+\.\w{1,5})(?:\s|`|\)|"|'|$|,|:)/gm;
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(text)) !== null) {
    const raw = match[1];
    if (!FILE_EXT_RE.test(raw)) continue;
    const resolved = path.resolve(agentDir, raw);
    if (!resolved.startsWith(path.resolve(agentDir))) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
    const rel = path.relative(agentDir, resolved);
    if (seen.has(rel)) continue;
    seen.add(rel);
    const ext = path.extname(resolved).toLowerCase();
    results.push({ path: rel, name: path.basename(resolved), language: LANGUAGE_MAP[ext] });
  }
  return results;
}

export function walkDirectory(
  baseDir: string,
  dir: string,
  results: Array<{ path: string; name: string; language?: string }>,
  depth: number,
): void {
  if (depth > 4) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walkDirectory(baseDir, full, results, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (LANGUAGE_MAP[ext]) {
          results.push({
            path: path.relative(baseDir, full),
            name: entry.name,
            language: LANGUAGE_MAP[ext],
          });
        }
      }
    }
  } catch { /* permission errors */ }
}

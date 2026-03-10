# Mini-Agent File Diff 机制 — 上游集成文档

> 本文档面向需要对接 mini-agent 文件变更实时推送与 Diff 查看功能的上游服务。
> 阅读本文档后，你应能完成：SSE 订阅、Diff 事件消费、文件内容获取等全部集成工作。

---

## 1. 系统概述

Mini-Agent 在 AI Agent 执行 `Edit`/`Write` 工具修改文件后，会**实时**通过 SSE 推送结构化的 Diff 数据给前端。上游服务只需：

1. 建立 SSE 连接监听事件流
2. 消费 `file_diff` 类型事件获取 Diff 数据
3. 按需调用 HTTP API 获取文件完整内容，合并渲染 Diff 视图

**核心特征**：
- Diff 数据由 Claude Agent SDK 原生产生（`structuredPatch`），不依赖第三方 diff 库
- 实时推送（SSE），非轮询

---

## 2. 数据类型定义

### 2.1 `FileDiffHunk` — 单个 Diff 片段

```typescript
interface FileDiffHunk {
  oldStart: number;    // 旧文件中的起始行号
  oldLines: number;    // 旧文件中涉及的行数
  newStart: number;    // 新文件中的起始行号
  newLines: number;    // 新文件中涉及的行数
  lines: string[];     // 统一 diff 格式的行内容
                       //   "+xxx" — 新增行
                       //   "-xxx" — 删除行
                       //   " xxx" — 上下文行（空格前缀）
}
```

### 2.2 `FileDiffInfo` — 一次文件变更的完整 Diff

```typescript
interface FileDiffInfo {
  filePath: string;                          // 文件完整路径（相对于 agent workspace）
  fileName: string;                          // 文件名（如 "index.ts"）
  language?: string;                         // 语言标识（"typescript" | "javascript" | "python" | ...）
  diffType: 'create' | 'update' | 'edit';   // 操作类型
  additions: number;                         // 新增总行数
  deletions: number;                         // 删除总行数
  hunks: FileDiffHunk[];                     // diff hunk 列表
  timestamp: string;                         // ISO 8601 时间戳
}
```

**`diffType` 含义**：

| 值 | 触发工具 | 说明 |
|----|---------|------|
| `create` | Write | Agent 创建了一个新文件 |
| `update` | Write | Agent 覆写了一个已存在的文件 |
| `edit` | Edit | Agent 对已有文件进行了局部编辑 |

### 2.3 `FilePreviewResponse` — 文件内容预览

```typescript
interface FilePreviewResponse {
  path: string;       // 相对路径
  name: string;       // 文件名
  content: string;    // 文件文本内容
  language: string;   // 语言标识
  size: number;       // 文件字节大小
  truncated: boolean; // 是否被截断（超过 512KB 时为 true）
}
```

---

## 3. SSE 事件协议

### 3.1 建立连接

```
GET /api/chat/stream
```

- Content-Type: `text/event-stream`
- 连接后立即收到一条初始状态消息：`{ "type": "status", "status": "idle" | "thinking" }`
- 建议断连后 3 秒自动重连

### 3.2 SSE 消息格式

每条消息以 `data: <JSON>\n\n` 格式发送，JSON 结构为 `SseMessageOut`：

```typescript
interface SseMessageOut {
  type: 'assistant' | 'assistant_delta' | 'assistant_end'
      | 'status' | 'error' | 'task_message' | 'session'
      | 'clarification_request' | 'related_files' | 'file_diff';
  agentId?: string;     // 产生此事件的 agent ID
  // ... 各类型特有字段见下表
}
```

### 3.3 与 Diff 相关的事件类型

| type | 说明 | 关键字段 | 触发时机 |
|------|------|---------|---------|
| `file_diff` | **文件变更 Diff** | `diff: FileDiffInfo` | Agent 执行 Edit/Write 工具完成后**立即**推送 |
| `assistant_delta` | 流式文本片段 | `text: string` | Agent 流式输出过程中持续推送 |
| `assistant_end` | 流式输出结束标记 | 无 | 一轮 Agent 回复的流式输出结束 |
| `assistant` | 完整回复文本 | `text: string` | 非流式模式下的完整回复 |
| `related_files` | Agent 回复中引用的文件 | `files: RelatedFile[]` | Agent 回复完成后 |
| `status` | 状态变更 | `status: 'idle' \| 'thinking'` | Agent 开始/结束工作时 |

### 3.4 `file_diff` 事件示例

```json
{
  "type": "file_diff",
  "agentId": "main",
  "diff": {
    "filePath": "src/utils/format.ts",
    "fileName": "format.ts",
    "language": "typescript",
    "diffType": "edit",
    "additions": 3,
    "deletions": 1,
    "hunks": [
      {
        "oldStart": 10,
        "oldLines": 5,
        "newStart": 10,
        "newLines": 7,
        "lines": [
          " import { Config } from './config';",
          " ",
          "-export function format(input: string) {",
          "+export function format(input: string, options?: FormatOptions) {",
          "+  const { indent = 2, trimEnd = true } = options ?? {};",
          "+  ",
          "   return input",
          "     .split('\\n')"
        ]
      }
    ],
    "timestamp": "2026-03-10T08:30:45.123Z"
  }
}
```

---

## 4. HTTP API 接口

### 4.1 发送消息（触发 Agent 执行）

```
POST /api/chat
Content-Type: application/json

{
  "text": "请修改 src/index.ts 中的 main 函数",
  "agentId": "main"           // 可选，默认 "main"
}
```

**响应**：
```json
{ "ok": true }
```

> 发送此请求后，Agent 开始工作。文件变更会通过 SSE `file_diff` 事件实时推送，**不在此 HTTP 响应中返回**。

### 4.2 获取文件内容（用于 Diff 渲染）

```
GET /api/files/preview?agentId=main&path=src/utils/format.ts
```

**响应**：
```json
{
  "path": "src/utils/format.ts",
  "name": "format.ts",
  "content": "import { Config } from './config';\n\nexport function format...",
  "language": "typescript",
  "size": 1234,
  "truncated": false
}
```

**注意**：
- `path` 参数是相对于 agent workspace 的相对路径
- 文件超过 512KB 时 `content` 被截断，`truncated` 为 `true`
- 存在路径穿越防护，不允许访问 workspace 外的文件

### 4.3 获取文件列表

```
GET /api/files/list?agentId=main
```

**响应**：
```json
{
  "files": [
    { "path": "src/index.ts", "name": "index.ts", "language": "typescript" },
    { "path": "src/utils/format.ts", "name": "format.ts", "language": "typescript" }
  ]
}
```

### 4.4 其他控制接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /api/chat/new` | POST | 重置会话（`{ agentId }`） |
| `POST /api/chat/stop` | POST | 停止当前 Agent 执行（`{ agentId }`） |
| `POST /api/chat/answer` | POST | 回答 Agent 的澄清提问（`{ agentId, toolUseId, answers }`） |

---

## 5. 集成时序图

### 5.1 标准 Diff 推送流程

```
上游前端                        Mini-Agent Server                   Claude Agent SDK
   │                                  │                                    │
   │──── GET /api/chat/stream ───────►│                                    │
   │◄─── SSE connected ──────────────│                                    │
   │◄─── {type:"status",status:"idle"}│                                    │
   │                                  │                                    │
   │──── POST /api/chat ─────────────►│                                    │
   │◄─── {ok: true} ─────────────────│                                    │
   │                                  │──── query(prompt, options) ────────►│
   │◄─── {type:"status","thinking"} ──│                                    │
   │                                  │                                    │
   │                                  │     Agent 决定修改文件               │
   │                                  │     执行 Edit/Write 工具            │
   │                                  │◄─── PostToolUse hook 触发 ─────────│
   │                                  │     hook 提取 structuredPatch       │
   │                                  │     组装 FileDiffInfo               │
   │◄─── {type:"file_diff", diff} ───│                                    │
   │                                  │                                    │
   │     （可能有多次文件修改，每次都推送 file_diff）                          │
   │                                  │                                    │
   │◄─── {type:"assistant_delta"} ────│◄─── stream_event (text_delta) ────│
   │◄─── {type:"assistant_delta"} ────│◄─── stream_event (text_delta) ────│
   │◄─── {type:"assistant_end"} ──────│◄─── stream_event (content_stop) ──│
   │◄─── {type:"related_files"} ──────│                                    │
   │◄─── {type:"status","idle"} ──────│                                    │
   │                                  │                                    │
```

### 5.2 获取文件完整内容以渲染 Diff 面板

```
上游前端                        Mini-Agent Server
   │                                  │
   │  （用户点击某个 file_diff 展开查看）   │
   │                                  │
   │── GET /api/files/preview ───────►│
   │   ?agentId=main                  │
   │   &path=src/utils/format.ts      │  读取文件内容（≤512KB）
   │◄── FilePreviewResponse ─────────│
   │                                  │
   │  前端将 FilePreviewResponse.content │
   │  与 FileDiffInfo.hunks 合并渲染      │
```

---

## 6. 前端 Diff 渲染参考算法

收到 `file_diff` 事件后，如果需要在全文中渲染 Diff，可参考以下算法：

```typescript
type LineStatus = 'added' | 'deleted' | 'unchanged';

interface LineInfo {
  number: number | null;  // 当前文件中的行号，deleted 行为 null
  content: string;        // 行文本内容
  status: LineStatus;
}

function buildFileLinesWithDiff(fileContent: string, diff: FileDiffInfo): LineInfo[] {
  const fileLines = fileContent.split('\n');
  const result: LineInfo[] = [];
  let currentLine = 0;  // 基于 0 的索引，追踪当前处理到文件的第几行

  // 按 newStart 排序 hunks
  const sortedHunks = [...diff.hunks].sort((a, b) => a.newStart - b.newStart);

  for (const hunk of sortedHunks) {
    const hunkStartIndex = hunk.newStart - 1;  // 转为 0-based

    // 1. 输出 hunk 之前的未变更行
    while (currentLine < hunkStartIndex && currentLine < fileLines.length) {
      result.push({
        number: currentLine + 1,
        content: fileLines[currentLine],
        status: 'unchanged',
      });
      currentLine++;
    }

    // 2. 处理 hunk 内的每一行
    for (const line of hunk.lines) {
      const prefix = line[0];        // '+', '-', 或 ' '
      const text = line.slice(1);    // 去掉前缀的实际内容

      if (prefix === '+') {
        // 新增行：取当前文件内容中的行
        result.push({
          number: currentLine + 1,
          content: fileLines[currentLine] ?? text,
          status: 'added',
        });
        currentLine++;
      } else if (prefix === '-') {
        // 删除行：幽灵行，不推进 currentLine
        result.push({
          number: null,
          content: text,
          status: 'deleted',
        });
      } else {
        // 上下文行
        result.push({
          number: currentLine + 1,
          content: fileLines[currentLine] ?? text,
          status: 'unchanged',
        });
        currentLine++;
      }
    }
  }

  // 3. 输出剩余的未变更行
  while (currentLine < fileLines.length) {
    result.push({
      number: currentLine + 1,
      content: fileLines[currentLine],
      status: 'unchanged',
    });
    currentLine++;
  }

  return result;
}
```

**渲染建议**：
- `added` 行：绿色背景（如 `#e6ffec`）
- `deleted` 行：红色背景（如 `#ffebe9`）+ 删除线，行号列显示 `~`
- `unchanged` 行：默认背景
- 初始渲染时自动滚动到第一个非 `unchanged` 行

---

## 7. 消费端关键实现要点

### 7.1 Diff 缓冲策略

在 Agent 流式输出期间，`file_diff` 和 `assistant_delta` 事件是**交错到达**的。建议：

```
收到 file_diff 时：
  ├── 如果 Agent 仍在流式输出中（尚未收到 assistant_end）：
  │     暂存到 pendingDiffs 缓冲区
  │
  └── 如果 Agent 已完成本轮输出：
        直接附加到当前 assistant 消息

收到 assistant_end 时：
  将 pendingDiffs 缓冲区中的 diff 全部附加到刚完成的 assistant 消息
  清空缓冲区
```

这样做是为了避免渲染抖动——先等 assistant 消息构建完成，再一次性绑定所有 diff。

### 7.2 多文件修改

Agent 在一轮回复中可能修改多个文件。每次修改都会触发一个独立的 `file_diff` 事件。一条 assistant 消息可能关联 **0 到 N 个** `FileDiffInfo`。

### 7.3 事件顺序保证

在一轮 Agent 回复中，事件的典型顺序为：

```
status(thinking)
 → assistant_delta × N      （流式文本）
 → file_diff × M            （穿插在 delta 之间或之后）
 → assistant_end            （流式结束）
 → related_files            （引用文件列表）
 → status(idle)
```

注意：`file_diff` 可能出现在 `assistant_delta` 之间（Agent 边输出边执行工具时），也可能集中在流结束前。

### 7.4 agentId 过滤

SSE 连接是全局的，所有 agent 的事件都在同一个流中推送。消费端应根据 `agentId` 字段过滤只展示当前关注的 agent 的事件。

---

## 8. 快速集成 Checklist

- [ ] 建立 `EventSource` 连接到 `GET /api/chat/stream`，处理断连重连
- [ ] 解析 SSE `data:` 行为 JSON，按 `type` 字段分发处理
- [ ] 监听 `file_diff` 事件，提取 `diff: FileDiffInfo` 数据
- [ ] 实现 Diff 缓冲策略（流式期间暂存，`assistant_end` 后绑定）
- [ ] 按需调用 `GET /api/files/preview` 获取文件完整内容
- [ ] 实现 `buildFileLinesWithDiff` 合并渲染算法（或等效逻辑）
- [ ] 根据 `agentId` 过滤事件

---

## 9. 支持的语言标识映射

文件扩展名到 `language` 字段的映射：

| 扩展名 | language |
|--------|----------|
| `.ts` `.tsx` | `typescript` |
| `.js` `.jsx` | `javascript` |
| `.json` | `json` |
| `.md` | `markdown` |
| `.yaml` `.yml` | `yaml` |
| `.css` | `css` |
| `.html` | `html` |
| `.py` | `python` |
| `.sh` | `bash` |
| `.sql` | `sql` |
| `.xml` | `xml` |
| `.txt` `.env` | `plaintext` |
| `.toml` | `toml` |
| `.ini` | `ini` |
| `.csv` | `csv` |

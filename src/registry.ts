import fs from "fs";
import path from "path";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentRegistrySource,
  AgentRouteMatch,
  AgentRoutingRequest,
  ExpertMetadata,
  RegistryAgentInput,
} from "./types.js";

const DEFAULT_MODEL = "sonnet";
const DEFAULT_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit"];
const DEFAULT_REGISTRY_RELATIVE_PATH = path.join(
  "chongqing-product-design",
  "agents-registry.yaml",
);

function buildActivationPrompt(agentFilePath: string): string {
  return `You must fully embody this agent's persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command .
      
      <agent-activation CRITICAL="TRUE">
      1. LOAD the FULL agent file from ${agentFilePath}
      2. READ its entire contents - this contains the complete agent persona, menu, and instructions
      3. Execute ALL activation steps exactly as written in the agent file
      4. Follow the agent's persona and menu system precisely
      5. Stay in character throughout the session
      </agent-activation>`;
}

type BuiltinAgentSpec = {
  id: string;
  description: string;
  promptPath: string;
  capabilities: string[];
  keywords: string[];
  priority: number;
  expert?: boolean;
};

const BUILTIN_AGENT_SPECS: BuiltinAgentSpec[] = [
  {
    id: "seller-expert",
    description: "卖家域PRD专家，负责卖家域相关业务的PRD文档编写。",
    promptPath: "@chongqing-product-design/agents/seller-expert.md",
    capabilities: ["seller", "merchant"],
    keywords: ["卖家", "商家", "店铺", "商品", "入驻", "经营"],
    priority: 90,
    expert: true,
  },
  {
    id: "ux-designer",
    description: "交互与信息架构设计专家，负责交互与信息架构的PRD文档编写。",
    promptPath: "@chongqing-product-design/agents/ux-designer.md",
    capabilities: ["ux", "interaction", "ia"],
    keywords: ["交互", "流程", "信息架构", "可用性", "动线"],
    priority: 40,
    expert: true,
  },
  {
    id: "requirements-analyst",
    description:
      "需求分析师，负责与用户沟通澄清需求、分析需求边界，输出结构化的需求分析报告。",
    promptPath: "@chongqing-product-design/agents/requirements-analyst.md",
    capabilities: ["requirement", "analysis", "governance"],
    keywords: ["需求", "分析", "优先级", "边界", "验收", "分歧"],
    priority: 100,
    expert: true,
  },
  {
    id: "buyer-expert",
    description: "买家域PRD专家，负责买家域相关业务的PRD文档编写。",
    promptPath: "@chongqing-product-design/agents/buyer-expert.md",
    capabilities: ["buyer", "consumer"],
    keywords: ["买家", "下单", "支付", "询价", "售后", "用户"],
    priority: 90,
    expert: true,
  },
  {
    id: "ui-designer",
    description: "UI设计专家，负责UI界面的PRD文档编写。",
    promptPath: "@chongqing-product-design/agents/ui-designer.md",
    capabilities: ["ui", "visual-design"],
    keywords: ["界面", "视觉", "组件", "设计规范", "样式"],
    priority: 35,
    expert: true,
  },
  {
    id: "platform-operation-expert",
    description: "平台运营域PRD专家，负责平台运营相关业务的PRD文档编写。",
    promptPath: "@chongqing-product-design/agents/platform-operation-expert.md",
    capabilities: ["platform-ops", "operation"],
    keywords: ["运营", "管理后台", "审核", "配置", "策略", "平台"],
    priority: 90,
    expert: true,
  },
  {
    id: "service-provider-expert",
    description: "服务商域PRD专家，负责服务商相关业务的PRD文档编写。",
    promptPath: "@chongqing-product-design/agents/service-provider-expert.md",
    capabilities: ["service-provider", "provider"],
    keywords: ["服务商", "服务产品", "服务咨询", "SLA", "服务订单"],
    priority: 90,
    expert: true,
  },
];

type RegistryFile = {
  version?: string;
  default_model?: string;
  agents?: RegistryAgentInput[];
};

function resolveRegistryPath(workspaceDir: string, registryPath?: string): string {
  if (registryPath) {
    return path.isAbsolute(registryPath)
      ? registryPath
      : path.resolve(workspaceDir, registryPath);
  }
  return path.resolve(workspaceDir, DEFAULT_REGISTRY_RELATIVE_PATH);
}

function parseRegistryFile(content: string): RegistryFile | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    // We intentionally store JSON-compatible YAML for deterministic parsing.
    const parsed = JSON.parse(trimmed) as RegistryFile;
    return parsed;
  } catch {
    return null;
  }
}

function stringifyRegistryFile(data: RegistryFile): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function uniqLower(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function scoreByKeyword(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw && lower.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

function toAgentDefinition(input: RegistryAgentInput, defaultModel: string): AgentDefinition {
  return {
    description: input.description,
    prompt: buildActivationPrompt(input.prompt_path),
    tools: input.tools && input.tools.length > 0 ? input.tools : [...DEFAULT_TOOLS],
  };
}

function toMetadata(input: RegistryAgentInput): ExpertMetadata {
  return {
    id: input.id,
    description: input.description,
    capabilities: uniqLower(input.capabilities),
    keywords: uniqLower(input.keywords),
    priority: typeof input.priority === "number" ? input.priority : 50,
    enabled: input.enabled !== false,
    expert: input.expert !== false,
    promptPath: input.prompt_path,
  };
}

function toRegistryAgent(input: RegistryAgentInput): RegistryAgentInput {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    prompt_path: input.prompt_path,
    model: input.model || DEFAULT_MODEL,
    tools: input.tools && input.tools.length > 0 ? [...input.tools] : [...DEFAULT_TOOLS],
    capabilities: uniqLower(input.capabilities),
    keywords: uniqLower(input.keywords),
    priority: typeof input.priority === "number" ? input.priority : 50,
    enabled: input.enabled !== false,
    expert: input.expert !== false,
  };
}

function normalizeBuiltinAsRegistry(): RegistryAgentInput[] {
  return BUILTIN_AGENT_SPECS.map((spec) =>
    toRegistryAgent({
      id: spec.id,
      name: spec.id,
      description: spec.description,
      prompt_path: spec.promptPath,
      model: DEFAULT_MODEL,
      tools: [...DEFAULT_TOOLS],
      capabilities: spec.capabilities,
      keywords: spec.keywords,
      priority: spec.priority,
      enabled: true,
      expert: spec.expert !== false,
    }),
  );
}

export class AgentRegistry implements AgentRegistrySource {
  private readonly registryPath: string;
  private readonly defaultModel: string;
  private readonly overrides: Record<string, AgentDefinition>;
  private agents: Record<string, AgentDefinition> = {};
  private metadata: Record<string, ExpertMetadata> = {};
  private registryData: RegistryFile = {
    version: "1.0.0",
    default_model: DEFAULT_MODEL,
    agents: [],
  };

  constructor(options?: {
    workspaceDir?: string;
    registryPath?: string;
    overrides?: Record<string, AgentDefinition>;
    defaultModel?: string;
  }) {
    const workspaceDir = options?.workspaceDir
      ? path.resolve(options.workspaceDir)
      : process.cwd();
    this.registryPath = resolveRegistryPath(workspaceDir, options?.registryPath);
    this.defaultModel = options?.defaultModel || DEFAULT_MODEL;
    this.overrides = options?.overrides ?? {};
    this.reload();
  }

  reload(): void {
    const mergedAgents = new Map<string, RegistryAgentInput>();
    for (const builtin of normalizeBuiltinAsRegistry()) {
      mergedAgents.set(builtin.id, builtin);
    }

    let registryDefaultModel = this.defaultModel;
    let diskRegistry: RegistryFile | null = null;
    if (fs.existsSync(this.registryPath)) {
      const raw = fs.readFileSync(this.registryPath, "utf-8");
      const parsed = parseRegistryFile(raw);
      if (parsed) {
        diskRegistry = parsed;
        registryDefaultModel = parsed.default_model || registryDefaultModel;
        for (const item of parsed.agents ?? []) {
          if (!item?.id || !item.description || !item.prompt_path) continue;
          mergedAgents.set(item.id, toRegistryAgent(item));
        }
      }
    }

    const nextAgents: Record<string, AgentDefinition> = {};
    const nextMeta: Record<string, ExpertMetadata> = {};

    for (const [id, reg] of mergedAgents.entries()) {
      nextAgents[id] = toAgentDefinition(reg, registryDefaultModel);
      nextMeta[id] = toMetadata(reg);
    }

    this.agents = { ...nextAgents, ...this.overrides };
    this.metadata = nextMeta;
    this.registryData = diskRegistry ?? {
      version: "1.0.0",
      default_model: registryDefaultModel,
      agents: [],
    };
  }

  list(): Record<string, AgentDefinition> {
    return { ...this.agents };
  }

  listMetadata(): ExpertMetadata[] {
    return Object.values(this.metadata);
  }

  get(agentId: string): AgentDefinition | undefined {
    return this.agents[agentId];
  }

  getMetadata(agentId: string): ExpertMetadata | undefined {
    return this.metadata[agentId];
  }

  getExpertIds(): string[] {
    return Object.values(this.metadata)
      .filter((m) => m.enabled && m.expert)
      .map((m) => m.id);
  }

  routeExperts(input: AgentRoutingRequest): { matched: AgentRouteMatch[]; missingCapabilities: string[] } {
    const text = (input.text || "").trim();
    const requestedCaps = uniqLower(input.capabilities);
    const topN = typeof input.topN === "number" && input.topN > 0 ? input.topN : 6;
    const enabledExperts = Object.values(this.metadata).filter((m) => m.enabled && m.expert);

    const matches: AgentRouteMatch[] = [];
    for (const meta of enabledExperts) {
      let score = 0;
      const reasons: string[] = [];

      if (requestedCaps.length > 0) {
        const capMatched = meta.capabilities.filter((c) =>
          requestedCaps.some((req) => req.toLowerCase() === c.toLowerCase()),
        );
        if (capMatched.length > 0) {
          score += capMatched.length * 5;
          reasons.push(`capabilities:${capMatched.join(",")}`);
        }
      }

      const keywordScore = scoreByKeyword(text, meta.keywords);
      if (keywordScore > 0) {
        score += keywordScore;
        reasons.push(`keywords:${keywordScore}`);
      }

      if (score > 0) {
        matches.push({
          id: meta.id,
          score,
          reasons,
          capabilities: [...meta.capabilities],
          keywords: [...meta.keywords],
        });
      }
    }

    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const pa = this.metadata[a.id]?.priority ?? 0;
      const pb = this.metadata[b.id]?.priority ?? 0;
      if (pb !== pa) return pb - pa;
      return a.id.localeCompare(b.id);
    });

    const missingCapabilities = requestedCaps.filter(
      (cap) => !enabledExperts.some((m) => m.capabilities.some((c) => c.toLowerCase() === cap.toLowerCase())),
    );

    return {
      matched: matches.slice(0, topN),
      missingCapabilities,
    };
  }

  upsertAgent(agent: RegistryAgentInput): void {
    const normalized = toRegistryAgent(agent);
    const existing = this.registryData.agents ?? [];
    const idx = existing.findIndex((a) => a.id === normalized.id);
    if (idx >= 0) {
      existing[idx] = normalized;
    } else {
      existing.push(normalized);
    }

    this.registryData = {
      version: this.registryData.version || "1.0.0",
      default_model: this.registryData.default_model || this.defaultModel,
      agents: existing,
    };

    fs.mkdirSync(path.dirname(this.registryPath), { recursive: true });
    fs.writeFileSync(this.registryPath, stringifyRegistryFile(this.registryData), "utf-8");
    this.reload();
  }
}

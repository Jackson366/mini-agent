import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRegistrySource } from "./types.js";

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

const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  "seller-expert": {
    description: "卖家域PRD专家，负责卖家域相关业务的PRD文档编写。",
    prompt: buildActivationPrompt("@chongqing-product-design/agents/seller-expert.md"),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
  "ux-designer": {
    description: "交互与信息架构设计专家，负责交互与信息架构的PRD文档编写。",
    prompt: buildActivationPrompt("@chongqing-product-design/agents/ux-designer.md"),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
  "requirements-analyst": {
    description: "需求分析师，负责与用户沟通澄清需求、分析需求边界，输出结构化的需求分析报告。",
    prompt: buildActivationPrompt(
      "@chongqing-product-design/agents/requirements-analyst.md",
    ),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
  "buyer-expert": {
    description: "买家域PRD专家，负责买家域相关业务的PRD文档编写。",
    prompt: buildActivationPrompt("@chongqing-product-design/agents/buyer-expert.md"),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
  "ui-designer": {
    description: "UI设计专家，负责UI界面的PRD文档编写。",
    prompt: buildActivationPrompt("@chongqing-product-design/agents/ui-designer.md"),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
  "platform-operation-expert": {
    description: "平台运营域PRD专家，负责平台运营相关业务的PRD文档编写。",
    prompt: buildActivationPrompt(
      "@chongqing-product-design/agents/platform-operation-expert.md",
    ),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
  "service-provider-expert": {
    description: "服务商域PRD专家，负责服务商相关业务的PRD文档编写。",
    prompt: buildActivationPrompt(
      "@chongqing-product-design/agents/service-provider-expert.md",
    ),
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
    model: "sonnet",
  },
};

const EXPERT_IDS = [
  "seller-expert",
  "buyer-expert",
  "platform-operation-expert",
  "service-provider-expert",
  "ux-designer",
  "ui-designer",
  "requirements-analyst",
];

export class AgentRegistry implements AgentRegistrySource {
  private readonly agents: Record<string, AgentDefinition>;

  constructor(overrides?: Record<string, AgentDefinition>) {
    this.agents = { ...BUILTIN_AGENTS, ...(overrides ?? {}) };
  }

  list(): Record<string, AgentDefinition> {
    return { ...this.agents };
  }

  get(agentId: string): AgentDefinition | undefined {
    return this.agents[agentId];
  }

  getExpertIds(): string[] {
    return EXPERT_IDS.filter((id) => id in this.agents);
  }
}

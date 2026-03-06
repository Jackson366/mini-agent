import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRegistrySource } from "./types.js";

const BUILTIN_AGENTS: Record<string, AgentDefinition> = {};
const EXPERT_IDS: string[] = [];

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

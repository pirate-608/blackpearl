import type { AgentEvent } from "../agent/events.js";

export type EmitEvent = (event: AgentEvent) => void;

export type RunOptions = {
  instructions?: string;
  tools?: Array<{ type: "function"; name: string; description: string; parameters: Record<string, unknown> | null; strict: boolean }>;
  maxSteps?: number;
};

export type AgentRunner = {
  run(userInput: string, emit: EmitEvent, options?: RunOptions): Promise<string>;
};

import type { AgentEvent } from "../agent/events.js";

export type EmitEvent = (event: AgentEvent) => void;

export type AgentRunner = {
  run(userInput: string, emit: EmitEvent): Promise<string>;
};

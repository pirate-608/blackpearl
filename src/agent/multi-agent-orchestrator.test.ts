import { describe, expect, it } from "vitest";
import { MultiAgentOrchestrator } from "./multi-agent-orchestrator.js";
import { EventBus } from "./events.js";
import { AgentRuntime } from "./runtime.js";
import { AgentSession } from "./session.js";
import type { AgentRunner, RunOptions } from "../llm/types.js";
import type { ModelConnection } from "../llm/providers.js";

describe("MultiAgentOrchestrator", () => {
  it("uses the configured subagent runner for planning, execution, and summary", async () => {
    const mainRunner = new RecordingRunner("main-model");
    const subagentRunner = new RecordingRunner("subagent-model");
    const connection: ModelConnection = {
      provider: "openai",
      model: "main-model",
      apiMode: "responses",
    };
    const orchestrator = new MultiAgentOrchestrator({
      session: new AgentSession("test-session"),
      runtime: new AgentRuntime(mainRunner, connection),
      createSubagentRunner: () => subagentRunner,
      eventBus: new EventBus(),
    });

    await orchestrator.handleUserInput("finish the task");

    expect(mainRunner.inputs).toEqual([]);
    expect(subagentRunner.inputs).toHaveLength(3);
    expect(subagentRunner.options.map((option) => option?.instructions)).toEqual([
      expect.any(String),
      expect.any(String),
      undefined,
    ]);
  });
});

class RecordingRunner implements AgentRunner {
  readonly inputs: string[] = [];
  readonly options: Array<RunOptions | undefined> = [];

  constructor(private readonly model: string) {}

  async run(
    userInput: string,
    _emit: Parameters<AgentRunner["run"]>[1],
    options?: RunOptions,
  ): Promise<string> {
    this.inputs.push(userInput);
    this.options.push(options);

    if (options?.maxSteps === 1 && options.tools?.length === 0 && userInput.includes("Create")) {
      return JSON.stringify(["execute one step"]);
    }

    if (userInput.startsWith("Execute")) {
      return `executed by ${this.model}`;
    }

    return `summary by ${this.model}`;
  }
}

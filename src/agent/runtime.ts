import type { AgentRunner } from "../llm/types.js";
import type { ModelConnection } from "../llm/providers.js";

export class AgentRuntime {
  constructor(
    private runner: AgentRunner,
    private connection: ModelConnection,
  ) {}

  getRunner(): AgentRunner {
    return this.runner;
  }

  getConnection(): ModelConnection {
    return this.connection;
  }

  setRunner(runner: AgentRunner, connection: ModelConnection): void {
    this.runner = runner;
    this.connection = connection;
  }
}

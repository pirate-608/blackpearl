export class AgentError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${toolName}] ${message}`);
    this.name = "ToolExecutionError";
  }
}

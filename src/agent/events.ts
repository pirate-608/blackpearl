export type AgentEvent =
  | {
      type: "session_started";
      sessionId: string;
      model: string;
    }
  | {
      type: "user_message";
      content: string;
    }
  | {
      type: "assistant_delta";
      content: string;
    }
  | {
      type: "assistant_message";
      content: string;
    }
  | {
      type: "tool_call_started";
      toolName: string;
      callId: string;
      args: unknown;
    }
  | {
      type: "tool_call_finished";
      toolName: string;
      callId: string;
      result: unknown;
      elapsedMs: number;
    }
  | {
      type: "tool_call_failed";
      toolName: string;
      callId: string;
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

type EventHandler = (event: AgentEvent) => void;

export class EventBus {
  private readonly handlers = new Set<EventHandler>();

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: AgentEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

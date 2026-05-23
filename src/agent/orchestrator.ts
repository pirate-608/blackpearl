import type { EventBus } from "./events.js";
import type { AgentSession } from "./session.js";
import type { AgentRuntime } from "./runtime.js";
import type { TranscriptStore } from "../storage/transcript-store.js";

export type AgentOrchestratorOptions = {
  session: AgentSession;
  runtime: AgentRuntime;
  eventBus: EventBus;
  transcriptStore?: TranscriptStore;
};

export class AgentOrchestrator {
  constructor(private readonly options: AgentOrchestratorOptions) {}

  async handleUserInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    this.options.session.addUserMessage(trimmed);
    await this.options.transcriptStore?.append({
      kind: "message",
      sessionId: this.options.session.id,
      createdAt: new Date().toISOString(),
      role: "user",
      content: trimmed,
    });

    this.options.eventBus.emit({
      type: "user_message",
      content: trimmed,
    });

    try {
      const finalText = await this.options.runtime.getRunner().run(trimmed, (event) => {
        this.options.session.applyEvent(event);
        this.options.eventBus.emit(event);
        void this.options.transcriptStore?.append({
          kind: "event",
          sessionId: this.options.session.id,
          createdAt: new Date().toISOString(),
          event,
        });
      });

      this.options.session.addAssistantMessage(finalText);
      await this.options.transcriptStore?.append({
        kind: "message",
        sessionId: this.options.session.id,
        createdAt: new Date().toISOString(),
        role: "assistant",
        content: finalText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const event = {
        type: "error" as const,
        message,
      };

      this.options.session.addActivity("error", message);
      this.options.eventBus.emit(event);
      await this.options.transcriptStore?.append({
        kind: "event",
        sessionId: this.options.session.id,
        createdAt: new Date().toISOString(),
        event,
      });
    }
  }
}

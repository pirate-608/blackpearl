import type { EventBus } from "./events.js";
import type { AgentSession } from "./session.js";
import type { AgentRuntime } from "./runtime.js";
import type { RunOptions } from "../llm/types.js";
import {
  createMemoryContextPrompt,
  getShortTermMemory,
  type MemoryStore,
} from "../memory/memory-store.js";
import { AgentAbortedError } from "../shared/errors.js";
import type { SkillRegistry } from "../skills/skill-registry.js";
import type { TranscriptStore } from "../storage/transcript-store.js";

export type AgentOrchestratorOptions = {
  session: AgentSession;
  runtime: AgentRuntime;
  eventBus: EventBus;
  transcriptStore?: TranscriptStore;
  memoryStore?: MemoryStore;
  skillRegistry?: SkillRegistry;
};

export class AgentOrchestrator {
  private abortController: AbortController | null = null;

  constructor(private readonly options: AgentOrchestratorOptions) {}

  /** Abort the currently running agent execution */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async handleUserInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    const shortTerm = getShortTermMemory(this.options.session.messages);
    const longTerm = await this.options.memoryStore?.search(trimmed);
    const memoryPrompt = createMemoryContextPrompt({
      shortTerm,
      longTerm: longTerm ?? [],
    });
    const runnerInput = memoryPrompt ? `${memoryPrompt}\n\nCurrent user request:\n${trimmed}` : trimmed;

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

    // Check for skill match
    const skillOptions = this.buildSkillOptions(trimmed);

    // Set up abort controller for user interrupt
    this.abortController = new AbortController();
    const runOptions: RunOptions = {
      ...(skillOptions ?? {}),
      signal: this.abortController.signal,
    };

    try {
      const finalText = await this.options.runtime.getRunner().run(runnerInput, (event) => {
        this.options.session.applyEvent(event);
        this.options.eventBus.emit(event);
      }, runOptions);

      await this.options.transcriptStore?.append({
        kind: "message",
        sessionId: this.options.session.id,
        createdAt: new Date().toISOString(),
        role: "assistant",
        content: finalText,
      });
      await this.options.memoryStore?.rememberConversation(trimmed, finalText);
    } catch (error) {
      if (error instanceof AgentAbortedError) {
        this.options.session.addActivity("aborted", "User interrupted execution");
      } else {
        const message = error instanceof Error ? error.message : String(error);
        const event = { type: "error" as const, message };
        this.options.session.addActivity("error", message);
        this.options.eventBus.emit(event);
        await this.options.transcriptStore?.append({
          kind: "event",
          sessionId: this.options.session.id,
          createdAt: new Date().toISOString(),
          event,
        });
      }
    } finally {
      this.abortController = null;
    }
  }

  private buildSkillOptions(input: string): RunOptions | undefined {
    const skill = this.options.skillRegistry?.match(input);
    if (!skill) return undefined;

    const options: RunOptions = {
      instructions: `${skill.instructions}\n\n---\nThe user asked: ${input}`,
    };

    if (skill.allowedTools && skill.allowedTools.length > 0) {
      // Build a filtered tool list with only allowed tools
      this.options.session.addActivity(`skill: ${skill.name}`, skill.allowedTools.join(", "));
    } else {
      this.options.session.addActivity(`skill: ${skill.name}`, "activated");
    }

    return options;
  }
}

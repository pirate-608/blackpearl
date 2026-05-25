import { EXECUTOR_PROMPT, PLANNER_PROMPT } from "./prompts.js";
import type { EventBus } from "./events.js";
import type { AgentSession } from "./session.js";
import type { AgentRuntime } from "./runtime.js";
import type { AgentRunner } from "../llm/types.js";
import {
  createMemoryContextPrompt,
  getShortTermMemory,
  type MemoryStore,
} from "../memory/memory-store.js";
import type { TranscriptStore } from "../storage/transcript-store.js";

export type MultiAgentOrchestratorOptions = {
  session: AgentSession;
  runtime: AgentRuntime;
  createSubagentRunner?: () => AgentRunner;
  eventBus: EventBus;
  transcriptStore?: TranscriptStore;
  memoryStore?: MemoryStore;
};

export class MultiAgentOrchestrator {
  constructor(private readonly options: MultiAgentOrchestratorOptions) {}

  async handleUserInput(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;

    const shortTerm = getShortTermMemory(this.options.session.messages);
    const longTerm = await this.options.memoryStore?.search(trimmed);
    const memoryPrompt = createMemoryContextPrompt({
      shortTerm,
      longTerm: longTerm ?? [],
    });

    this.options.session.addUserMessage(trimmed);
    await this.options.transcriptStore?.append({
      kind: "message",
      sessionId: this.options.session.id,
      createdAt: new Date().toISOString(),
      role: "user",
      content: trimmed,
    });

    this.options.eventBus.emit({ type: "user_message", content: trimmed });
    const subagentRunner =
      this.options.createSubagentRunner?.() ?? this.options.runtime.getRunner();

    try {
      // Phase 1: Create plan
      const planInput = memoryPrompt
        ? `${memoryPrompt}\n\nCreate a step-by-step plan for this request:\n${trimmed}`
        : `Create a step-by-step plan for this request:\n${trimmed}`;

      const planText = await subagentRunner.run(planInput, (event) => {
        this.options.session.applyEvent(event);
        this.options.eventBus.emit(event);
      }, { instructions: PLANNER_PROMPT, tools: [], maxSteps: 1 });

      const steps = parsePlan(planText);

      if (steps.length === 0) {
        // Fallback: treat the whole request as one step
        steps.push(trimmed);
      }

      this.options.eventBus.emit({ type: "plan_created", steps });

      // Phase 2: Execute each step
      const stepResults: string[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        this.options.eventBus.emit({
          type: "step_started",
          stepIndex: i,
          totalSteps: steps.length,
          step,
        });

        const context = buildStepContext(steps, stepResults, i);
        const stepInput = `Execute this step${context}:\n${step}`;

        const result = await subagentRunner.run(stepInput, (event) => {
          this.options.session.applyEvent(event);
          this.options.eventBus.emit(event);
        }, { instructions: EXECUTOR_PROMPT });

        stepResults.push(result);

        this.options.eventBus.emit({
          type: "step_completed",
          stepIndex: i,
          totalSteps: steps.length,
          step,
          result,
        });
      }

      // Phase 3: Summarize
      const summaryInput = buildSummaryInput(trimmed, steps, stepResults);
      const finalText = await subagentRunner.run(summaryInput, (event) => {
        this.options.session.applyEvent(event);
        this.options.eventBus.emit(event);
      }, { tools: [], maxSteps: 1 });

      this.options.eventBus.emit({ type: "assistant_message", content: finalText });

      await this.options.transcriptStore?.append({
        kind: "message",
        sessionId: this.options.session.id,
        createdAt: new Date().toISOString(),
        role: "assistant",
        content: finalText,
      });
      await this.options.memoryStore?.rememberConversation(trimmed, finalText);
    } catch (error) {
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
  }
}

function parsePlan(text: string): string[] {
  // Try JSON array first
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        return parsed.filter((s) => s.trim().length > 0);
      }
    } catch {
      // fall through to line-based parsing
    }
  }

  // Try numbered list: "1. Step one\n2. Step two"
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d+[\.\)、]\s/.test(l))
    .map((l) => l.replace(/^\d+[\.\)、]\s*/, "").trim())
    .filter((l) => l.length > 0);

  if (lines.length > 0) return lines;

  // Last resort: return the whole text as one step
  const clean = text.trim();
  return clean ? [clean] : [];
}

function buildStepContext(
  steps: string[],
  results: string[],
  currentIndex: number,
): string {
  if (results.length === 0) return "";
  const parts: string[] = ["\n\nResults from previous steps:"];
  for (let i = 0; i < results.length; i++) {
    parts.push(`${i + 1}. ${steps[i]!}: ${results[i]!}`);
  }
  return parts.join("\n");
}

function buildSummaryInput(
  originalRequest: string,
  steps: string[],
  results: string[],
): string {
  const parts = ["Summarize the execution results for the request below.\n"];
  parts.push(`Request: ${originalRequest}\n`);
  parts.push("Step results:");
  for (let i = 0; i < steps.length; i++) {
    parts.push(`${i + 1}. ${steps[i]!}: ${results[i]!}`);
  }
  parts.push("\nProvide a concise final answer that combines all results.");
  return parts.join("\n");
}

import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp } from "ink";
import type { AgentOrchestrator } from "../../agent/orchestrator.js";
import type { MultiAgentOrchestrator } from "../../agent/multi-agent-orchestrator.js";
import type { AgentRuntime } from "../../agent/runtime.js";
import type { EventBus } from "../../agent/events.js";
import type { AgentSession } from "../../agent/session.js";
import type { AppConfig } from "../../shared/config.js";
import type { ConnectionStore } from "../../llm/connection-store.js";
import {
  defaultConnectionFor,
  getConnectionLabel,
  getProviderProfile,
  isProviderId,
  providerProfiles,
  type ModelConnection,
  type ProviderId,
} from "../../llm/providers.js";
import { createRunner } from "../../llm/runner-factory.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { ActivityPane } from "./ActivityPane.js";
import { ConversationPane } from "./ConversationPane.js";
import { InputBox } from "./InputBox.js";
import {
  findSlashCommand,
  formatSlashCommandHelp,
  slashCommands,
} from "./slash-commands.js";
import { StatusBar } from "./StatusBar.js";

type AppProps = {
  session: AgentSession;
  orchestrator: AgentOrchestrator;
  multiAgentOrchestrator: MultiAgentOrchestrator;
  runtime: AgentRuntime;
  connectionStore: ConnectionStore;
  eventBus: EventBus;
  toolRegistry: ToolRegistry;
  config: AppConfig;
};

type ConnectDraft = {
  provider?: ProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

type ConnectStep = "provider" | "apiKey" | "model" | "baseUrl";

type UiMode =
  | { type: "normal" }
  | { type: "connect"; step: ConnectStep; draft: ConnectDraft };

export function App({
  session,
  orchestrator,
  multiAgentOrchestrator,
  runtime,
  connectionStore,
  eventBus,
  toolRegistry,
  config,
}: AppProps): JSX.Element {
  const inkApp = useApp();
  const [, setRenderTick] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState("输入 /help 查看命令。");
  const [connection, setConnection] = useState(runtime.getConnection());
  const [uiMode, setUiMode] = useState<UiMode>({ type: "normal" });

  useEffect(() => {
    const unsubscribe = eventBus.subscribe(() => {
      setRenderTick((tick) => tick + 1);
    });

    return unsubscribe;
  }, [eventBus]);

  const toolNames = useMemo(
    () => toolRegistry.list().map((tool) => tool.name).join(", "),
    [toolRegistry],
  );

  async function handleSubmit(input: string): Promise<void> {
    if (uiMode.type === "connect") {
      await handleConnectInput(input);
      return;
    }

    // /plan <request> — multi-agent mode with inline request
    if (input.trim().startsWith("/plan ") || input.trim() === "/plan") {
      const request = input.trim().startsWith("/plan ") ? input.trim().slice(6).trim() : "";
      if (!request) {
        setNotice("用法：/plan <任务描述>，例如 /plan 查一下爱因斯坦的出生年份并计算年龄");
        return;
      }
      setIsRunning(true);
      setNotice("多 Agent 协作：规划中...");
      await multiAgentOrchestrator.handleUserInput(request);
      setIsRunning(false);
      setNotice("多 Agent 协作完成。");
      setRenderTick((tick) => tick + 1);
      return;
    }

    const command = findSlashCommand(input);

    if (input.trim().startsWith("/")) {
      if (!command) {
        setNotice(`未知命令：${input.trim()}。输入 / 查看可用命令。`);
        return;
      }

      if (command.id === "exit") {
        inkApp.exit();
        return;
      }

      if (command.id === "help") {
        setNotice(`命令：${formatSlashCommandHelp()}。普通文本会交给 Agent 执行。`);
        return;
      }

      if (command.id === "tools") {
        setNotice(`可用工具：${toolNames}`);
        return;
      }

      if (command.id === "connect") {
        setUiMode({ type: "connect", step: "provider", draft: {} });
        setNotice(formatProviderPrompt());
        return;
      }

      if (command.id === "model") {
        await handleModelCommand(input);
        return;
      }

      if (command.id === "clear") {
        session.messages.splice(0);
        session.activities.splice(0);
        setNotice("已清空当前界面记录。");
        setRenderTick((tick) => tick + 1);
        return;
      }
    }

    setIsRunning(true);
    setNotice("Agent 正在处理任务。");
    await orchestrator.handleUserInput(input);
    setIsRunning(false);
    setNotice("完成。");
    setRenderTick((tick) => tick + 1);
  }

  async function handleConnectInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (trimmed === "/exit") {
      setUiMode({ type: "normal" });
      setNotice("已取消连接配置。");
      return;
    }

    if (uiMode.type !== "connect") {
      return;
    }

    if (uiMode.step === "provider") {
      if (!isProviderId(trimmed)) {
        setNotice(`未知后端：${trimmed}。${formatProviderPrompt()}`);
        return;
      }

      const profile = getProviderProfile(trimmed);
      const nextDraft = {
        provider: trimmed,
      };

      if (!profile.requiresApiKey) {
        setUiMode({ type: "connect", step: "model", draft: nextDraft });
        setNotice(`选择 ${profile.label}。输入模型名，默认 ${profile.defaultModel}`);
        return;
      }

      setUiMode({ type: "connect", step: "apiKey", draft: nextDraft });
      setNotice(`选择 ${profile.label}。请输入 API key，或直接回车保留已有配置。`);
      return;
    }

    if (!uiMode.draft.provider) {
      setUiMode({ type: "connect", step: "provider", draft: {} });
      setNotice(formatProviderPrompt());
      return;
    }

    const profile = getProviderProfile(uiMode.draft.provider);

    if (uiMode.step === "apiKey") {
      const nextDraft = { ...uiMode.draft };

      if (trimmed) {
        nextDraft.apiKey = trimmed;
      }

      setUiMode({
        type: "connect",
        step: "model",
        draft: nextDraft,
      });
      setNotice(`输入模型名，默认 ${profile.defaultModel}`);
      return;
    }

    if (uiMode.step === "model") {
      setUiMode({
        type: "connect",
        step: "baseUrl",
        draft: {
          ...uiMode.draft,
          model: trimmed || profile.defaultModel,
        },
      });
      setNotice(
        profile.defaultBaseUrl
          ? `输入 base URL，默认 ${profile.defaultBaseUrl}`
          : "输入 base URL，OpenAI/Claude 可直接回车使用 SDK 默认地址",
      );
      return;
    }

    if (uiMode.step === "baseUrl") {
      const nextDraft = { ...uiMode.draft };

      if (trimmed) {
        nextDraft.baseUrl = trimmed;
      }

      const newConnection = buildConnection(nextDraft);
      await applyConnection(newConnection);
      setUiMode({ type: "normal" });
      setNotice(`已连接 ${getConnectionLabel(newConnection)}。`);
    }
  }

  async function handleModelCommand(input: string): Promise<void> {
    const [, providerArg] = input.trim().split(/\s+/);

    if (!providerArg) {
      const state = connectionStore.getState();
      const configured = Object.values(state.connections)
        .filter((item): item is ModelConnection => Boolean(item))
        .map((item) => `${item.provider}:${item.model}`)
        .join("，");
      setNotice(
        `当前模型：${getConnectionLabel(connection)}。已配置：${configured || "无"}。用 /model <provider> 切换。`,
      );
      return;
    }

    if (!isProviderId(providerArg)) {
      setNotice(`未知后端：${providerArg}。可用：${providerProfiles.map((p) => p.id).join(", ")}`);
      return;
    }

    const nextConnection = await connectionStore.activateProvider(providerArg);
    await applyConnection(nextConnection, false);
    setNotice(`已切换到 ${getConnectionLabel(nextConnection)}。`);
  }

  async function applyConnection(
    nextConnection: ModelConnection,
    shouldSave = true,
  ): Promise<void> {
    const runner = createRunner({
      connection: nextConnection,
      maxSteps: config.maxSteps,
      toolRegistry,
    });
    runtime.setRunner(runner, nextConnection);
    setConnection(nextConnection);

    if (shouldSave) {
      await connectionStore.saveConnection(nextConnection);
    }

    setRenderTick((tick) => tick + 1);
  }

  function buildConnection(draft: ConnectDraft): ModelConnection {
    if (!draft.provider) {
      throw new Error("Missing provider");
    }

    const profile = getProviderProfile(draft.provider);
    const fallback = defaultConnectionFor(draft.provider);
    const existing = connectionStore.getState().connections[draft.provider];
    const newConnection: ModelConnection = {
      provider: draft.provider,
      model: draft.model || existing?.model || fallback.model,
      apiMode: profile.defaultApiMode,
    };
    const apiKey = draft.apiKey || existing?.apiKey;
    const baseUrl = draft.baseUrl || existing?.baseUrl || fallback.baseUrl;

    if (apiKey) {
      newConnection.apiKey = apiKey;
    }

    if (baseUrl) {
      newConnection.baseUrl = baseUrl;
    }

    return newConnection;
  }

  return (
    <Box flexDirection="column">
      <StatusBar
        sessionId={session.id}
        provider={connection.provider}
        model={connection.model}
        isRunning={isRunning}
      />
      <Box borderStyle="single" minHeight={20}>
        <ConversationPane messages={session.messages} />
        <ActivityPane activities={session.activities} />
      </Box>
      <InputBox
        commands={slashCommands}
        disabled={isRunning}
        onSubmit={(value) => void handleSubmit(value)}
      />
      <Text color="gray">{notice}</Text>
      {uiMode.type === "connect" ? <Text color="gray">连接配置中：输入 /exit 可取消</Text> : null}
    </Box>
  );
}

function formatProviderPrompt(): string {
  return `选择后端：${providerProfiles
    .map((profile) => `${profile.id}(${profile.label})`)
    .join("，")}`;
}

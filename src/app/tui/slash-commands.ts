export type SlashCommandId = "help" | "tools" | "skills" | "connect" | "model" | "clear" | "plan" | "exit";

export type SlashCommand = {
  id: SlashCommandId;
  name: `/${SlashCommandId}`;
  description: string;
};

export const slashCommands: SlashCommand[] = [
  {
    id: "help",
    name: "/help",
    description: "显示可用命令",
  },
  {
    id: "tools",
    name: "/tools",
    description: "列出当前注册工具",
  },
  {
    id: "connect",
    name: "/connect",
    description: "交互式配置模型后端",
  },
  {
    id: "model",
    name: "/model",
    description: "查看或切换模型后端",
  },
  {
    id: "skills",
    name: "/skills",
    description: "列出已加载的 Skills",
  },
  {
    id: "clear",
    name: "/clear",
    description: "清空当前界面记录",
  },
  {
    id: "plan",
    name: "/plan",
    description: "多 Agent 协作模式：规划 + 执行",
  },
  {
    id: "exit",
    name: "/exit",
    description: "退出 TUI",
  },
];

export function findSlashCommand(input: string): SlashCommand | undefined {
  const normalized = input.trim();
  return slashCommands.find((command) => command.name === normalized);
}

export function filterSlashCommands(
  input: string,
  commands: SlashCommand[] = slashCommands,
): SlashCommand[] {
  if (!input.startsWith("/")) {
    return [];
  }

  const query = input.toLowerCase();
  return commands.filter((command) => command.name.startsWith(query));
}

export function formatSlashCommandHelp(): string {
  return slashCommands
    .map((command) => `${command.name} ${command.description}`)
    .join("；");
}

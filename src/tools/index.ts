import type { AppConfig } from "../shared/config.js";
import { calculatorTool } from "./calculator.js";
import { fileEditTool } from "./file-edit.js";
import { fileListTool } from "./file-list.js";
import { fileReadTool } from "./file-read.js";
import { fileSearchTool } from "./file-search.js";
import { fileWriteTool } from "./file-write.js";
import { shellCommandTool } from "./shell-command.js";
import { ToolRegistry } from "./registry.js";
import { wikiSearchTool } from "./wiki-search.js";

export function createDefaultToolRegistry(config: AppConfig): ToolRegistry {
  const registry = new ToolRegistry({
    workspaceRoot: config.workspaceRoot,
  });

  registry.register(calculatorTool);
  registry.register(wikiSearchTool);
  registry.register(fileListTool);
  registry.register(fileReadTool);
  registry.register(fileSearchTool);
  registry.register(fileEditTool);
  registry.register(fileWriteTool);
  registry.register(shellCommandTool);

  return registry;
}

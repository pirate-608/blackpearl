import type { AppConfig } from "../shared/config.js";
import { calculatorTool } from "./calculator.js";
import { fileReadTool } from "./file-read.js";
import { fileWriteTool } from "./file-write.js";
import { ToolRegistry } from "./registry.js";
import { wikiSearchTool } from "./wiki-search.js";

export function createDefaultToolRegistry(config: AppConfig): ToolRegistry {
  const registry = new ToolRegistry({
    workspaceRoot: config.workspaceRoot,
  });

  registry.register(calculatorTool);
  registry.register(wikiSearchTool);
  registry.register(fileReadTool);
  registry.register(fileWriteTool);

  return registry;
}

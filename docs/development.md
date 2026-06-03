# 开发与测试

## 推荐开发流程

1. 修改源码。
2. 运行类型检查或构建。
3. 运行测试。
4. 启动 TUI 手工验证关键 demo。

常用命令：

```powershell
corepack pnpm build
corepack pnpm test
corepack pnpm dev
corepack pnpm web
```

## TypeScript 约束

项目开启了较严格的 TypeScript 配置：

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `forceConsistentCasingInFileNames`

这会让一些可选字段处理更严格，但对 Agent 工具接口很有价值，因为模型返回的参数本身就需要认真校验。

## 添加新工具

添加工具的推荐步骤：

1. 在 `src/tools/` 新建工具文件。
2. 使用 Zod 定义输入 schema。
3. 使用 `createToolDefinition` 创建工具。
4. 在 `src/tools/index.ts` 注册工具。
5. 为工具增加单元测试。

示例骨架：

```ts
import { z } from "zod";
import { createToolDefinition } from "./registry.js";

const schema = z.object({
  query: z.string().min(1),
});

export const exampleTool = createToolDefinition({
  name: "example",
  description: "Describe what this tool does.",
  schema,
  async execute(input, context) {
    return {
      query: input.query,
      workspaceRoot: context.workspaceRoot,
    };
  },
});
```

注册：

```ts
registry.register(exampleTool);
```

### Coding 工具安全约束

当前内置的文件和命令行工具遵循以下约束：

- 所有文件路径必须位于 `workspaceRoot` 内。
- 文件读取会阻止 `.git/`、`.blackpearl/`、`.agents/` 和 `.env` 等敏感路径。
- 文件写入会阻止 `.git/`、`.blackpearl/`、`.agents/`、`node_modules/`、`dist/`、`site/`、`.venv/`、`.env` 等路径。
- `file_edit` 要求 `oldText` 精确出现一次，避免误改多个位置。
- `shell_command` 使用 `execFile`，不经过 shell，不支持管道、重定向或命令连接符。
- `shell_command` 默认 10 秒超时，最大 30 秒，并截断过长输出。

## 测试策略

当前已有测试：

- `src/tools/calculator.test.ts`
- `src/tools/coding-tools.test.ts`
- `src/memory/memory-store.test.ts`
- `src/llm/connection-store.test.ts`
- `src/llm/providers.test.ts`
- `src/app/tui/slash-commands.test.ts`

建议补充测试：

| 测试对象 | 建议覆盖 |
| --- | --- |
| `file_read` | 正常读取、路径逃逸、截断、敏感路径 |
| `file_write` | create/overwrite/append、非法目录、自动建目录 |
| `file_edit` | 精确替换、重复匹配、未命中 |
| `shell_command` | 成功命令、失败命令、超时、高风险命令阻止 |
| `ToolRegistry` | 未知工具、参数错误、重复注册 |
| `ResponseRunner` | mock function call、tool output 回传、max steps |
| `MultiAgentOrchestrator` | 计划解析、步骤执行、汇总形成 |

## MkDocs 文档维护

文档源码位于 `docs/`，配置文件位于 `mkdocs.yml`。

### 激活虚拟环境

```powershell
.\.venv\Scripts\Activate.ps1
```

### 安装依赖

```powershell
python -m pip install mkdocs
```

### 构建文档

```powershell
mkdocs build
```

### 本地预览

```powershell
mkdocs serve
```

默认访问：

```text
http://127.0.0.1:8000
```

## 已知后续任务

1. 给 Chat Completions runner 和 Responses runner 补 mock 集成测试。
2. 给 `MultiAgentOrchestrator` 和 `McpClientManager` 补单元测试。
3. 给 Skill 匹配和 MCP 工具发现补集成测试。
4. 增加 `/history` 命令读取 transcript。
5. 增加写文件前确认机制。
6. 给长期记忆增加删除、编辑和导出能力。
7. 扩展真实 provider 兼容性记录。

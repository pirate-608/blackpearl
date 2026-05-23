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

## 测试策略

当前已有测试：

- `src/tools/calculator.test.ts`

建议补充测试：

| 测试对象 | 建议覆盖 |
| --- | --- |
| `file_read` | 正常读取、路径逃逸、截断 |
| `file_write` | 白名单目录、非法目录、自动建目录 |
| `ToolRegistry` | 未知工具、参数错误、重复注册 |
| `ResponseRunner` | mock function call、tool output 回传、max steps |

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

1. 将 `ResponseRunner` 改为支持 stream。
2. 将 `assistant_delta` 事件真正接入 TUI。
3. 给 Chat Completions runner 补 mock 集成测试。
4. 增加 `/history` 命令读取 transcript。
5. 增加写文件前确认机制。
6. 扩展工具测试和 OpenAI runner mock 测试。

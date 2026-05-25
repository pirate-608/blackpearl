# blackpearl-agent

一个基于 TypeScript、Ink TUI 和多厂商模型后端的教学型 AI Agent 框架。

项目支持系统化模型后端配置：OpenAI、Gemini、Claude、DeepSeek 和 Ollama。OpenAI-compatible 后端使用 OpenAI SDK；Claude 使用 Anthropic Messages API。不同厂商对工具调用、鉴权和模型名的兼容程度不同，项目按 provider 分别适配。

## 项目文档

查看[项目文档](http://blackpearl.67656.fun/)

## 快速开始

### 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20 | 运行时 |
| pnpm | 10.12.1 | 由 Corepack 自动管理 |
| Git | 任意 | 克隆仓库 |

*若环境不满足，请访问[Node.js官网](https://nodejs.org/zh-cn)了解更多。若已有Node.js环境，可用 `npm install -g corepack`安装 `corepack` 并激活。*

### Windows

```powershell
# 克隆仓库
git clone https://github.com/pirate-608/ai-group-work.git
cd ai-group-work

# 安装依赖并启动
corepack enable          # 首次需要管理员权限
corepack pnpm install
copy .env.example .env
corepack pnpm dev        # 启动 TUI
```

### macOS / Linux

```bash
# 克隆仓库
git clone https://github.com/pirate-608/ai-group-work.git
cd ai-group-work

# 安装依赖并启动
corepack enable          # 首次需要 sudo
corepack pnpm install
cp .env.example .env
corepack pnpm dev        # 启动 TUI
```

### Web 界面（全平台通用）

```bash
corepack pnpm web
```

默认访问 `http://localhost:4173`。

> **注意**：项目使用 `tsx` 直接执行 TypeScript 源码，无需编译。`.env` 仅作首次启动 fallback，推荐在 TUI 或 Web 界面中使用 `/connect` 交互式配置模型后端。

## 配置模型后端

`.env` 作为首次启动 fallback。启动后推荐在 TUI 中使用 `/connect` 交互式配置，配置会保存到 `.blackpearl/connections.json`。

当前支持五类后端：`openai`、`gemini`、`claude`、`deepseek`、`ollama`。

## TUI 命令

| 命令 | 功能 |
| --- | --- |
| `/help` | 显示可用命令 |
| `/tools` | 列出已注册工具 |
| `/connect` | 交互式配置模型后端 |
| `/model` | 查看或切换已配置模型 |
| `/clear` | 清空当前界面记录 |
| `/plan` | 多 Agent 协作：规划 Agent 分解任务 → 执行 Agent 逐步完成 |
| `/exit` | 退出 TUI |

快捷键：输入 `/` 显示命令提示，`↑`/`↓` 选择，`Tab` 补全，`Enter` 执行。

## 推荐演示输入

```text
查一下 Albert Einstein 的出生年份，然后计算他活了多少岁
```

```text
/plan 查一下 Albert Einstein 的出生年份，然后计算他活了多少岁
```

```text
读取 docs/raw-instruction.md，并总结这个作业的 3 个核心要求
```

```text
把上面的总结写入 artifacts/homework-summary.md
```

## 常用命令

```bash
corepack pnpm dev       # 启动 TUI
corepack pnpm web       # 启动 Web 界面
corepack pnpm build     # TypeScript 编译
corepack pnpm test      # 运行 Vitest 测试
corepack pnpm lint      # TypeScript 类型检查
```

## 运行策略说明

当前项目保持源码运行方式，使用 `tsx` 直接执行 TypeScript。曾尝试打包为独立命令行工具，但由于入口和 Web/TUI 模块使用顶层 `await`，不同打包方案存在兼容性问题。现阶段将 `corepack pnpm dev` 与 `corepack pnpm web` 作为稳定运行入口，`corepack pnpm build` 主要用于类型检查和编译验证。

## 当前能力

- 终端 TUI 对话入口
- Web 对话入口，支持 SSE 流式输出
- OpenAI Responses API / Chat Completions / Anthropic Messages API 流式工具调用循环
- 工具注册表
- 计算器、Wikipedia 查询、工作区文件读写、文本搜索、精确替换和受控命令行执行
- 本地会话记录
- 短期记忆和 JSONL 长期记忆
- `/connect` provider 配置
- `/model` 模型切换
- `/plan` 多 Agent 协作（规划 Agent + 执行 Agent）
- Web 界面支持 `/` 命令提示、model 切换和 connect 配置
- 端口冲突自动检测与优雅退出
- 多 Agent 协作模式：规划 Agent 分解任务 → 执行 Agent 逐步执行 → 汇总

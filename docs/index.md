# blackpearl-agent

blackpearl-agent 是一个面向课程作业的教学型 AI Agent 框架。项目使用 TypeScript、Node.js、Ink TUI 和 OpenAI SDK 构建，目标是演示一个大语言模型如何从普通对话扩展为可以调用工具、执行多步任务、记录会话过程的基础智能体。

当前版本聚焦于“可运行、可解释、可扩展”的最小实现，而不是追求复杂框架封装。项目没有使用 LangChain、LlamaIndex 等高层 Agent 框架，核心循环、工具注册、参数校验和工具执行都在本仓库中直接实现。

## 项目定位

本项目提供一个终端交互界面，用户输入自然语言任务后，Agent 可以根据任务需要调用本地工具，例如计算器、Wikipedia 摘要查询、工作区文件读取和受限文件写入。工具执行结果会回传给模型，模型据此继续决策或生成最终回答。

需要注意的是，项目使用的 OpenAI SDK 不只限于 OpenAI 官方模型。通过 `BLACKPEARL_BASE_URL`，它可以连接实现 OpenAI-compatible API 的多厂商模型服务。兼容范围取决于目标服务是否支持 Responses API、function calling 和对应鉴权方式。

## 当前状态

当前基础构建已经完成：

- TypeScript 工程配置
- Ink 终端界面
- OpenAI Responses API 接入
- Function tool 调用循环
- 工具注册表
- 多个默认工具：计算、查询、文件读写、文本搜索、精确替换和受控命令执行
- JSONL 会话记录
- 基础单元测试

## 文档导览

- [快速开始](usage.md)：安装、配置、运行命令。
- [功能与特性](features.md)：说明项目已经具备的能力和当前限制。
- [架构设计](architecture.md)：说明运行时、TUI、工具层和存储层之间的关系。
- [技术接口](interfaces.md)：说明环境变量、命令、工具接口和事件接口。
- [开发与测试](development.md)：说明构建、测试和下一步开发建议。

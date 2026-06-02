# Node.js 项目独立 `.exe` 打包方案

## 目标

将 blackpearl-agent 编译为独立可执行文件。用户无需安装 Node.js、pnpm 或项目依赖，只需运行对应平台产物：

```powershell
blackpearl-win32-x64.exe
blackpearl-win32-x64.exe web
blackpearl-win32-x64.exe --resume <session-id>
```

## 当前结论

此前的失败不是项目本身不可打包，而是 Node 24 及旧打包工具链不支持本项目需要的 ESM 入口。

本项目必须保留 ESM：

- `src/cli.ts` 使用顶层 `await` 和动态 `import()`。
- `src/index.tsx` / `src/app/web/server.ts` 在入口层创建异步上下文。
- `ink` 依赖链内部存在顶层 `await`。

因此，不应继续尝试将项目降级为 CommonJS，也不应继续投入 `pkg`、`nexe`、CJS bundle、IIFE bundle，或 “CJS launcher + ESM asset import”。

## 已验证的死结范围

该死结限定在 Node 24 / CJS SEA / pkg 这一代工具链。

| 方案 | 工具 | 结果 | 原因 |
| --- | --- | --- | --- |
| esbuild + Node 24 SEA | 失败 | Node 24 SEA 以 CJS 执行入口 | ESM bundle 会触发 `Cannot use import statement outside a module` |
| esbuild + Node 24 SEA + CJS launcher + assets | 失败 | `import()` 解析真实文件系统 | SEA assets 不等价于 ESM module graph |
| `@yao-pkg/pkg` | 失败 | 需要 ESM 转 CJS | 顶层 `await` 不能安全转换 |
| esbuild IIFE bundle | 失败 | IIFE 不支持顶层 `await` | 语义无法映射 |

## 推荐路径：Node 26 SEA + ESM

Node 26 SEA 支持 ESM 入口，可在 SEA 配置中设置：

```json
{
  "mainFormat": "module"
}
```

本仓库新增独立 packaging pipeline：

```powershell
corepack pnpm package:bundle
corepack pnpm package:sea
corepack pnpm package:smoke
```

### 环境要求

- 构建 SEA 可执行文件需要 Node `>=25.5.0`，推荐 Node 26。
- 本机 Windows 可继续保留 Node 24；仅在 WSL、Node 26 shell 或 GitHub Actions 中执行 `package:sea`。
- SEA 产物按当前平台生成，不做本地交叉编译。
- GitHub Actions 使用 Windows/Linux/macOS matrix 生成跨平台 artifacts。

当前本机 Node `v24.13.0` 可以运行源码和普通构建，但执行 `package:sea` 会主动失败并提示升级 Node。

## 实现细节

脚本位置：

```text
scripts/build-sea.mjs
```

构建步骤：

1. `package:bundle` 调用 esbuild 生成 ESM bundle：
   - `entryPoints: ["src/cli.ts"]`
   - `platform: "node"`
   - `format: "esm"`
   - `bundle: true`
   - `splitting: false`
   - `target: "node26"`
2. `package:sea` 检查 Node 版本是否满足 Node 25.5+。
3. 写入 `dist-sea/sea-config.json`：
   - `main`: `dist-sea/blackpearl.bundle.mjs`
   - `mainFormat`: `"module"`
   - `output`: 当前平台可执行文件，例如 `dist-sea/blackpearl-win32-x64.exe`
   - `useCodeCache`: `false`
   - `useSnapshot`: `false`
   - `execArgv`: `["--no-warnings"]`
   - `disableExperimentalSEAWarning`: `true`
4. 调用 `node --build-sea dist-sea/sea-config.json` 生成当前平台可执行文件。

## 验证命令

普通构建验证：

```powershell
corepack pnpm build
corepack pnpm test
```

Bundle 验证：

```powershell
corepack pnpm package:bundle
node dist-sea/blackpearl.bundle.mjs --help
```

SEA 验证，需要 Node 26：

```powershell
node --version
corepack pnpm package:sea
dist-sea\blackpearl-win32-x64.exe --help
```

Web smoke test：

```powershell
$env:BLACKPEARL_NO_BROWSER=1
$env:BLACKPEARL_WEB_PORT=4181
dist-sea\blackpearl-win32-x64.exe web
```

然后访问：

```text
http://localhost:4181/api/state
```

关闭服务：

```powershell
Invoke-RestMethod -Method Post http://localhost:4181/api/exit
```

## GitHub Actions 跨平台构建

工作流位置：

```text
.github/workflows/package-sea.yml
```

触发方式：

- `workflow_dispatch`
- push 到 `main`
- push tag `v*`

构建矩阵：

| 平台 | Runner | Artifact | 产物 |
| --- | --- | --- | --- |
| Windows x64 | `windows-latest` | `blackpearl-windows-x64` | `dist-sea/blackpearl-win32-x64.exe` |
| Linux x64 | `ubuntu-latest` | `blackpearl-linux-x64` | `dist-sea/blackpearl-linux-x64` |
| macOS arm64 | `macos-latest` | `blackpearl-macos-arm64` | `dist-sea/blackpearl-darwin-arm64` |

每个平台都会执行：

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm package:sea
pnpm package:smoke
```

## 保留 fallback

保留当前脚本：

- Windows: `blackpearl.cmd`
- macOS / Linux: `blackpearl`

它们仍用于 Node 24、开发环境、源码运行和非单文件分发场景。若 Node 26 SEA 在真实项目上出现新的 ESM 或 asset 限制，fallback 仍是 `blackpearl.cmd` / `blackpearl` + `dist/` 的 portable folder，而不是回退到 `pkg`。

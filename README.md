# AI Proxy Server

> **by kilig** — v3.0

一个支持 OpenAI / Anthropic / Gemini 三家供应商的统一反向代理服务，对外暴露标准 OpenAI 兼容接口（`/v1`），并附带一个深色/浅色主题、中英双语的 React 管理门户。

---

## 目录

- [整体架构](#整体架构)
- [目录结构](#目录结构)
- [功能特性](#功能特性)
- [模型列表](#模型列表)
- [API 接口文档](#api-接口文档)
- [管理门户使用说明](#管理门户使用说明)
- [配置说明](#配置说明)
- [本地开发](#本地开发)
- [技术栈](#技术栈)

---

## 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    调用方 / Client                        │
│   任何支持 OpenAI SDK 的应用、脚本、工具                  │
└─────────────────────────┬────────────────────────────────┘
                          │  Authorization: Bearer <proxyApiKey>
                          ▼
┌──────────────────────────────────────────────────────────┐
│                 API Server  (Express.js)                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  /v1/*  —  反向代理路由  (proxy.ts)               │   │
│  │                                                  │   │
│  │  Bearer Token 鉴权  →  频率限制(120 RPM/key)      │   │
│  │                                                  │   │
│  │  model 前缀路由分发:                              │   │
│  │    gpt-* / o*    →  OpenAI SDK                   │   │
│  │    claude-*      →  Anthropic SDK                │   │
│  │    gemini-*      →  Google GenAI SDK             │   │
│  │                                                  │   │
│  │  特性: Streaming / Tool Calls / 重试 / 超时       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  /api/*  —  门户管理 API  (config.ts)             │   │
│  │    POST /api/config/login    — 登录, 获取 token   │   │
│  │    POST /api/config/logout   — 注销 token         │   │
│  │    GET  /api/config/settings — 读取当前配置        │   │
│  │    POST /api/config/settings — 更新密钥/密码       │   │
│  │    GET  /api/healthz         — 健康检查            │   │
│  └──────────────────────────────────────────────────┘   │
└──────────┬────────────────────────┬─────────────────────┘
           │                        │
    ┌──────▼──────┐          ┌──────▼──────────────────┐
    │  OpenAI API │          │  Anthropic / Gemini API  │
    └─────────────┘          └──────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                管理门户  (React + Vite)                   │
│                                                          │
│  登录页  →  密码验证  →  获取 adminToken + proxyApiKey    │
│                                                          │
│  左侧导航:                                               │
│    📊 Dashboard   — 服务状态 / 延迟监控 / 使用统计        │
│    💬 Chat Test   — 在线对话测试 (流式输出)               │
│    ◈  Models      — 28 个模型卡片 / 能力徽章              │
│    ⚙  Settings    — 修改 proxyApiKey / 门户密码           │
│                                                          │
│  支持: 深色/浅色主题切换 · 中/英语言切换                  │
└──────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
workspace/
├── artifacts/
│   ├── api-server/             # 后端服务
│   │   ├── src/
│   │   │   ├── app.ts          # Express 应用入口
│   │   │   ├── index.ts        # HTTP Server 启动
│   │   │   ├── routes/
│   │   │   │   ├── index.ts    # /api 路由聚合
│   │   │   │   ├── proxy.ts    # /v1 代理核心逻辑
│   │   │   │   ├── config.ts   # 门户鉴权 & 配置 API
│   │   │   │   └── health.ts   # 健康检查
│   │   │   └── lib/
│   │   │       ├── config.ts   # 配置读写 & Admin Token 管理
│   │   │       └── logger.ts   # Pino 日志
│   │   ├── config.json         # 运行时配置 (gitignored)
│   │   ├── build.mjs           # esbuild 打包脚本
│   │   └── package.json
│   │
│   └── api-portal/             # 前端门户
│       ├── src/
│       │   ├── App.tsx         # 单文件全量实现（路由/主题/i18n/所有 Tab）
│       │   ├── main.tsx
│       │   └── index.css
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
├── package.json                # pnpm workspace 根配置
├── pnpm-workspace.yaml
└── README.md
```

---

## 功能特性

| 特性 | 说明 |
|------|------|
| **统一接口** | 所有供应商共用 OpenAI 兼容的 `/v1/chat/completions` |
| **流式输出** | SSE 流式传输，实时返回 token |
| **Tool Calls** | 函数调用 / 工具调用全平台透传 |
| **Thinking 适配** | 支持 `reasoning_effort` / `reasoning.effort` / Claude `thinking.*` / Gemini `generationConfig.thinkingConfig`，并支持模型后缀覆盖 |
| **模型路由** | 根据模型名前缀自动路由至对应供应商 SDK |
| **频率限制** | 每个 Bearer Key 限制 120 请求/分钟（内存滑动窗口） |
| **自动重试** | 429 / 5xx / 网络错误触发指数退避重试（最多 3 次）|
| **请求超时** | AbortController 60 秒超时兜底 |
| **单例 SDK** | 三家 SDK 客户端在进程级别单例，避免重复初始化 |
| **配置热更新** | `/api/config/settings` 更新后立即生效，无需重启 |
| **Admin Token** | 门户登录颁发 24 小时有效期 JWT 风格 Token |
| **持久化配置** | `config.json` 写盘，重启后配置不丢失 |
| **深色/浅色主题** | localStorage 持久化主题偏好 |
| **中英双语** | localStorage 持久化语言选择 |

---

## 模型列表

### OpenAI（17 个）

| 模型 ID | 备注 |
|---------|------|
| `gpt-5.4` | |
| `gpt-5.3-codex` | 支持 `/v1/responses` |
| `gpt-5.2` | |
| `gpt-5.2-codex` | 支持 `/v1/responses` |
| `gpt-5.1` | |
| `gpt-5` | |
| `gpt-5-mini` | |
| `gpt-5-nano` | |
| `gpt-4.1` | |
| `gpt-4.1-mini` | |
| `gpt-4.1-nano` | |
| `gpt-4o` | 支持 Vision |
| `gpt-4o-mini` | |
| `o4-mini` | Reasoning |
| `o3` | Reasoning |
| `o3-mini` | Reasoning |

### Anthropic（6 个）

| 模型 ID | 备注 |
|---------|------|
| `claude-opus-4-6` | |
| `claude-opus-4-5` | |
| `claude-opus-4-1` | |
| `claude-sonnet-4-6` | |
| `claude-sonnet-4-5` | |
| `claude-haiku-4-5` | 轻量快速 |

### Google Gemini（5 个）

| 模型 ID | 备注 |
|---------|------|
| `gemini-3.1-pro-preview` | |
| `gemini-3-pro-preview` | |
| `gemini-3-flash-preview` | |
| `gemini-2.5-pro` | |
| `gemini-2.5-flash` | |

**路由规则（自动）：**
- `gpt-*` 或 `o*` → OpenAI SDK
- `claude-*` → Anthropic SDK
- `gemini-*` → Google GenAI SDK

### Thinking / Reasoning 支持

- 支持的输入方式：
  - Chat：`reasoning_effort`
  - Messages：`thinking.*`、`output_config.effort`
  - Responses：`reasoning.effort`
  - 兼容读取：`generationConfig.thinkingConfig`
- 支持模型后缀覆盖：`model(none|auto|minimal|low|medium|high|xhigh|max|8192)`
- 优先级：**模型后缀 > 请求体 > 默认**
- 不支持 Thinking 的模型会**自动剥离**相关字段并继续请求，不直接报错
- `/v1/chat/completions`、`/v1/messages`、`/v1/responses` 都会先去掉模型后缀，再把 Thinking 映射到目标 provider

---

## API 接口文档

### 代理接口（`/v1`）

所有代理接口都需要携带本服务的 `proxyApiKey`。支持以下写法：

```
Authorization: Bearer <proxyApiKey>
```

或：

```
x-proxy-api-key: <proxyApiKey>
```

兼容旧写法：

```
x-api-key: <proxyApiKey>
```

> 推荐长期把 `Authorization` / `x-proxy-api-key` 用作 **本服务 hop 鉴权**。  
> 对于 Anthropic 原生协议的多级代理链路，建议把 `x-api-key` 留给 **Anthropic provider 鉴权**。

---

#### `GET /v1/models`

返回所有可用模型列表（OpenAI 标准格式）。

**响应示例：**
```json
{
  "object": "list",
  "data": [
    { "id": "gpt-5", "object": "model", "created": 1712000000, "owned_by": "openai" },
    { "id": "claude-sonnet-4-6", "object": "model", "created": 1712000000, "owned_by": "anthropic" },
    { "id": "gemini-2.5-pro", "object": "model", "created": 1712000000, "owned_by": "google" }
  ]
}
```

---

#### `POST /v1/chat/completions`

统一对话接口，兼容 OpenAI Chat Completions 格式，自动路由至三家供应商。

**Thinking 字段：**
- 入参：`reasoning_effort`
- 目标 OpenAI：映射到 `reasoning_effort`
- 目标 Claude：映射到 `thinking` / `output_config.effort`
- 目标 Gemini：映射到 `generationConfig.thinkingConfig`

**请求体：**
```json
{
  "model": "claude-sonnet-4-6",
  "messages": [
    { "role": "user", "content": "你好，介绍一下自己" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048,
  "tools": []
}
```

**流式响应（stream: true）：** SSE 格式，`Content-Type: text/event-stream`

**非流式响应：** 标准 JSON，`Content-Type: application/json`

**cURL 示例：**
```bash
curl https://your-server/v1/chat/completions \
  -H "Authorization: Bearer admin123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

**Python 示例（OpenAI SDK）：**
```python
from openai import OpenAI

client = OpenAI(
    api_key="admin123",
    base_url="https://your-server/v1"
)

response = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "用 Python 写冒泡排序"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="", flush=True)
```

**JavaScript 示例：**
```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'admin123',
  baseURL: 'https://your-server/v1',
});

const stream = await client.chat.completions.create({
  model: 'claude-opus-4-6',
  messages: [{ role: 'user', content: '解释量子纠缠' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

---

#### `POST /v1/messages`

Anthropic 原生 Messages API 格式入口，支持 Claude / OpenAI / Gemini 模型透传（内部自动转换格式）。

**Thinking 字段：**
- 原生支持 Claude `thinking.*` 与 `output_config.effort`
- 若目标是 OpenAI / Codex，会自动转成 `reasoning_effort`
- 若目标是 Gemini，会自动转成 `generationConfig.thinkingConfig`

**多级代理鉴权建议：**
- 推荐：
  - `x-proxy-api-key: <proxyApiKey>` → 本服务鉴权
  - `x-api-key: <anthropicProviderKey>` → 上游 Anthropic 鉴权
- 兼容旧链路：
  - `x-api-key == <proxyApiKey>` 仍可作为本服务鉴权
  - 若未额外提供上游 Anthropic Key，则自动回退到 `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

```bash
curl https://your-server/v1/messages \
  -H "x-proxy-api-key: admin123" \
  -H "x-api-key: YOUR_ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

#### `POST /v1/messages/count_tokens`

Anthropic 原生 token counting 接口。

- 当前仅支持 Anthropic 模型
- 若 `messages` 不是数组，会返回 `400 invalid_request_error`
- 多级代理场景下，鉴权规则与 `/v1/messages` 相同

```bash
curl https://your-server/v1/messages/count_tokens \
  -H "x-proxy-api-key: admin123" \
  -H "x-api-key: YOUR_ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

#### `POST /v1/responses`

OpenAI Responses API 透传，**仅支持 OpenAI 模型**（`gpt-*` / `o*`）。

**Thinking 字段：**
- 支持 `reasoning.effort`
- 支持模型后缀覆盖，例如 `gpt-5.4(high)`、`gpt-5.3-codex(8192)`

---

#### 未知 `/v1/*` 路径

未知的 `/v1/*` 路径会统一返回 **JSON 404**，避免默认 HTML 404 被外层客户端误判成 500。

---

### 门户管理接口（`/api`）

#### `GET /api/healthz`

健康检查，无需鉴权。

```json
{ "ok": true }
```

---

#### `POST /api/config/login`

门户登录，返回 Admin Token 和当前 proxyApiKey。

**请求体：**
```json
{ "password": "admin123" }
```

**响应：**
```json
{
  "token": "a3f2...(48位hex)",
  "proxyApiKey": "admin123"
}
```

> Token 有效期 24 小时，内存存储，服务重启后失效需重新登录。

---

#### `POST /api/config/logout`

注销当前 Admin Token。需携带 `Authorization: Bearer <adminToken>`。

---

#### `GET /api/config/settings`

获取当前配置（脱敏）。需携带 Admin Token。

```json
{ "proxyApiKey": "admin123" }
```

---

#### `POST /api/config/settings`

更新 proxyApiKey 或 portalPassword，**立即生效**，写入 `config.json` 持久化。

**请求体（字段可选）：**
```json
{
  "proxyApiKey": "new-api-key-here",
  "portalPassword": "new-password"
}
```

---

## 管理门户使用说明

访问门户地址（Replit 部署后为 `https://your-app.replit.app/`）。

### 登录

输入门户密码（默认 `admin123`）登录，登录后获取并保存以下信息至 `localStorage`：
- `portalToken` — 24h Admin Token
- `portalApiKey` — 当前 proxyApiKey

### Dashboard 面板

- 实时轮询 `/api/healthz` 显示服务在线状态
- 显示 API 请求延迟
- 显示模型总数统计（OpenAI / Anthropic / Gemini）

### Chat Test 聊天测试

- 左侧可选择模型（支持搜索过滤）
- 支持系统 Prompt 设置
- 流式输出，实时显示 token
- 可从"模型列表"页直接跳转并预填模型

### Models 模型列表

- 按供应商分组展示所有 28 个模型
- 每张卡片显示：上下文窗口大小、能力徽章（Streaming / Tool Calls / Vision / Reasoning / JSON Mode）
- 点击"Chat Test →"直接跳转到聊天测试页

### Settings 设置

- 修改 **Proxy API Key**（所有调用方使用的 Bearer Token）
- 修改**门户登录密码**
- 更新立即生效，持久化至 `config.json`

---

## 配置说明

### `config.json`（运行时配置，gitignored）

```json
{
  "proxyApiKey": "admin123",
  "portalPassword": "admin123"
}
```

- 文件不存在时，服务自动以默认值启动
- 可通过环境变量覆盖默认值：
  - `PROXY_API_KEY` — proxyApiKey 的默认值
  - `PORTAL_PASSWORD` — portalPassword 的默认值（未实装门户读取，仅服务端默认）

### 环境变量（Replit Secrets）

| Secret 名 | 用途 |
|-----------|------|
| `PROXY_API_KEY` | proxyApiKey 默认值（config.json 不存在时生效） |
| `SESSION_SECRET` | 预留，当前版本暂未使用 |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic 上游地址（Replit AI Integrations 注入） |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic 上游回退凭据（Replit AI Integrations 注入） |

> OpenAI / Gemini 仍按原有模式处理。Anthropic 原生协议（`/v1/messages`、`/v1/messages/count_tokens`）支持两种上游鉴权来源：  
> 1. 请求中显式传入的 **独立** `x-api-key` / `Authorization`  
> 2. Replit 环境中的 `AI_INTEGRATIONS_ANTHROPIC_API_KEY` 回退  
> 推荐将 `proxyApiKey` 与 Anthropic provider key 分开传递，避免多级代理链路混淆。

---

## 本地开发

### 前提条件

- Node.js >= 20
- pnpm >= 9

### 安装依赖

```bash
pnpm install
```

### 启动服务

```bash
# 启动 API Server（后端）
pnpm --filter @workspace/api-server run dev

# 启动管理门户（前端）
pnpm --filter @workspace/api-portal run dev
```

### 构建

```bash
# 构建后端（esbuild，输出至 dist/）
pnpm --filter @workspace/api-server run build

# 构建前端（Vite，输出至 dist/）
pnpm --filter @workspace/api-portal run build
```

---

## 技术栈

### 后端（`artifacts/api-server`）

| 技术 | 版本 | 用途 |
|------|------|------|
| Express.js | ^5 | HTTP 框架 |
| TypeScript | ^5 | 类型安全 |
| openai | ^6.33.0 | OpenAI 官方 SDK |
| @anthropic-ai/sdk | ^0.82.0 | Anthropic 官方 SDK |
| @google/genai | ^1.48.0 | Google GenAI 官方 SDK |
| pino / pino-http | ^9 / ^10 | 结构化日志 |
| esbuild | ^0.27.3 | 打包构建 |
| cors | ^2 | 跨域处理 |

### 前端（`artifacts/api-portal`）

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^18 | UI 框架 |
| TypeScript | ^5 | 类型安全 |
| Vite | ^6 | 开发服务器 / 构建 |
| 无外部 UI 库 | — | 全量内联样式实现 |

### 工程化

| 技术 | 用途 |
|------|------|
| pnpm workspaces | Monorepo 包管理 |
| esbuild | 后端打包（ESM 输出） |
| Vite | 前端打包 / HMR |

---

## 版本历史

| 版本 | 内容 |
|------|------|
| v3.0 | 默认明亮主题；隐藏余额卡片；多账号部署文档完善 |
| v2.4 | Anthropic 原生协议 x-api-key 认证支持；/v1/v1 路径兼容；默认凭据更新为 admin999 |
| v2.3 | 修复 401 自动恢复；中英双语；左侧导航栏；模型列表 Tab；28 个模型全量同步 |
| v2.2 | 添加频率限制 (120 RPM)；Admin Token 机制；配置持久化 |
| v2.1 | 流式输出修复；Gemini SDK 修复 (`apiVersion: ""`)；指数退避重试 |
| v2.0 | 三供应商支持；Tool Calls；管理门户初版 |

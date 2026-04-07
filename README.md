# AI Proxy Server

> **by kilig** — v3.0

一个面向 OpenAI / Anthropic / Gemini 的统一 AI 代理服务。

当前仓库提供两块核心能力：

1. **后端代理服务**：对外暴露 `/v1` 兼容接口，负责鉴权、模型路由、协议转换、流式转发、限流、超时与重试。
2. **管理门户**：提供登录、连接信息查看、在线聊天测试、模型浏览、运行时配置修改。

这版 README 已按 **2026-04-07 当前代码** 重新维护，重点修正文档与实现漂移，并按模块梳理实际功能点。

---

## 目录

- [1. 项目总览](#1-项目总览)
- [2. 当前功能总览](#2-当前功能总览)
- [3. 按模块拆解功能点](#3-按模块拆解功能点)
- [4. 目录结构](#4-目录结构)
- [5. 模型与能力矩阵](#5-模型与能力矩阵)
- [6. API 接口说明](#6-api-接口说明)
- [7. 配置与环境变量](#7-配置与环境变量)
- [8. 本地开发与构建](#8-本地开发与构建)
- [9. 当前限制与注意事项](#9-当前限制与注意事项)
- [10. 本次 README 维护更新点](#10-本次-readme-维护更新点)

---

## 1. 项目总览

### 1.1 整体架构

```text
Client / SDK / App
   |
   | Authorization: Bearer <proxyApiKey>
   v
AI Proxy Server
├─ /v1/*      统一代理入口
│  ├─ /models
│  ├─ /credits
│  ├─ /chat/completions
│  ├─ /messages
│  ├─ /messages/count_tokens
│  └─ /responses
│
├─ /api/*     管理门户 API
│  ├─ /healthz
│  ├─ /config/login
│  ├─ /config/logout
│  ├─ /config/settings
│  └─ /credits
│
└─ Portal     React + Vite 管理界面
   ├─ Dashboard
   ├─ Chat Test
   ├─ Models
   └─ Settings
```

### 1.2 当前运行定位

这个项目不是“单纯转发一个 OpenAI key”的极简中转。

它当前已经具备：

- 多供应商统一入口
- OpenAI / Anthropic / Gemini 三套协议间的适配转换
- Thinking / Reasoning 统一抽象
- 管理员门户登录与运行时配置写盘
- OpenAI credits 查询链路
- Monorepo 形式的共享 schema / client / spec 基建

---

## 2. 当前功能总览

### 2.1 代理层能力

- 统一使用 `/v1` 对外暴露 AI 能力
- 支持三家 provider：OpenAI / Anthropic / Gemini
- 根据模型名前缀自动路由
  - `gpt-*` / `o*` → OpenAI
  - `claude-*` → Anthropic
  - `gemini-*` → Gemini
- 支持：
  - 流式输出（SSE）
  - 非流式 JSON 输出
  - Tool Calls / Tool Use 转换
  - Thinking / Reasoning 配置映射
  - sampling 参数规范化
  - OpenAI Responses API 透传
  - Anthropic Messages API 透传
  - Anthropic count_tokens
  - credits 查询

### 2.2 稳定性能力

- Bearer / Header 鉴权
- 每个代理 key **120 RPM** 内存限流
- 指数退避重试（最多 3 次）
- 60 秒上游超时保护
- OpenAI / Anthropic / Gemini SDK 单例复用
- Pino 结构化日志 + 敏感头脱敏
- `/v1/v1` 兼容挂载，处理 Anthropic SDK 某些 base URL 拼接场景
- 未知 `/v1/*` 路径统一返回 JSON 404

### 2.3 门户能力

- 门户密码登录
- 管理员 token 鉴权
- Dashboard 展示连接信息与接口说明
- Chat Test 直接走真实 `/v1/chat/completions` 流式对话
- Models 页面查看模型能力与跳转测试
- Settings 页面实时修改：
  - `proxyApiKey`
  - 门户密码
  - OpenAI Direct Key（仅用于 credits 查询）
- 中英双语切换
- 明暗主题切换

---

## 3. 按模块拆解功能点

### 3.1 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/artifacts/api-server`

后端主服务。

#### 3.1.1 `src/app.ts`

负责 Express 应用装配：

- `pino-http` 请求日志接入
- `cors()` 开启跨域
- `express.json()` / `express.urlencoded()`，请求体上限 `50mb`
- 挂载 `/api`
- 挂载 `/v1`
- 额外挂载 `/v1/v1` 兼容路径

#### 3.1.2 `src/index.ts`

服务启动入口：

- 强依赖 `PORT`
- 校验 `PORT` 是否为正整数
- 启动 HTTP 服务
- 启动成功/失败写日志

#### 3.1.3 `src/routes/proxy.ts`

这是当前代理核心。

#### 代理入口

- `GET /v1/models`
- `GET /v1/credits`
- `POST /v1/chat/completions`
- `POST /v1/messages`
- `POST /v1/messages/count_tokens`
- `POST /v1/responses`

#### 代理鉴权

支持三种方式：

- `Authorization: Bearer <proxyApiKey>`
- `x-proxy-api-key: <proxyApiKey>`
- `x-api-key: <proxyApiKey>`（兼容旧链路）

#### 上游 provider 路由

- OpenAI：原生 `chat.completions` / `responses`
- Anthropic：原生 `messages` / `count_tokens`
- Gemini：`generateContent` 风格请求，由代理做输入输出转换

#### 协议适配

- OpenAI Chat → Anthropic Messages
- OpenAI Chat → Gemini Generate Content
- Anthropic Messages → OpenAI Chat
- Anthropic Messages → Gemini Generate Content
- Anthropic / Gemini 返回再转回 OpenAI 或 Anthropic 兼容格式
- Tool Calls / Tool Use / Function Call 双向适配
- 统一把 reasoning/thinking 文本归并到 `reasoning_content`

#### Thinking / Reasoning 能力

当前支持三类入口：

- Chat：`reasoning_effort`
- Messages：`thinking.*`、`output_config.effort`
- Responses：`reasoning.effort`
- 兼容读取 Gemini：`generationConfig.thinkingConfig`

同时支持模型后缀覆盖，例如：

- `gpt-5.4(high)`
- `gpt-5.3-codex(8192)`
- `claude-sonnet-4-6(auto)`
- `gemini-2.5-flash(low)`

优先级：

```text
模型后缀 > 请求体字段 > 默认行为
```

- Anthropic 手动 thinking budget 模式会自动压到 `< max_tokens`
- 若 `max_tokens` 太小，无法满足 `max_tokens > thinking.budget_tokens`，代理会自动关闭 manual thinking，避免上游 `400`

#### sampling 参数规范化

当前有显式兼容逻辑：

- Anthropic：
  - `temperature` 与 `top_p` 同时出现时，会丢弃 `top_p`
  - 丢弃 `frequency_penalty`
  - 丢弃 `presence_penalty`
- Gemini：
  - 丢弃 `frequency_penalty`
  - 丢弃 `presence_penalty`

#### 稳定性保护

- 每 key `120 RPM` 限流
- 可重试错误：`429 / 502 / 503 / 504 / ECONNRESET / ETIMEDOUT / ENOTFOUND`
- 最多 3 次指数退避重试
- 60 秒上游超时保护
- SSE keepalive

#### 3.1.4 `src/routes/config.ts`

门户配置 API。

- `POST /api/config/login`
  - 校验门户密码
  - 返回 `admin token`
  - 返回当前 `proxyApiKey`
  - 返回 OpenAI Direct Key 是否已配置
- `POST /api/config/logout`
  - 注销当前 admin token
- `GET /api/config/settings`
  - 读取当前运行配置
- `POST /api/config/settings`
  - 更新 `proxyApiKey`
  - 更新 `portalPassword`
  - 更新 `openaiDirectKey`
  - 立即写入 `config.json`
- `GET /api/credits`
  - 管理员态 credits 查询接口

#### 3.1.5 `src/routes/health.ts`

健康检查接口。

- 路径：`GET /api/healthz`
- 当前真实返回：

```json
{ "status": "ok" }
```

#### 3.1.6 `src/lib/config.ts`

运行时配置与 admin token 管理。

- 配置文件：`artifacts/api-server/config.json`
- 默认值来源：
  - `PROXY_API_KEY`
  - `PORTAL_PASSWORD`
  - `OPENAI_DIRECT_KEY`
- 默认回退值：
  - `proxyApiKey = admin999`
  - `portalPassword = admin999`
  - `openaiDirectKey = ""`
- admin token：
  - 24 小时有效
  - 仅保存在内存 Map
  - 服务重启即失效

#### 3.1.7 `src/lib/credits.ts`

OpenAI billing/credits 查询模块。

功能点：

- 查询 credit grants
- 查询当月 usage
- 合并出：
  - `total_granted`
  - `remaining`
  - `used_this_month`
  - `expires_at`
  - `partial`
- key 优先级：

```text
OPENAI_DIRECT_KEY 环境变量
> config.json.openaiDirectKey
> AI_INTEGRATIONS_OPENAI_API_KEY（仅兜底）
```

注意：这个 key **仅用于 credits 查询**，不是主代理推理的统一上游配置。

#### 3.1.8 `src/lib/model-catalog.ts`

模型注册表。

负责维护：

- 模型 ID
- provider 归属
- `owned_by`
- 支持路由
- thinking 能力模式

这也是 `/v1/models` 的真实来源之一。

#### 3.1.9 `src/lib/thinking.ts`

Thinking / Reasoning 统一抽象层。

负责：

- 解析模型后缀
- 提取不同协议中的 thinking 配置
- effort / budget 之间的映射
- 构造 OpenAI / Anthropic / Gemini 的目标字段
- 自动剥离不支持 thinking 的模型字段
- 聚合 reasoning 文本

#### 3.1.10 `src/lib/sampling.ts`

统一采样参数规范化。

职责很清晰：

- provider 级兼容处理
- 丢弃不支持字段
- 生成 adjustments 日志元信息

#### 3.1.11 `src/lib/logger.ts`

日志模块。

- 使用 `pino`
- 开发环境走 `pino-pretty`
- 脱敏字段：
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `res.headers['set-cookie']`

---

### 3.2 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/artifacts/api-portal`

React + Vite 管理门户。

#### 3.2.1 `src/App.tsx`

当前门户几乎全部逻辑集中在一个文件中，包含：

- 登录页
- 顶部 Header
- 左侧导航
- Dashboard
- Chat Test
- Models
- Settings
- 中英双语文案
- 明暗主题配色

#### 3.2.2 登录流程

- 登录接口：`POST /api/config/login`
- 登录成功后保存：
  - `portalToken` 到 `localStorage`
  - `portalLang` 到 `localStorage`
- 应用启动时会自动用 `portalToken` 调 `GET /api/config/settings` 做会话恢复

> 说明：**当前代码没有把明暗主题持久化到 localStorage**。主题切换只在当前页面会话内生效。

#### 3.2.3 Dashboard 页面

当前真实展示内容：

- Base URL
- Auth Header 示例
- API 端点列表
- 模型分组列表
- CherryStudio 配置指引
- curl 快速测试示例
- 在线状态（通过 `/api/healthz`）

当前**没有**在页面中展示的内容：

- 延迟图表
- 请求统计图表
- 可见的 credits 余额卡片

#### 3.2.4 Chat Test 页面

当前真实能力：

- 按 provider 分组选择模型
- 直接请求 `/v1/chat/completions`
- 流式读取 SSE
- 实时展示 assistant 文本
- 401 时自动尝试刷新最新 `proxyApiKey`
- 如果管理员会话已失效，会强制重新登录
- 可从 Models 页点击跳转并带入模型

当前**没有**的能力：

- 模型搜索框
- 系统 Prompt 独立输入框
- 多会话历史持久化

#### 3.2.5 Models 页面

- 按 OpenAI / Anthropic / Gemini 分组
- 每张卡片展示：
  - 模型 ID
  - 备注（如 Latest / Recommended / Fastest）
  - 上下文窗口
  - 能力徽章（Streaming / Tool Calls / Vision / Reasoning / JSON Mode）
  - 对应可用路由
- 点击按钮可跳到 Chat Test 并预选该模型

#### 3.2.6 Settings 页面

当前可修改：

- `proxyApiKey`
- 门户密码
- `openaiDirectKey`

其中：

- `openaiDirectKey` 仅用于 credits 查询
- 如果 `OPENAI_DIRECT_KEY` 已由环境变量注入，则页面显示“已通过环境变量配置”，不再允许手填覆盖

#### 3.2.7 门户 credits 状态

门户代码会在登录后定时轮询 `/api/credits`，并维护：

- `credits`
- `creditsLoading`
- `creditsErr`
- `creditsNeedsKey`

但当前版本 **没有把 credits 卡片渲染到 Dashboard UI**。

也就是说：

- **后端 credits 功能是存在的**
- **Settings 的 OpenAI Direct Key 配置也是生效的**
- **只是当前界面没有展示 credits 面板**

---

### 3.3 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/lib`

共享库与生成代码层。

#### 3.3.1 `lib/api-spec`

- 维护 OpenAPI 规范
- 当前已写入的公开 spec 很少，只有 `/api/healthz`
- 用于驱动后续 Orval 生成

#### 3.3.2 `lib/api-zod`

- 由 OpenAPI 生成 Zod schema
- 当前已生成 `HealthCheckResponse`
- 被后端健康检查直接使用

#### 3.3.3 `lib/api-client-react`

- 由 Orval 生成 React Query 风格 client
- 当前已生成 health check client
- 额外提供 `custom-fetch.ts`
  - 支持统一 base URL
  - 支持 bearer token getter
  - 统一错误解析
  - 兼容无 body / JSON / 文本场景

#### 3.3.4 `lib/db`

- Drizzle + PostgreSQL 脚手架
- 提供 `db` / `pool` / schema 导出能力
- 当前 schema 仍是占位模板
- 当前 AI Proxy 主链路 **没有实际使用这套 DB 包**

---

### 3.4 其他辅助模块

#### 3.4.1 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/artifacts/mockup-sandbox`

- 独立 Vite mockup/sandbox 工程
- 更像设计/原型实验区
- 不在当前 API Server + Portal 主运行链路中

#### 3.4.2 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/docs`

- 已有优化方案文档
- 主要记录项目对标、问题分析与后续重构方向
- 不属于运行时代码

#### 3.4.3 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/scripts`

- 目前脚本很少
- 主要有 `post-merge.sh`
- 属于工程辅助，而非业务功能模块

---

## 4. 目录结构

```text
ai-proxy-server/
├── artifacts/
│   ├── api-server/                 # 后端代理服务
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── config.ts
│   │   │   │   ├── health.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── proxy.ts
│   │   │   └── lib/
│   │   │       ├── config.ts
│   │   │       ├── credits.ts
│   │   │       ├── logger.ts
│   │   │       ├── model-catalog.ts
│   │   │       ├── sampling.ts
│   │   │       └── thinking.ts
│   │   ├── build.mjs
│   │   └── config.json            # 运行时配置，已 gitignore
│   ├── api-portal/                 # React 管理门户
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── index.css
│   │   │   ├── components/ui/
│   │   │   ├── hooks/
│   │   │   └── pages/
│   │   └── vite.config.ts
│   └── mockup-sandbox/             # 原型/沙箱工程
├── lib/
│   ├── api-client-react/           # 生成客户端 + custom fetch
│   ├── api-spec/                   # OpenAPI 规范
│   ├── api-zod/                    # 生成 Zod schema
│   └── db/                         # Drizzle DB 脚手架（当前未接主链路）
├── docs/                           # 设计/优化文档
├── scripts/                        # 工程辅助脚本
├── package.json                    # workspace 根脚本
├── pnpm-workspace.yaml
└── README.md
```

---

## 5. 模型与能力矩阵

### 5.1 当前模型总数

当前代码中的模型总数是 **27 个**：

- OpenAI：**16**
- Anthropic：**6**
- Gemini：**5**

### 5.2 OpenAI（16 个）

| 模型 ID | 路由 | Thinking |
|---|---|---|
| `gpt-5.4` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5.3-codex` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5.2` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5.2-codex` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5.1` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5-mini` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-5-nano` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `gpt-4.1` | `/v1/chat/completions` `/v1/responses` | 不支持 |
| `gpt-4.1-mini` | `/v1/chat/completions` `/v1/responses` | 不支持 |
| `gpt-4.1-nano` | `/v1/chat/completions` `/v1/responses` | 不支持 |
| `gpt-4o` | `/v1/chat/completions` `/v1/responses` | 不支持 |
| `gpt-4o-mini` | `/v1/chat/completions` `/v1/responses` | 不支持 |
| `o4-mini` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `o3` | `/v1/chat/completions` `/v1/responses` | 支持 |
| `o3-mini` | `/v1/chat/completions` `/v1/responses` | 支持 |

### 5.3 Anthropic（6 个）

| 模型 ID | 路由 | Thinking |
|---|---|---|
| `claude-opus-4-6` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `claude-opus-4-5` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `claude-opus-4-1` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `claude-sonnet-4-6` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `claude-sonnet-4-5` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `claude-haiku-4-5` | `/v1/chat/completions` `/v1/messages` | 不支持 |

### 5.4 Gemini（5 个）

| 模型 ID | 路由 | Thinking |
|---|---|---|
| `gemini-3.1-pro-preview` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `gemini-3-pro-preview` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `gemini-3-flash-preview` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `gemini-2.5-pro` | `/v1/chat/completions` `/v1/messages` | 支持 |
| `gemini-2.5-flash` | `/v1/chat/completions` `/v1/messages` | 支持 |

---

## 6. API 接口说明

### 6.1 `/v1` 代理接口

### 统一鉴权方式

支持：

```http
Authorization: Bearer <proxyApiKey>
```

或：

```http
x-proxy-api-key: <proxyApiKey>
```

兼容旧写法：

```http
x-api-key: <proxyApiKey>
```

> 建议多级代理场景下，把 `x-proxy-api-key` 留给本服务，把 `x-api-key` 留给上游 Anthropic provider。

### `GET /v1/models`

- 返回全部 27 个模型
- 响应格式兼容 OpenAI models list

### `GET /v1/credits`

- 使用 `proxyApiKey` 鉴权
- 内部调用 OpenAI billing 接口
- 返回：
  - `total_granted`
  - `remaining`
  - `used_this_month`
  - `currency`
  - `expires_at`
  - `partial`
- 如果未配置 key，会返回 `needs_key`

### `POST /v1/chat/completions`

- OpenAI 兼容聊天入口
- 当前最完整的统一代理入口
- 支持：
  - OpenAI / Claude / Gemini 模型
  - 流式 / 非流式
  - tool calls
  - thinking / reasoning 适配
  - 多 provider sampling 兼容

### `POST /v1/messages`

- Anthropic 原生 Messages 协议入口
- 目标模型不只支持 Claude，也支持 GPT / Gemini
- 代理会做跨协议转换
- 多级代理时支持独立上游 Anthropic 鉴权
- 当最终路由到 Anthropic 且使用手动 budget thinking 时，代理会保证 `max_tokens > thinking.budget_tokens`

### `POST /v1/messages/count_tokens`

- Anthropic 原生 token counting
- 当前只支持 **Anthropic 模型**
- 输入不合法会返回 `400 invalid_request_error`

### `POST /v1/responses`

- OpenAI Responses API 透传入口
- 当前只支持 **OpenAI 模型**
- 支持 `reasoning.effort`
- 支持模型后缀覆盖 thinking

### 未知 `/v1/*`

会返回 JSON 404，而不是 HTML 404。

---

### 6.2 `/api` 门户接口

### `GET /api/healthz`

无需鉴权。

当前真实响应：

```json
{ "status": "ok" }
```

### `POST /api/config/login`

请求：

```json
{ "password": "admin999" }
```

响应字段：

```json
{
  "token": "<adminToken>",
  "proxyApiKey": "admin999",
  "openaiDirectKeySet": false,
  "openaiDirectKeyFromEnv": false
}
```

### `POST /api/config/logout`

- 需要 `Authorization: Bearer <adminToken>`
- 注销当前管理会话

### `GET /api/config/settings`

- 需要 admin token
- 返回当前配置概览

### `POST /api/config/settings`

- 需要 admin token
- 可更新：
  - `proxyApiKey`
  - `portalPassword`
  - `openaiDirectKey`

### `GET /api/credits`

- 需要 admin token
- 功能与 `/v1/credits` 类似
- 主要供门户轮询使用

---

## 7. 配置与环境变量

### 7.1 `artifacts/api-server/config.json`

当前运行时配置结构：

```json
{
  "proxyApiKey": "admin999",
  "portalPassword": "admin999",
  "openaiDirectKey": ""
}
```

说明：

- 文件不存在时，服务会按默认值启动
- 一旦通过 Settings 或 `/api/config/settings` 更新，就会写盘
- 这个文件已被 `.gitignore` 忽略

### 7.2 后端环境变量

| 变量名 | 用途 |
|---|---|
| `PORT` | **必填**，后端启动端口 |
| `PROXY_API_KEY` | `config.json` 不存在时的默认 proxy key |
| `PORTAL_PASSWORD` | `config.json` 不存在时的默认门户密码 |
| `OPENAI_DIRECT_KEY` | OpenAI credits 查询 key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI 上游 base URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI 上游 API key |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic 上游 base URL |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic 上游回退 key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini 上游 base URL |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini 上游 API key |
| `LOG_LEVEL` | Pino 日志级别 |
| `NODE_ENV` | 影响日志输出与构建模式 |

### 7.3 前端环境变量

`artifacts/api-portal/vite.config.ts` 当前要求：

| 变量名 | 用途 |
|---|---|
| `PORT` | **必填**，Vite dev / preview 端口 |
| `BASE_PATH` | **必填**，Vite base path |

---

## 8. 本地开发与构建

### 8.1 前提

- Node.js 20+（当前 Replit 模块是 `nodejs-24`）
- pnpm 9+

### 8.2 安装依赖

```bash
pnpm install
```

### 8.3 启动后端

> 注意：当前后端 `dev` 脚本不是热更新 watch，它会先 build 再 start。

```bash
PORT=8080 \
AI_INTEGRATIONS_OPENAI_API_KEY=xxx \
AI_INTEGRATIONS_ANTHROPIC_API_KEY=xxx \
AI_INTEGRATIONS_GEMINI_API_KEY=xxx \
pnpm --filter @workspace/api-server run dev
```

### 8.4 启动前端

```bash
PORT=24927 BASE_PATH=/ \
pnpm --filter @workspace/api-portal run dev
```

### 8.5 构建

```bash
pnpm --filter @workspace/api-server run build
PORT=24927 BASE_PATH=/ pnpm --filter @workspace/api-portal run build
```

> 前端 build 同样要求 `PORT` 与 `BASE_PATH`。

### 8.6 类型检查

```bash
pnpm run typecheck
```

### 8.7 OpenAPI / client 生成

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 9. 当前限制与注意事项

### 9.1 内存态限制

以下状态当前都只在内存里：

- admin token
- 限流桶

所以：

- 服务重启后 admin token 失效
- 服务重启后限流状态清空
- 多实例之间不会共享这些状态

### 9.2 credits 与推理分离

`openaiDirectKey` 只服务于 credits 查询，不参与主推理代理。

### 9.3 门户与 README 常见误解点

当前真实情况是：

- Dashboard **没有**延迟图表
- Dashboard **没有**可见 credits 卡片
- Chat Test **没有**模型搜索框
- Chat Test **没有**独立 system prompt 输入框
- 明暗主题 **不会**持久化
- `portalApiKey` **不会**单独存到 localStorage

### 9.4 DB 包是脚手架，不是主链路依赖

`lib/db` 目前是预置基础设施，不是当前代理主流程的运行依赖。

---

## 10. 本次 README 维护更新点

本次按当前代码修正了以下内容：

1. **模型数量修正为 27 个**，不是旧文档里的 28 个
2. **`/api/healthz` 响应修正为 `{ "status": "ok" }`**
3. **补充 `/api/credits` 与 `/v1/credits` 的实际能力**
4. **修正 Dashboard 描述**：去掉未实现的延迟/统计/可见余额卡片
5. **修正 Chat Test 描述**：去掉未实现的搜索框与 system prompt
6. **修正主题持久化描述**：当前仅语言持久化，主题不持久化
7. **修正默认凭据描述**：当前默认值来自代码中的 `admin999 / admin999`
8. **补齐 shared libs、mockup-sandbox、docs、scripts 的模块说明**
9. **补齐本地运行所需 `PORT` / `BASE_PATH` 环境要求**
10. **把功能点改为按模块归档，便于后续继续维护 README**

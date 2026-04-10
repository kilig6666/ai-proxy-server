# replit2-by-kilig

> **by kilig** — V6.0

一个面向 OpenAI / Anthropic / Gemini / OpenRouter 的统一 AI 代理服务。

当前仓库提供两块核心能力：

1. **后端代理服务**：对外暴露 `/v1` 兼容接口，负责鉴权、模型路由、协议转换、流式转发、限流、超时与重试。
2. **管理门户**：提供登录、连接信息查看、在线聊天测试、模型浏览、运行时配置修改、Usage 统计，以及当前品牌化 UI（`replit2-by-kilig`、自定义 logo / favicon、GitHub 跳转按钮）。

这版 README 已按 **2026-04-10 当前代码** 重新校对，重点把最近新增但尚未写全的模块、接口、模型矩阵、门户页面能力与品牌化改动一并补齐。

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
replit2-by-kilig
├─ /v1/*      统一代理入口
│  ├─ /models
│  ├─ /credits
│  ├─ /chat/completions
│  ├─ /messages
│  ├─ /messages/count_tokens
│  └─ /responses
│
├─ /v1/v1/*   Anthropic SDK 双 /v1 兼容入口
│
├─ /api/*     管理门户 API
│  ├─ /healthz
│  ├─ /config/login
│  ├─ /config/logout
│  ├─ /config/settings
│  ├─ /sync-models
│  ├─ /credits
│  └─ /usage
│
└─ Portal     React + Vite 管理界面
   ├─ Dashboard
   ├─ Chat Test
   ├─ Models
   ├─ Settings
   └─ Usage
```

### 1.2 当前运行定位

这个项目不是“单纯转发一个 OpenAI key”的极简中转。

它当前已经具备：

- 四家上游统一入口：OpenAI / Anthropic / Gemini / OpenRouter
- OpenAI Chat / Responses、Anthropic Messages / count_tokens、Gemini generateContent 之间的适配转换
- Thinking / Reasoning 统一抽象与模型后缀覆盖
- 视觉输入统一收集、校验、远程抓图与跨协议转换
- 管理员门户登录、配置写盘、模型同步、Usage 统计
- OpenAI credits 查询链路
- 启动时与运行时的模型同步缓存机制
- Monorepo 形式的共享 spec / zod / client / db 基建

## 2. 当前功能总览

### 2.1 代理层能力

- 统一使用 `/v1` 对外暴露 AI 能力
- 支持四家 provider：OpenAI / Anthropic / Gemini / OpenRouter
- 根据模型名前缀自动路由
  - `gpt-*` / `o*` → OpenAI
  - `claude-*` → Anthropic
  - `gemini-*` → Gemini
  - `provider/model` → OpenRouter
- 支持：
  - 流式输出（SSE）
  - 非流式 JSON 输出
  - Tool Calls / Tool Use 转换
  - Thinking / Reasoning 配置映射
  - sampling 参数规范化
  - OpenAI Responses API 透传
  - Anthropic Messages API 透传
  - Anthropic count_tokens
  - 图片输入 / 远程图片 URL / data URL / base64 转换
  - credits 查询
  - usage 记录落盘与聚合

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
- Chat Test 直接走真实 `/v1/chat/completions`，支持文本流式和图片生成模型非流式预览
- Models 页面展示精选静态模型 + 上游实时模型同步结果
- Settings 页面实时修改：
  - `proxyApiKey`
  - 门户密码
  - OpenAI Direct Key（仅用于 credits 查询）
- Usage 页面展示 token 汇总、按 provider 统计、最近请求明细
- 中英双语切换
- 明暗主题切换
- 门户品牌化：`replit2-by-kilig`、`by kilig`、GitHub 图标跳转、自定义 logo / favicon / 页面标题

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
- 启动后立即执行一次 `syncAllModels()`
- 启动同步完成时按 provider 输出模型数量日志

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
- Claude 4.6 才会走 `thinking.type=adaptive` + `output_config.effort`
- Claude 4.5 / 4.1 会自动回退到 budget thinking，不再下发 `output_config.effort`

#### sampling 参数规范化

当前有显式兼容逻辑：

- Anthropic：
  - `temperature` 与 `top_p` 同时出现时，会丢弃 `top_p`
  - 开启 thinking 时，若 `temperature != 1`，会自动归一化到 `1`
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
  - 读取当前运行配置概览
- `POST /api/config/settings`
  - 更新 `proxyApiKey`
  - 更新 `portalPassword`
  - 更新 `openaiDirectKey`
  - 立即写入 `config.json`
- `GET /api/sync-models`
  - 读取模型同步缓存
  - 缓存为空时会现场执行一次同步
- `POST /api/sync-models`
  - 强制重新向各上游同步模型列表
- `GET /api/credits`
  - 管理员态 credits 查询接口
- `GET /api/usage`
  - 返回 usage 汇总与最近请求记录

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

OpenAI billing / credits 查询模块。

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

- base URL 逻辑：
  - 用真实 OpenAI key 时固定走 `https://api.openai.com`
  - 只有兜底走 integration key 时，才复用 `AI_INTEGRATIONS_OPENAI_BASE_URL`

注意：这个 key **仅用于 credits 查询**，不是主代理推理的统一上游配置。

#### 3.1.8 `src/lib/model-catalog.ts`

模型注册表。

负责维护：

- 模型 ID
- provider 归属
- `owned_by`
- 支持路由
- thinking 能力模式
- vision 能力开关

这也是 `/v1/models` 与门户“精选模型”区的真实来源之一。

#### 3.1.9 `src/lib/vision.ts`

视觉输入统一处理层。

负责：

- 识别三条入口的图片输入：
  - Chat：`image_url`
  - Messages：`image`
  - Responses：`input_image`
- 解析 `data:` URL / 远程图片 URL / Anthropic base64 块
- 统一校验 MIME 类型、图片大小（默认 10MB）与请求超时（默认 15 秒）
- 对 Gemini 目标模型生成 `inlineData`
- 为日志补充 vision 输入摘要

#### 3.1.10 `src/lib/model-sync.ts`

上游模型同步与缓存层。

负责：

- 启动时预填三大 provider 的静态 fallback 列表
- 优先尝试从 OpenAI / Anthropic / Gemini / OpenRouter 实时拉模型
- 对 OpenAI / Anthropic / Gemini：拉取失败时回退静态列表
- 对 OpenRouter：优先拉官方公开模型列表
- 维护内存缓存 `_cache`
- 每 30 分钟自动重同步一次

门户 `Models` 页面与启动日志都会用到这里。

#### 3.1.11 `src/lib/thinking.ts`

Thinking / Reasoning 统一抽象层。

负责：

- 解析模型后缀
- 提取不同协议中的 thinking 配置
- effort / budget 之间的映射
- 构造 OpenAI / Anthropic / Gemini 的目标字段
- 自动剥离不支持 thinking 的模型字段
- 聚合 reasoning 文本
- 统一优先级：**模型后缀 > 请求体 > 默认能力**

#### 3.1.12 `src/lib/sampling.ts`

统一采样参数规范化。

职责很清晰：

- provider 级兼容处理
- 丢弃不支持字段
- 生成 adjustments 日志元信息

#### 3.1.13 `src/lib/usage-log.ts`

Usage 统计持久化模块。

负责：

- 把每次代理调用的 token / 延迟信息追加到 `usage-log.json`
- 默认最多保留最近 1000 条记录
- 服务启动时从磁盘回读最近记录
- 聚合：
  - 总请求数
  - Prompt / Completion / Total tokens
  - cachedRequests
  - 按 provider 分组统计
- 为 `/api/usage` 与门户 `Usage` 页面提供数据源

#### 3.1.14 `src/lib/logger.ts`

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
- Usage
- 中英双语文案
- 明暗主题配色
- 自定义品牌元素（logo / title / favicon / GitHub 按钮）

#### 3.2.2 登录流程

- 登录接口：`POST /api/config/login`
- 登录成功后保存：
  - `portalToken` 到 `localStorage`
  - `portalLang` 到 `localStorage`
- 应用启动时会自动用 `portalToken` 调 `GET /api/config/settings` 做会话恢复
- 未登录态右上角会显示：
  - `V6.0`
  - `by kilig`
  - GitHub 图标跳转按钮
- 页面启动时会动态设置：
  - `document.title = replit2-by-kilig`
  - favicon = `scripts/src/图片.jpg`

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
- 文本模型走流式 SSE
- 图片生成模型走非流式 JSON，并支持直接下载返回图片
- 401 时自动尝试刷新最新 `proxyApiKey`
- 如果管理员会话已失效，会强制重新登录
- 可从 Models 页点击跳转并带入模型

当前**没有**的能力：

- 独立 system prompt 输入框
- 多会话历史持久化

#### 3.2.5 Models 页面

当前真实能力：

- 上半区展示静态“精选模型”卡片
- 下半区通过 `/api/sync-models` 展示上游实时模型
- 支持 provider 过滤 pills
- 支持搜索上游模型 ID / 名称
- 支持手动刷新并强制重新同步
- OpenRouter 区域按 `ownedBy` 子 provider 再分组
- 每个精选模型卡片都可一键跳到 Chat Test

#### 3.2.6 Settings 页面

当前可修改：

- `proxyApiKey`
- 门户密码
- `openaiDirectKey`

其中：

- `openaiDirectKey` 仅用于 credits 查询
- 如果 `OPENAI_DIRECT_KEY` 已由环境变量注入，则页面显示“已通过环境变量配置”，不再允许手填覆盖
- 页面支持把已保存的 `openaiDirectKey` 清空

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

#### 3.2.8 Usage 页面

当前真实能力：

- 请求 `/api/usage` 拉 usage 汇总
- 展示总请求数 / Prompt / Completion / Total Token 汇总卡片
- 按 provider 分组展示 token 消耗
- 展示最近请求表格（时间、模型、provider、token、延迟）
- 支持手动刷新

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

- 独立 Vite mockup / sandbox 工程
- 自带 `dev / build / preview / typecheck`
- 更像设计 / 原型实验区
- 不在当前 API Server + Portal 主运行链路中

#### 3.4.2 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/docs`

- 当前已沉淀 5 篇优化文档：
  - `00-index.md`
  - `01-architecture-roadmap.md`
  - `02-sampling-parameter-compat.md`
  - `03-anthropic-cache-control-sanitizer.md`
  - `04-thinking-adapter.md`
- 主要记录项目对标、问题分析与后续重构方向
- 不属于运行时代码

#### 3.4.3 `/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server/scripts`

- `post-merge.sh`
  - 执行 `pnpm install --frozen-lockfile`
  - 执行数据库 push（给 `lib/db` 预留）
- `src/hello.ts`
  - 最小示例脚本
- `src/图片.jpg`
  - 当前门户 logo / favicon 资源

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
│   │   │       ├── model-sync.ts
│   │   │       ├── sampling.ts
│   │   │       ├── thinking.ts
│   │   │       ├── usage-log.ts
│   │   │       └── vision.ts
│   │   └── config.json            # 运行时写盘配置（git ignore）
│   ├── api-portal/                 # React + Vite 门户
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── main.tsx
│   │       └── index.css
│   └── mockup-sandbox/             # 原型/实验区
├── lib/
│   ├── api-client-react/           # 生成 React Query client
│   ├── api-spec/                   # OpenAPI 规范
│   ├── api-zod/                    # 生成 Zod schema
│   └── db/                         # Drizzle DB 脚手架（当前未接主链路）
├── docs/                           # 设计/优化文档
├── scripts/                        # 工程辅助脚本与门户 logo 资源
│   ├── post-merge.sh
│   └── src/
│       ├── hello.ts
│       └── 图片.jpg
├── package.json                    # workspace 根脚本
├── pnpm-workspace.yaml
└── README.md
```

---

## 5. 模型与能力矩阵

### 5.1 当前模型总数

当前静态模型目录 `PROXY_MODEL_CATALOG` 一共收录 **43 个**模型：

- OpenAI：**16**
- Anthropic：**6**
- Gemini：**5**
- OpenRouter：**16**

> 说明：这里统计的是后端 `src/lib/model-catalog.ts` 里的**静态功能目录**，它决定 `/v1/models` 与门户“精选模型”区。门户“上游实时模型”区的数据则来自 `/api/sync-models`，数量可能和这里不同。

### 5.2 OpenAI（16 个）

| 模型 ID | 路由 | Vision | Thinking |
|---|---|---|---|
| `gpt-5.4` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `gpt-5.2` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `gpt-5.1` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `gpt-5` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `gpt-5-mini` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `gpt-5-nano` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `o4-mini` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `o3` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `o3-mini` | `/v1/chat/completions` `/v1/responses` | 不支持 | 支持 |
| `gpt-4.1` | `/v1/chat/completions` `/v1/responses` | 支持 | 不支持 |
| `gpt-4.1-mini` | `/v1/chat/completions` `/v1/responses` | 支持 | 不支持 |
| `gpt-4.1-nano` | `/v1/chat/completions` `/v1/responses` | 支持 | 不支持 |
| `gpt-4o` | `/v1/chat/completions` `/v1/responses` | 支持 | 不支持 |
| `gpt-4o-mini` | `/v1/chat/completions` `/v1/responses` | 支持 | 不支持 |
| `gpt-5.3-codex` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |
| `gpt-5.2-codex` | `/v1/chat/completions` `/v1/responses` | 支持 | 支持 |

### 5.3 Anthropic（6 个）

| 模型 ID | 路由 | Vision | Thinking |
|---|---|---|---|
| `claude-opus-4-6` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `claude-opus-4-5` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `claude-opus-4-1` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `claude-sonnet-4-6` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `claude-sonnet-4-5` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `claude-haiku-4-5` | `/v1/chat/completions` `/v1/messages` | 支持 | 不支持 |

### 5.4 Gemini（5 个）

| 模型 ID | 路由 | Vision | Thinking |
|---|---|---|---|
| `gemini-3.1-pro-preview` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `gemini-3-pro-preview` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `gemini-3-flash-preview` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `gemini-2.5-pro` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |
| `gemini-2.5-flash` | `/v1/chat/completions` `/v1/messages` | 支持 | 支持 |

### 5.5 OpenRouter（16 个）

| 模型 ID | 路由 | Vision | Thinking |
|---|---|---|---|
| `meta-llama/llama-4-maverick` | `/v1/chat/completions` | 支持 | 不支持 |
| `meta-llama/llama-4-scout` | `/v1/chat/completions` | 支持 | 不支持 |
| `meta-llama/llama-3.3-70b-instruct` | `/v1/chat/completions` | 不支持 | 不支持 |
| `meta-llama/llama-3.1-8b-instruct` | `/v1/chat/completions` | 不支持 | 不支持 |
| `deepseek/deepseek-r1` | `/v1/chat/completions` | 不支持 | 不支持 |
| `deepseek/deepseek-chat-v3-0324` | `/v1/chat/completions` | 不支持 | 不支持 |
| `x-ai/grok-3` | `/v1/chat/completions` | 不支持 | 不支持 |
| `x-ai/grok-3-mini` | `/v1/chat/completions` | 不支持 | 不支持 |
| `mistralai/mistral-large-2411` | `/v1/chat/completions` | 不支持 | 不支持 |
| `mistralai/mistral-small-3.1-24b-instruct` | `/v1/chat/completions` | 支持 | 不支持 |
| `mistralai/codestral-2501` | `/v1/chat/completions` | 不支持 | 不支持 |
| `qwen/qwen3-235b-a22b` | `/v1/chat/completions` | 不支持 | 不支持 |
| `qwen/qwen-2.5-72b-instruct` | `/v1/chat/completions` | 不支持 | 不支持 |
| `microsoft/phi-4` | `/v1/chat/completions` | 不支持 | 不支持 |
| `microsoft/phi-4-multimodal-instruct` | `/v1/chat/completions` | 支持 | 不支持 |
| `nvidia/llama-3.1-nemotron-70b-instruct` | `/v1/chat/completions` | 不支持 | 不支持 |

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

- 返回全部 **43** 个静态目录模型
- 响应格式兼容 OpenAI models list
- 数据源是 `src/lib/model-catalog.ts`
- 这和 `/api/sync-models` 的上游实时结果不是同一份数据

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
- 支持图片输入：
  - `messages[].content[].type = "image_url"`
  - `image_url.url` 支持 `data:image/...;base64,...`
  - 对 Gemini 目标模型，也兼容公开 `http(s)` 图片 URL，代理会抓图后转 `inlineData`
- 如果目标模型不支持视觉能力，携带图片输入会提前返回 `400 invalid_request_error`

### `POST /v1/messages`

- Anthropic 原生 Messages 协议入口
- 目标模型不只支持 Claude，也支持 GPT / Gemini
- 代理会做跨协议转换
- 多级代理时支持独立上游 Anthropic 鉴权
- 当最终路由到 Anthropic 且使用手动 budget thinking 时，代理会保证 `max_tokens > thinking.budget_tokens`
- 当最终路由到 Anthropic 时，仅 Claude 4.6 会下发 `output_config.effort`
- 为兼容 Claude Code，若 `tool_choice.type` 为 `any` / `tool`，代理会自动移除 thinking
- 支持透传 `anthropic-beta` 请求头，也支持从请求体 `betas` 读取并转发到上游
- 支持图片输入：
  - `messages[].content[].type = "image"`
  - `source.type = "base64"` 或 `source.type = "url"`
  - 当目标模型是 GPT / Gemini 时，代理会做跨协议图片转换
- 多级代理场景下，最稳的图片输入方式仍然建议使用 `data URL/base64`

### `POST /v1/messages/count_tokens`

- Anthropic 原生 token counting
- 当前只支持 **Anthropic 模型**
- 输入不合法会返回 `400 invalid_request_error`
- 为兼容旧 Anthropic 网关 / 反代，代理不会向 `count_tokens` 上游发送 `output_config`
- 支持透传 `anthropic-beta` 请求头，也支持从请求体 `betas` 读取并转发到上游

### `POST /v1/responses`

- OpenAI Responses API 透传入口
- 当前只支持 **OpenAI 模型**
- 支持 `reasoning.effort`
- 支持模型后缀覆盖 thinking
- 支持图片输入：
  - `input[].content[].type = "input_image"`
  - `image_url` 支持 `data:image/...;base64,...`
- 如果目标模型不支持视觉能力，携带图片输入会提前返回 `400 invalid_request_error`

### 兼容路径 `/v1/v1/*`

- 与 `/v1/*` 走同一套代理逻辑
- 主要用于兼容某些 Anthropic SDK 在 `base_url` 已带 `/v1` 时，再额外拼出 `/v1/v1/messages` 的情况

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
- 返回当前配置概览：
  - `proxyApiKey`
  - `openaiDirectKeySet`
  - `openaiDirectKeyFromEnv`

### `POST /api/config/settings`

- 需要 admin token
- 可更新：
  - `proxyApiKey`
  - `portalPassword`
  - `openaiDirectKey`
- `openaiDirectKey` 传空字符串时会清空本地保存值

### `GET /api/sync-models`

- 需要 admin token
- 返回当前模型同步缓存
- 缓存为空时会先现场执行一次同步
- 响应核心字段：
  - `ok`
  - `synced`
  - `syncedAt`
  - `results[]`
    - `provider`
    - `ok`
    - `source`
    - `count`
    - `error`
    - `models[]`

### `POST /api/sync-models`

- 需要 admin token
- 强制重新向 OpenAI / Anthropic / Gemini / OpenRouter 同步模型
- 响应同样返回 `syncedAt + results[]`

### `GET /api/credits`

- 需要 admin token
- 功能与 `/v1/credits` 类似
- 主要供门户轮询使用
- 若未配置 OpenAI credits key，会返回：

```json
{ "needs_key": true, "error": "..." }
```

### `GET /api/usage`

- 需要 admin token
- 支持可选查询参数：`limit`
  - 默认 `200`
  - 最大 `1000`
- 返回：
  - `summary`
  - `entries`
- `summary.byProvider` 会按 provider 聚合请求数与 token 消耗

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
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic 上游 API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini 上游 base URL |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini 上游 API key |
| `AI_INTEGRATIONS_OPENROUTER_BASE_URL` | OpenRouter 上游 base URL |
| `AI_INTEGRATIONS_OPENROUTER_API_KEY` | OpenRouter 上游 API key |
| `REPLIT_DEV_DOMAIN` | OpenRouter 请求头里的 `HTTP-Referer` 来源 |
| `USAGE_LOG_PATH` | usage 日志文件路径，默认 `process.cwd()/usage-log.json` |
| `LOG_LEVEL` | Pino 日志级别 |
| `NODE_ENV` | 影响日志输出与构建模式 |
| `DATABASE_URL` | 仅 `lib/db` / drizzle push 相关脚手架使用，非主代理链路必填项 |

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

说明：

- 根 `preinstall` 会强制要求使用 **pnpm**
- 会自动清理误提交的 `package-lock.json / yarn.lock`

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
- Models 页**有**搜索框、provider 过滤和手动同步按钮
- Models 页同时有两份数据：
  - 静态“精选模型”来自 `model-catalog.ts`
  - 上游实时模型来自 `/api/sync-models`
- Usage 页**已经存在**，不是待实现
- Chat Test **没有**独立 system prompt 输入框
- Chat Test **没有**多会话历史持久化
- 明暗主题 **不会**持久化
- `portalApiKey` **不会**单独存到 localStorage
- 门户品牌已切到 **replit2-by-kilig**，logo / favicon 来源是 `scripts/src/图片.jpg`

### 9.4 DB 包是脚手架，不是主链路依赖

`lib/db` 目前是预置基础设施，不是当前代理主流程的运行依赖。

---

## 10. 本次 README 维护更新点

### V6.0 README 同步补充

本轮主要不是改后端协议，而是把 README 补齐到**当前仓库真实状态**：

1. **项目品牌信息补齐**
   - README 标题同步为 `replit2-by-kilig`
   - 补充门户当前 logo / favicon / GitHub 按钮说明
2. **模型矩阵改为当前真实静态目录**
   - 模型总数从旧文档的 **27** 更新为当前 `PROXY_MODEL_CATALOG` 的 **43**
   - 新增 **OpenRouter（16 个）** 矩阵
3. **补齐遗漏的后端模块说明**
   - `vision.ts`
   - `model-sync.ts`
   - `usage-log.ts`
4. **补齐遗漏的门户页面能力**
   - Models 页的搜索 / 过滤 / 强制同步
   - Usage 页的统计与表格
   - Chat Test 的图片生成模型非流式处理
5. **补齐遗漏的 `/api` 接口**
   - `GET /api/sync-models`
   - `POST /api/sync-models`
   - `GET /api/usage`
6. **补齐运行环境变量**
   - OpenRouter 上游配置
   - `REPLIT_DEV_DOMAIN`
   - `USAGE_LOG_PATH`
   - `DATABASE_URL` 的脚手架用途说明
7. **修正文档中的旧结论**
   - “只有三家 provider” → 实际已包含 OpenRouter
   - “Models 页只有静态分组” → 实际还有上游实时同步区
   - “Usage 页未实现” → 实际已实现并挂到导航


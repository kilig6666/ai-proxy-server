# ai-proxy-server 全面优化方案（对标 CLIProxyAPI）

## 1. 文档目的

基于对以下两个项目的并行探索：

- 当前项目：`/Users/lvzhentao/gitee-learn/注册机/ai-proxy-server`
- 对标项目：`/Users/lvzhentao/gitee-learn/CPAP-mine/CLIProxyAPI`

沉淀一份适合 `ai-proxy-server` 的**全方面优化方案**。目标不是照搬 `CLIProxyAPI`，而是吸收其在**配置体系、provider 抽象、Codex/Claude/OpenAI 兼容层、可观测性、管理能力**上的优点，在保持当前项目“轻量、易部署、门户直观”的前提下，制定一条**最小可演进、可分阶段落地**的升级路线。

---

## 2. 当前项目事实基线

### 2.1 当前项目已经具备的能力

当前项目核心能力集中在：

- `artifacts/api-server/src/routes/proxy.ts`
- `artifacts/api-server/src/lib/config.ts`
- `artifacts/api-server/src/routes/config.ts`
- `artifacts/api-server/src/lib/logger.ts`
- `artifacts/api-server/src/lib/credits.ts`
- `artifacts/api-portal/src/App.tsx`

现状特征：

1. 已提供统一 `/v1` 代理面：
   - `GET /v1/models`
   - `POST /v1/chat/completions`
   - `POST /v1/messages`
   - `POST /v1/responses`
   - `GET /v1/credits`

2. 已具备多 provider 协议转换能力：
   - OpenAI Chat Completions
   - Anthropic Messages
   - Gemini Generate Content

3. 已有基础健壮性设计：
   - 单例 SDK client
   - 指数退避重试
   - `AbortController` 超时
   - 内存级限流
   - SSE keepalive
   - 结构化日志脱敏

4. 已有一个可用的 Web 门户：
   - 登录
   - 查看 proxy key
   - 测试聊天
   - 修改设置
   - 查询 OpenAI credits

### 2.2 当前项目的主要问题

虽然功能已能跑通，但当前实现存在明显“单文件集中 + 配置过薄 + 文档与代码漂移”的问题：

1. **配置体系过薄**
   - `config.json` 仅存：`proxyApiKey / portalPassword / openaiDirectKey`
   - OpenAI / Anthropic / Gemini 的真实上游配置仍主要依赖环境变量
   - 没有独立的 Codex、Claude、OpenAI compat 配置层

2. **代理核心过于集中**
   - `artifacts/api-server/src/routes/proxy.ts` 同时承担：
     - 鉴权
     - 限流
     - provider 选择
     - 协议转换
     - SSE 输出
     - 错误处理
     - 模型列表维护
   - 文件体积已明显超出可维护阈值

3. **模型管理是硬编码**
   - `/v1/models` 直接写死模型数组
   - 实际支持能力、模型别名、Responses 能力、provider 特性没有表驱动管理

4. **Codex 支持不独立**
   - 当前所谓 Codex 主要体现为：
     - `gpt-5.3-codex`
     - `gpt-5.2-codex`
     - `/v1/responses` 透传
   - 仍然没有真正的 Codex 专属配置、header 策略、transport 策略

5. **配置语义不清晰**
   - `openaiDirectKey` 仅用于余额查询，不参与主代理推理
   - 用户容易误解成“这是 OpenAI 主上游 key”

6. **状态与限流均为内存态**
   - Admin token 重启失效
   - 限流数据重启失效
   - 不利于后续扩展或多实例部署

7. **文档与代码存在偏差**
   - README 中关于“上游 key 谁持有”的表述，与当前真实代码行为有不一致

---

## 3. 对标项目 CLIProxyAPI 的可借鉴优点

本次重点参考的文件包括：

- `config.example.yaml`
- `internal/config/config.go`
- `internal/runtime/executor/openai_compat_executor.go`
- `internal/runtime/executor/claude_executor.go`
- `internal/runtime/executor/codex_executor.go`
- `internal/runtime/executor/codex_websockets_executor.go`
- `sdk/api/handlers/openai/openai_handlers.go`
- `sdk/api/handlers/openai/openai_responses_handlers.go`
- `internal/watcher/clients.go`
- `internal/api/server.go`

### 3.1 借鉴点总结

CLIProxyAPI 最值得吸收的，不是它的“大而全”，而是它在以下 10 个维度上的成熟设计：

1. **配置 schema 清晰**：provider 配置是正式的一等公民
2. **单 provider 支持多 credential**：具备优先级、prefix、proxy、headers
3. **模型是表驱动**：可配置 alias、排除、能力信息
4. **加载时就做 sanitize**：无效配置启动时即被剔除
5. **默认请求头可独立配置**：Claude / Codex 各自维护 header defaults
6. **handler / executor / translator 分层**：HTTP 路由不直接承载所有协议细节
7. **Responses API 独立处理**：不是“chat/completions 顺便兼容一下”
8. **Codex transport 可升级**：支持 websocket，失败可回落 HTTP
9. **可观测性更完整**：请求、响应、usage、升级失败、配置变化都有记录
10. **管理 API 更完整**：配置项支持结构化读写，不靠手改文件

### 3.2 明确不建议照搬的部分

以下内容不适合当前项目直接照搬：

1. 全套 OAuth / auth file / 多账户体系
2. watcher 热同步 + 本地文件合成机制
3. TUI 与复杂管理后台能力
4. 过度仿真 Claude Code 的指纹/签名策略
5. 长生命周期 websocket 会话管理的整套复杂状态机

**结论：**
`ai-proxy-server` 应走“**轻量入口 + 结构化配置 + 分层执行 + 强可观测**”路线，而不是升级成一个 CLIProxyAPI 式的平台型产品。

---

## 4. 总体优化原则

本项目建议遵循以下 6 条总原则：

1. **保留轻量部署体验**
   - 继续支持当前低门槛启动方式
   - 不引入重型依赖，不强制上数据库

2. **优先拆结构，不优先堆功能**
   - 第一优先级是把 `proxy.ts` 拆成可维护结构
   - 不是继续往单文件堆 case

3. **配置先行，逻辑后移**
   - 先把 provider、model、headers、能力矩阵配置化
   - 再谈 Codex 深化支持

4. **文档与代码同源**
   - 让模型注册表 / provider 配置成为 README 的事实来源

5. **观测先于扩展**
   - 在继续扩模型、扩 provider 前，先把日志、错误分类、usage 打稳

6. **分阶段升级，避免一次性重构**
   - 按 P0 / P1 / P2 三阶段落地
   - 每阶段均可单独交付和回滚

---

## 5. 目标架构（建议态）

建议把当前后端按以下方式收敛：

```text
api-server
├─ src/app.ts
├─ src/routes/
│  ├─ proxy/
│  │  ├─ index.ts            # /v1 路由入口，只做鉴权/分发
│  │  ├─ models.ts           # /v1/models
│  │  ├─ chat.ts             # /v1/chat/completions
│  │  ├─ messages.ts         # /v1/messages
│  │  └─ responses.ts        # /v1/responses
│  └─ config.ts
├─ src/providers/
│  ├─ openai/
│  │  ├─ client.ts
│  │  ├─ executor.ts
│  │  └─ headers.ts
│  ├─ anthropic/
│  │  ├─ client.ts
│  │  ├─ executor.ts
│  │  ├─ headers.ts
│  │  └─ tooling.ts
│  ├─ gemini/
│  │  ├─ client.ts
│  │  ├─ executor.ts
│  │  └─ tooling.ts
│  └─ codex/
│     ├─ executor.ts
│     ├─ headers.ts
│     └─ transport.ts
├─ src/translators/
│  ├─ openai-anthropic/
│  ├─ anthropic-openai/
│  ├─ openai-gemini/
│  └─ responses/
├─ src/config/
│  ├─ schema.ts
│  ├─ loader.ts
│  ├─ sanitizer.ts
│  └─ defaults.ts
├─ src/models/
│  ├─ registry.ts
│  └─ catalog.ts
├─ src/observability/
│  ├─ logger.ts
│  ├─ usage.ts
│  ├─ request-log.ts
│  └─ error-map.ts
└─ src/auth/
   ├─ proxy-auth.ts
   ├─ admin-auth.ts
   └─ rate-limit.ts
```

### 核心变化

- `routes` 只保留 HTTP 层职责
- `providers` 负责与上游服务交互
- `translators` 负责协议双向转换
- `config` 负责结构化加载与校验
- `models` 负责模型表和能力矩阵
- `observability` 负责日志、usage、错误统一出口

---

## 6. 分模块优化方案

## 6.1 配置体系升级（P0）

### 现状问题

当前 `config.json` 过于扁平，无法表达以下信息：

- provider 是否启用
- provider 上游 base URL
- provider API key 来源
- header defaults
- 模型别名
- 模型黑白名单
- Responses / native messages / websocket 能力

### 建议方案

把当前配置体系升级为“**运行配置 + provider 配置 + 模型配置**”三层。

### 推荐配置形态

为了兼容当前 Node/TS 项目和最小改动，**第一阶段不强制切 YAML**，建议继续使用 JSON，但使用 schema 驱动。

建议演进为：

```json
{
  "auth": {
    "proxyApiKey": "***",
    "portalPassword": "***"
  },
  "billing": {
    "openaiCreditsApiKey": ""
  },
  "providers": {
    "openai": {
      "enabled": true,
      "baseUrl": "${AI_INTEGRATIONS_OPENAI_BASE_URL}",
      "apiKeyEnv": "AI_INTEGRATIONS_OPENAI_API_KEY",
      "responsesEnabled": true,
      "headers": {},
      "models": []
    },
    "anthropic": {
      "enabled": true,
      "baseUrl": "${AI_INTEGRATIONS_ANTHROPIC_BASE_URL}",
      "apiKeyEnv": "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
      "headerDefaults": {
        "anthropicVersion": "2023-06-01"
      },
      "models": []
    },
    "gemini": {
      "enabled": true,
      "baseUrl": "${AI_INTEGRATIONS_GEMINI_BASE_URL}",
      "apiKeyEnv": "AI_INTEGRATIONS_GEMINI_API_KEY",
      "models": []
    },
    "codex": {
      "enabled": false,
      "inherits": "openai",
      "responsesOnly": true,
      "headerDefaults": {},
      "transport": {
        "mode": "http"
      }
    }
  },
  "routing": {
    "modelStrategy": "registry",
    "fallbackOrder": []
  }
}
```

### 同时解决的痛点

1. `openaiDirectKey` 改名为 `billing.openaiCreditsApiKey`
2. 主代理 key 与 credits key 语义彻底拆开
3. provider 配置从环境变量“隐式存在”变成“显式可见”
4. 后续增加 Codex 专属 header / transport 时有安放位置

### 实施建议

- 使用现有 TypeScript 能力做 schema 校验
- 配置加载顺序明确为：
  1. defaults
  2. config 文件
  3. env 覆盖
  4. sanitize
- 启动时打印“生效配置摘要”，但脱敏

---

## 6.2 模型注册表升级（P0）

### 现状问题

当前 `/v1/models` 是硬编码数组，导致：

- 文档和代码容易漂移
- 模型能力无法复用
- 无法表达 alias / provider / route capability

### 建议方案

引入 `models/catalog.ts` + `models/registry.ts`。

### 建议字段

每个模型至少表达：

- `id`
- `provider`
- `ownedBy`
- `protocols`（chat / messages / responses）
- `supportsTools`
- `supportsStreaming`
- `supportsReasoning`
- `routeType`（openai / anthropic / gemini / codex）
- `aliasOf`（可选）
- `status`（stable / preview / deprecated）

### 直接收益

1. `/v1/models` 不再硬编码
2. `/v1/chat/completions`、`/v1/messages`、`/v1/responses` 都从统一 registry 决策
3. README 模型表可以由 registry 自动导出
4. 后续可以方便接入模型过滤、模型分组、能力标记

---

## 6.3 provider 执行层拆分（P0）

### 现状问题

`routes/proxy.ts` 同时处理：

- provider 判断
- 请求参数转换
- 上游调用
- SSE 输出
- 错误映射

这会让后续扩展 Codex/Claude 时风险很高。

### 建议方案

抽成统一执行接口：

```ts
interface ProviderExecutor {
  supports(model: string, protocol: "chat" | "messages" | "responses"): boolean;
  execute(input: ProxyExecutionInput): Promise<ProxyExecutionResult>;
  executeStream?(input: ProxyExecutionInput): Promise<ReadableStream | AsyncIterable<unknown>>;
}
```

### 第一阶段至少拆为 4 个 executor

1. `OpenAIExecutor`
2. `AnthropicExecutor`
3. `GeminiExecutor`
4. `CodexExecutor`

### 路由层职责收敛为

1. 鉴权
2. 请求协议识别
3. 查模型 registry
4. 选 executor
5. 写回 HTTP 响应

**收益：**
后续新增 provider 或改单个 provider，不再冒着改坏整条 `/v1` 主链的风险。

---

## 6.4 OpenAI 反代能力升级（P1）

### 当前项目现状

当前 OpenAI 相关能力有两块：

1. `chat/completions` 通过 OpenAI SDK
2. `responses` 直接 fetch 到环境变量 base URL

### 问题

1. Chat 和 Responses 处理路径不一致
2. 没有 OpenAI-compatible provider 抽象
3. 无法优雅支持 OpenRouter / NewAPI / 其他兼容上游

### 建议方案

参考 CLIProxyAPI 的 `OpenAICompatibility` 思路，但做轻量版：

- 新增 `openaiCompatProviders` 配置段
- 每个 compat provider 支持：
  - `name`
  - `baseUrl`
  - `apiKeyEnv`
  - `headers`
  - `models`
  - `priority`

### 目标能力

1. 当前 OpenAI 官方上游继续可用
2. 后续如需接 OpenRouter，可不改主逻辑
3. `/v1/chat/completions` 与 `/v1/responses` 可共享同一套 compat executor
4. 对误发 payload 做统一识别与转换

### 建议边界

- 第一阶段先支持单 compat provider
- 不做多 key 轮询
- 不做复杂 failover
- 先把抽象打对

### 补充：采样参数兼容修复（新增）

#### 当前真实问题

用户提供的报错已经说明，当前项目在采样参数处理上存在两个直接缺口：

1. **Anthropic 分支会同时透传 `temperature` 和 `top_p`**
   - 当前 `artifacts/api-server/src/routes/proxy.ts` 中：
     - `POST /v1/chat/completions` 的 Anthropic 分支会同时写入 `anthropicParams.temperature` 与 `anthropicParams.top_p`
     - `POST /v1/messages` 的 Anthropic 原生分支也会同时透传 `body.temperature` 与 `body.top_p`
   - 这会触发你现在碰到的报错：
     - `temperature and top_p cannot both be specified for this model`

2. **`frequency_penalty` / `presence_penalty` 目前没有统一兼容策略**
   - OpenAI 分支会原样透传这两个字段
   - Anthropic / Gemini 分支当前没有统一归一化逻辑
   - 结果是：客户端虽然传了参数，但不同 provider 的行为并不一致

#### 建议修复方向

增加一个统一的 `sampling normalizer`，在进入 provider executor 之前先做参数兼容裁剪。

建议新增模块：

- `src/translators/common/sampling.ts`
- `src/models/capabilities.ts`

#### 统一处理规则建议

1. **统一接收以下 4 个输入参数**
   - `temperature`
   - `top_p`
   - `frequency_penalty`
   - `presence_penalty`

2. **按 provider / protocol / model capability 做归一化**
   - OpenAI：按原语义透传
   - Anthropic：增加冲突裁剪规则，避免同时发送 `temperature` 和 `top_p`
   - Gemini：建立显式映射或显式丢弃策略，不再“静默半支持”

3. **冲突裁剪策略建议**
   - 当目标 provider / model 不允许同时传 `temperature` 和 `top_p` 时：
     - 优先保留用户显式指定的非默认值
     - 若两者都显式传入，则采用固定优先级并记录日志
   - 推荐默认优先级：
     1. `temperature`
     2. `top_p`
   - 同时返回结构化调试日志：
     - 哪个字段被保留
     - 哪个字段被丢弃
     - 原因是什么

4. **不支持字段的策略要显式化**
   - 对某些 provider 不支持的 `frequency_penalty` / `presence_penalty`：
     - 不要默默忽略
     - 应在内部日志中记录 `unsupported_sampling_param`
     - 门户后续可在请求诊断页提示“已忽略”

#### 建议纳入交付项

把下面内容并入 P1：

1. 统一采样参数归一化器
2. Provider 能力矩阵（是否支持 `temperature/top_p/frequency_penalty/presence_penalty`）
3. 冲突参数裁剪日志
4. 对 Anthropic `/chat/completions` 与 `/messages` 两条链路的回归测试

---

## 6.5 Claude API 支持升级（P1）

### 当前项目现状

当前 Anthropic/Claude 支持已经有较重的工具调用双向转换能力，但仍存在几个问题：

1. Claude 默认头策略为空
2. 没有独立的 Claude header policy
3. `/messages` 与 `/chat/completions` 转换逻辑耦合在同一文件
4. 错误、SSE、tool delta 的处理未模块化

### 建议方案

#### 方案 1：先做“轻量 header defaults”

新增 `anthropic.headerDefaults`，支持配置：

- `anthropic-version`
- `timeout`
- `user-agent`（可选）
- `beta`（可选）

> 注意：这里只做“兼容性增强”，**不建议第一阶段模仿 Claude Code 指纹**。

#### 方案 2：把转换模块拆出

至少拆成：

- `translators/openai-anthropic/request.ts`
- `translators/anthropic-openai/response.ts`
- `translators/openai-anthropic/stream.ts`
- `translators/anthropic-openai/stream.ts`

#### 方案 3：明确工具调用状态机

需要把以下逻辑抽成稳定单元：

- OpenAI `tools` -> Anthropic `tools`
- OpenAI `tool_choice` -> Anthropic `tool_choice`
- assistant `tool_calls` -> `tool_use`
- role `tool` -> `tool_result`
- SSE `input_json_delta` -> OpenAI 增量 tool arguments

### 目标效果

- `chat/completions` 调 Claude 时更稳
- `/messages` 与 `/chat/completions` 共享转换模块
- 后续补测试更容易

### 补充：Anthropic `cache_control` 清洗修复（新增）

#### 当前真实问题

你给出的第二个报错：

- `system.2.cache_control.***.scope: Extra inputs are not permitted`

和当前代码事实是对得上的。

当前 `artifacts/api-server/src/routes/proxy.ts` 的 `POST /v1/messages` 在 Anthropic 原生分支中：

- `body.system` 直接赋给 `anthropicParams.system`
- `body.messages` 直接赋给 `anthropicParams.messages`
- 没有针对 `cache_control` 做 schema 级清洗

这意味着只要客户端传入了某些上游不接受的 `cache_control` 扩展字段（例如 `scope`），代理就会把它原样透传给上游，最终触发 400。

#### 建议修复方向

新增一个 Anthropic 请求清洗器，在所有进入 Anthropic upstream 的请求前统一执行。

建议新增模块：

- `src/translators/anthropic/sanitize.ts`

#### 具体修复建议

1. **对白名单字段做 schema 清洗**
   - 遍历以下位置：
     - `system`
     - `messages[*].content[*]`
     - `tools`
   - 对 `cache_control` 只保留当前代理明确支持的字段
   - 对未知字段（如 `scope`）直接删除，不再透传

2. **区分两条入口统一处理**
   - `POST /v1/chat/completions` → OpenAI 转 Anthropic
   - `POST /v1/messages` → Anthropic 原生输入
   - 两条链都必须走同一个 sanitizer，而不是各写一套

3. **加入严格日志**
   - 记录：
     - 删除了哪些字段
     - 位于哪条路径
     - 原因是 `unsupported_anthropic_field`

4. **建议增加“严格模式/兼容模式”开关**
   - 兼容模式：自动删除未知字段并继续请求
   - 严格模式：请求进入代理时就直接返回明确错误，指出非法字段路径
   - 默认建议先用兼容模式，减少线上 400

#### 建议纳入交付项

把下面内容并入 P1：

1. Anthropic payload sanitizer
2. `cache_control` 白名单清洗
3. 原生 `/messages` 与转换 `/chat/completions` 共用清洗逻辑
4. 针对 `system[*].cache_control` 的回归测试

---

## 6.6 Codex 专项优化（P1）

### 当前项目现状

当前项目没有真正的 Codex 专项配置，只是：

- 在模型表里列了 `gpt-5.3-codex` / `gpt-5.2-codex`
- `/v1/responses` 仅允许 OpenAI 模型

### 建议定位

对当前项目而言，Codex 更适合定义为：

> “以 OpenAI Responses 为主协议，但允许未来扩展专属 header / transport 的一个 provider profile”。

### 建议分两步走

#### 第一步：逻辑独立，但 transport 仍是 HTTP

引入 `CodexExecutor`，但初始只是包 OpenAI Responses 调用。

能力包括：

- 独立 model capability 标记
- 独立 header defaults
- 独立错误收口
- 独立日志命名空间

#### 第二步：预留 websocket transport 开关

参考 CLIProxyAPI，但先只留接口：

- `transport.mode = http | websocket`
- 默认 `http`
- websocket 不在第一阶段落地

### 这样做的好处

1. 不把 Codex 再继续混在 OpenAI 普通 chat 逻辑里
2. 后续若真实需要 websocket，可平滑演进
3. 当前不引入复杂会话状态管理风险

---

## 6.7 统一可观测性升级（P1）

### 当前项目已有基础

- `pino`
- `pino-http`
- Authorization/Cookie 脱敏
- provider 维度日志

### 仍需补足

建议新增以下观测维度：

1. **请求摘要日志**
   - requestId
   - protocol
   - model
   - provider
   - stream
   - clientIp
   - latencyMs
   - finishReason

2. **上游请求摘要日志**
   - baseUrl（脱敏）
   - provider
   - path
   - timeout
   - retryCount

3. **错误分类**
   - authentication_error
   - invalid_request_error
   - upstream_timeout
   - upstream_rate_limit
   - upstream_bad_gateway
   - stream_protocol_error
   - translator_error

4. **usage 统一记录**
   - prompt_tokens
   - completion_tokens
   - total_tokens
   - provider
   - model

5. **配置变更日志**
   - 谁改了 portalPassword / proxyApiKey / provider config
   - 改了哪些字段
   - 是否立即生效

### 推荐输出形式

- 继续使用结构化 JSON 日志
- 门户后续只展示摘要，不直接展示原始敏感值

---

## 6.8 鉴权与安全优化（P1）

### 当前问题

1. Admin token 为内存态
2. proxy key / admin key 语义边界不够清晰
3. 限流 key 计算较粗

### 建议方案

#### 1）鉴权分层

- `proxyApiKey`：给调用方访问 `/v1/*`
- `adminToken`：给门户访问 `/api/config/*`
- 后续可预留 `opsToken`：给内部运维接口

#### 2）限流 key 更稳

按以下优先级生成桶 key：

- Bearer token hash
- x-api-key hash
- fallback: client ip + route

#### 3）管理态 token 更清晰

- 至少记录 token issuedAt / expiresAt
- 后续可切到 signed token 或轻量持久化

#### 4）配置脱敏更彻底

门户和日志中统一走 masking 工具，不让 `baseUrl/apiKey/header` 各自手写脱敏。

---

## 6.9 门户优化（P2）

当前门户体验其实已经不错，但建议围绕“配置可见性”补强，而不是继续堆展示。

### 建议新增页签或区块

1. **Provider 概览**
   - OpenAI / Anthropic / Gemini / Codex 是否启用
   - baseUrl 来源（env/config）
   - key 是否已配置
   - 支持的协议

2. **模型注册表**
   - 按 provider 分组显示
   - 标明 chat / messages / responses 能力
   - 标明 alias / preview / codex

3. **配置诊断**
   - 当前哪些 env 缺失
   - 哪些配置已从文件生效
   - 哪些字段仅影响 credits，不影响主代理

4. **请求日志摘要**
   - 最近 N 次请求
   - provider / model / status / latency / tokens

### 注意边界

- 门户只做“配置与诊断”，不做复杂多账户管理
- 不建议直接照搬 CLIProxyAPI 的管理中心思路

---

## 6.10 测试体系补齐（P1）

当前项目的最大隐患之一，是代理转换逻辑虽然复杂，但缺少明确测试层。

### 至少补 4 类测试

1. **translator 单测**
   - OpenAI -> Anthropic
   - Anthropic -> OpenAI
   - OpenAI -> Gemini
   - Responses payload 识别与转换

2. **streaming 单测**
   - Claude tool_use 增量 -> OpenAI tool_calls chunk
   - Gemini functionCall -> OpenAI tool_calls chunk
   - usage chunk 是否按预期输出

3. **route 集成测试**
   - `/v1/chat/completions`
   - `/v1/messages`
   - `/v1/responses`

4. **config 测试**
   - env 覆盖
   - sanitize
   - 无效配置拒绝

### 测试优先级建议

先写转换测试，再写 route 测试。  
因为当前最大风险不是 UI，而是协议转换回归。

---

## 7. 推荐落地路线图

## P0：先把基础结构打正（建议先做）

### 目标

- 不增加新 provider
- 不新增 websocket
- 不动门户大逻辑
- 先把配置、模型、执行分层打出来

### 交付项

1. 配置 schema + sanitize
2. 模型 registry
3. `proxy.ts` 拆分为 routes + executors + translators
4. `openaiDirectKey` 语义改名
5. README 配置章节修正

### 预期收益

- 主文件显著瘦身
- 文档与代码对齐
- 后续增加 Codex/Compat 不会继续堆单文件

---

## P1：补齐 provider 能力和观测

### 目标

- 让 OpenAI / Anthropic / Codex 都有独立 provider 配置语义
- 把 usage / error / logs 拉齐

### 交付项

1. OpenAI compat provider 抽象
2. Claude header defaults
3. Codex 独立 executor（先 HTTP）
4. 统一采样参数归一化器（含 `temperature/top_p/frequency_penalty/presence_penalty`）
5. Anthropic payload sanitizer（含 `cache_control` 非法字段清洗）
6. 错误分类模块
7. usage 统一记录
8. translator 单测

### 预期收益

- 可维护性提升
- 故障排查更快
- 为后续真正接 Codex 专项能力打基础

---

## P2：门户与高级能力完善

### 目标

- 提升自解释能力
- 增强运维可见性

### 交付项

1. Provider 概览页
2. 模型注册表展示
3. 配置诊断页
4. 最近请求摘要
5. 可选的轻量配置导出/导入

### 注意

P2 不应早于 P0/P1。  
否则只是在 UI 层继续包装一个结构还没站稳的后端。

---

## 8. 风险与应对

### 风险 1：拆分过程中引入协议回归

**应对：** 先补 translator 单测，再开始拆执行层。

### 风险 1.1：采样参数归一化改变现有输出风格

**应对：** 记录冲突裁剪日志，并用固定优先级策略，避免同一模型今天裁 `temperature`、明天裁 `top_p`。

### 风险 1.2：`cache_control` 清洗误删客户端期望字段

**应对：** 第一阶段使用兼容模式，删除未知字段同时打日志；待确认稳定后，再考虑严格模式。

### 风险 2：配置升级影响现有部署

**应对：** 保留旧 `config.json` 兼容读取一段时间，新增字段给默认值。

### 风险 3：Codex 方案过早复杂化

**应对：** 第一阶段仅做 HTTP 版 `CodexExecutor`，websocket 只预留接口，不落实现。

### 风险 4：门户与服务端配置语义再次漂移

**应对：** 门户展示数据只从服务端配置接口读取，不在前端自行拼接含义。

---

## 9. 最终建议

## 推荐主路线

**推荐采用：**

> 保留当前项目的轻量形态，吸收 CLIProxyAPI 的“结构化配置 + executor/translator 分层 + 统一观测”优点，分两步完成后端重构，再补门户增强。

## 不推荐路线

**不推荐：**

1. 继续在 `routes/proxy.ts` 上打补丁
2. 一次性引入多账户 / OAuth / watcher / websocket 全套机制
3. 先做门户花活，再补后端结构
4. 把 `openaiDirectKey` 继续当成一个语义含混的杂项字段保留下去

---

## 10. 建议的实施顺序

1. 先修配置语义与 README
2. 再做模型 registry
3. 再拆 executor / translator
4. 再抽 Claude/Codex/OpenAI compat 的 provider 层
5. 最后做门户增强和日志可视化

---

## 11. 一句话总结

当前 `ai-proxy-server` 最需要的，不是继续“加功能”，而是把现有 OpenAI / Claude / Gemini / Responses 这套已经不轻的能力，升级成一套**配置清晰、职责分离、可观测、可持续迭代**的代理架构；而 `CLIProxyAPI` 最值得借鉴的正是这套结构，不是它的平台体量。

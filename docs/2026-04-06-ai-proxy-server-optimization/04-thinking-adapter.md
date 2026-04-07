# Thinking 全链路适配

## 本轮新增能力

- 统一支持以下 Thinking / Reasoning 输入：
  - `reasoning_effort`
  - `reasoning.effort`
  - `thinking.*`
  - `output_config.effort`
  - `generationConfig.thinkingConfig`
- 支持模型后缀覆盖：
  - `model(none|auto|minimal|low|medium|high|xhigh|max|8192)`
- 优先级固定为：**后缀 > 请求体 > 默认**
- 不支持 Thinking 的模型自动剥离，不直接报错

## 三条入口的行为

### `/v1/chat/completions`

- 接收 OpenAI 风格 `reasoning_effort`
- 路由到 Claude 时映射到 `thinking` / `output_config.effort`
- 路由到 Gemini 时映射到 `generationConfig.thinkingConfig`
- Claude / Gemini 返回的 thinking 内容，会尽量回填到 OpenAI 风格 `reasoning_content`

### `/v1/messages`

- 原生支持 Claude `thinking.*` / `output_config.effort`
- 目标为 OpenAI / Codex 时，自动转为 `reasoning_effort`
- 目标为 Gemini 时，自动转为 `generationConfig.thinkingConfig`
- OpenAI / Gemini 返回时，尽量回填为 Claude 风格 `thinking` 内容块

### `/v1/responses`

- 保持 OpenAI Responses 透传
- 进入 upstream 前统一处理：
  - 去掉模型后缀
  - 归一化 `reasoning.effort`
  - 清理多余 Thinking 字段

## 模型能力表（本轮实现）

- OpenAI：`gpt-5*`、`o*`、`gpt-5.*-codex`
- Anthropic：`claude-opus-4-*`、`claude-sonnet-4-*`
- Gemini：当前暴露的 `gemini-3*`、`gemini-2.5*`
- 显式不支持：`gpt-4.1*`、`gpt-4o*`、`claude-haiku-4-5`

## 日志字段

- `thinkingSource`
- `thinkingAppliedFor`
- `thinkingStripped`
- `thinkingReason`

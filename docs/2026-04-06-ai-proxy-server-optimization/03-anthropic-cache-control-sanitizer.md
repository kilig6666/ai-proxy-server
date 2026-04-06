# Anthropic cache_control 清洗修复

## 当前问题

当前 `/v1/messages` 的 Anthropic 原生分支对 `system` 和 `messages` 透传过重，
未对 `cache_control` 做 schema 级清洗。

会触发类似报错：

```json
{"error":{"type":"api_error","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"system.2.cache_control.***.scope: Extra inputs are not permitted\"}}"}}
```

## 修复目标

在所有进入 Anthropic upstream 的请求前，统一清洗非法字段。

## 建议实现

### 新增 sanitizer

建议新增：

- `artifacts/api-server/src/lib/anthropic-sanitize.ts`

职责：

1. 遍历：
   - `system`
   - `messages[*].content[*]`
   - `tools`
2. 处理 `cache_control`
3. 删除 Anthropic 当前不接受的扩展字段，如：
   - `scope`

### 两条入口统一走同一套逻辑

1. `/v1/chat/completions` -> OpenAI 转 Anthropic 后清洗
2. `/v1/messages` -> Anthropic 原生请求进入 upstream 前清洗

## 模式建议

### 兼容模式（默认）

- 自动删除非法字段
- 继续请求
- 打日志 `unsupported_anthropic_field`

### 严格模式（后续可选）

- 代理层直接返回错误
- 明确指出非法字段路径

## 最小验收标准

1. `cache_control.scope` 不再导致上游 400
2. 两条 Anthropic 入口行为一致
3. 清洗动作可在日志中追踪

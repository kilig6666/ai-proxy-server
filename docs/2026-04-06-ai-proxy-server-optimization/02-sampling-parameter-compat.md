# 采样参数兼容修复

## 当前问题

当前项目对采样参数存在两类问题：

1. Anthropic 分支会同时透传 `temperature` 与 `top_p`
2. `frequency_penalty` / `presence_penalty` 只有 OpenAI 分支支持，Anthropic / Gemini 没有统一策略

这会直接触发：

```json
{"error":{"message":"... `temperature` and `top_p` cannot both be specified for this model ..."}}
```

## 修复目标

统一支持以下入参：

- `temperature`
- `top_p`
- `frequency_penalty`
- `presence_penalty`

并按 provider / protocol / model capability 做归一化。

## 建议实现

### 新增统一归一化层

建议新增：

- `artifacts/api-server/src/lib/sampling.ts`

职责：

1. 接收原始请求参数
2. 根据目标 provider 输出兼容后的参数
3. 记录被忽略/被裁剪的字段

### 推荐规则

#### OpenAI

- 保留：
  - `temperature`
  - `top_p`
  - `frequency_penalty`
  - `presence_penalty`

#### Anthropic

- 不允许同时发送 `temperature` 和 `top_p`
- 推荐冲突裁剪优先级：
  1. `temperature`
  2. `top_p`
- 对不支持的 `frequency_penalty` / `presence_penalty`：
  - 不透传
  - 打内部日志 `unsupported_sampling_param`

#### Gemini

- `temperature` / `top_p` 按 Gemini 支持字段映射
- `frequency_penalty` / `presence_penalty` 若无稳定映射，则不透传并打日志

## 最小验收标准

1. Anthropic 不再因为同时传 `temperature` + `top_p` 报 400
2. 4 个字段在不同 provider 上的处理结果可预测
3. 日志能看出哪些字段被丢弃或裁剪

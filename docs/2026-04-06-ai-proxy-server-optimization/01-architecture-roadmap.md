# 架构与路线图

## 目标

保留当前项目轻量部署体验，同时吸收 CLIProxyAPI 在以下方面的优点：

- 结构化配置
- executor / translator 分层
- 模型注册表
- 统一日志与错误收口
- 可扩展的 Codex / Claude / OpenAI compat 边界

## 目标架构

```text
routes -> registry -> executor -> translator -> upstream
                     \-> observability
```

建议逐步拆成：

- `routes/proxy/*`
- `providers/*`
- `translators/*`
- `config/*`
- `models/*`
- `observability/*`
- `auth/*`

## P0

1. 配置 schema + sanitize
2. 模型 registry
3. 拆分 `proxy.ts`
4. `openaiDirectKey` 语义改名
5. README 修正

## P1

1. OpenAI compat provider 抽象
2. Claude header defaults
3. Codex 独立 executor（先 HTTP）
4. 采样参数归一化器
5. Anthropic payload sanitizer
6. 错误分类
7. usage 统一记录

## P2

1. Provider 概览
2. 模型注册表展示
3. 配置诊断
4. 请求日志摘要

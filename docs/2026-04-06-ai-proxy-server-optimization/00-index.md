# ai-proxy-server 优化方案拆分索引

## 文档说明

原始总方案文档位于：

- `docs/2026-04-06-ai-proxy-server-optimization-plan.md`

为便于并行开发与收尾集成，拆分为以下专题文档：

1. `01-architecture-roadmap.md`
   - 总体目标架构
   - 配置体系升级
   - provider / translator / executor 分层
   - P0 / P1 / P2 路线图

2. `02-sampling-parameter-compat.md`
   - `temperature`
   - `top_p`
   - `frequency_penalty`
   - `presence_penalty`
   - provider 能力矩阵与冲突裁剪策略

3. `03-anthropic-cache-control-sanitizer.md`
   - Anthropic payload sanitizer
   - `cache_control` 白名单清洗
   - `/v1/chat/completions` 与 `/v1/messages` 共用清洗逻辑

## 并行开发建议分工

### Worktree A

目标：采样参数兼容修复

对应文档：

- `02-sampling-parameter-compat.md`

### Worktree B

目标：Anthropic `cache_control` 清洗修复

对应文档：

- `03-anthropic-cache-control-sanitizer.md`

### 主线程

目标：

- 负责文档拆分
- 最后整合两个 worktree 的改动
- 做最小必要验证
- 统一收尾

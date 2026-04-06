# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### API Server (`artifacts/api-server`)
Express.js backend serving at `/api` and `/v1`.

- `/api/healthz` — health check
- `/v1/models` — list available models (requires Bearer token)
- `/v1/chat/completions` — OpenAI-compatible chat completions (supports GPT + Claude models, streaming, tool calls)
- `/v1/messages` — Anthropic native Messages API (supports Claude + GPT models, streaming, tool use)

**Dependencies**: `openai@^6`, `@anthropic-ai/sdk@^0.82`

**Auth**: All `/v1` endpoints require `Authorization: Bearer $PROXY_API_KEY`

**Model routing**: 
- `gpt-*` / `o*` prefix → OpenAI client (`AI_INTEGRATIONS_OPENAI_BASE_URL`)
- `claude-*` prefix → Anthropic client (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL`)

### API Portal (`artifacts/api-portal`)
Dark/light-themed React + Vite frontend at `/` with:
- **Login page** — password gate using `/api/config/login`, token stored in localStorage
- **Dashboard tab** — live server status, connection details (dynamic proxyApiKey), endpoints, models, curl example
- **Chat Test tab** — model selector (OpenAI/Anthropic/Gemini grouped), streaming chat via `/v1/chat/completions`
- **Settings tab** — change PROXY_API_KEY and portal password via `/api/config/settings`

### Config System (`artifacts/api-server/src/lib/config.ts`)
Runtime config stored in `artifacts/api-server/config.json` (gitignored).

- `getConfig()` — returns `{ proxyApiKey, portalPassword }`
- `updateConfig(partial)` — updates and persists config
- Admin tokens: `createAdminToken()`, `validateAdminToken()`, `revokeAdminToken()`
- Defaults: `proxyApiKey` from `PROXY_API_KEY` env (fallback `981115`), `portalPassword` from `PORTAL_PASSWORD` env (fallback `admin123`)

### Config API (`/api/config/*`)
- `POST /api/config/login` — verify portal password, return 24h admin token
- `POST /api/config/logout` — revoke admin token
- `GET /api/config/settings` — get proxyApiKey (admin token required)
- `POST /api/config/settings` — update proxyApiKey and/or portalPassword (admin token required)

## Key Secrets

- `PROXY_API_KEY` — Default Bearer token (overridden by config.json after first write)
- `PORTAL_PASSWORD` — Default portal login password (overridden by config.json)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` — Auto-provisioned by Replit AI Integrations
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Auto-provisioned by Replit AI Integrations
- `SESSION_SECRET` — General session secret

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

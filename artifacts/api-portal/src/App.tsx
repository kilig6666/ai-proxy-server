import { useState, useEffect, useCallback, useRef } from "react";
import { Github } from "lucide-react";
import { useIsMobile } from "./hooks/use-mobile";

const PROJECT_NAME = "replit2-by-kilig";
const PROJECT_AUTHOR = "by kilig";
const PROJECT_REPO_URL = "https://github.com/kilig6666/ai-proxy-server";
const PROJECT_VERSION = "V6.0";
const PROJECT_TAGLINE = "OpenAI · Anthropic · Gemini · OpenRouter";
const PROJECT_LOGO_URL = new URL("../../../scripts/src/图片.jpg", import.meta.url).href;

/* ─────────────────────────────────────────────
   Apple-quality colour system
   Light: apple.com light palette
   Dark:  apple.com dark palette
───────────────────────────────────────────── */
const DARK: Record<string, string> = {
  bg:         "#000000",
  bgCard:     "#1c1c1e",
  bgInput:    "#2c2c2e",
  bgHover:    "#38383a",
  border:     "rgba(255,255,255,0.10)",
  borderFocus:"rgba(41,151,255,0.80)",
  text:       "#f5f5f7",
  textMuted:  "#98989d",
  textDim:    "#636366",
  green:      "#30d158",
  red:        "#ff453a",
  blue:       "#2997ff",
  blueDark:   "rgba(41,151,255,0.15)",
  purple:     "#bf5af2",
  purpleDark: "rgba(191,90,242,0.15)",
  orange:     "#ff9f0a",
  orangeDark: "rgba(255,159,10,0.15)",
  cyan:       "#5ac8fa",
  gray:       "#636366",
  grayDark:   "#2c2c2e",
  emerald:    "#30d158",
  emeraldDark:"rgba(48,209,88,0.15)",
  gradientA:  "#2997ff",
  gradientB:  "#2997ff",
  shadow:     "0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)",
  shadowHover:"0 2px 8px rgba(0,0,0,0.5), 0 16px 32px rgba(0,0,0,0.35)",
};

const LIGHT: Record<string, string> = {
  bg:         "#f5f5f7",
  bgCard:     "#ffffff",
  bgInput:    "#f2f2f7",
  bgHover:    "#e5e5ea",
  border:     "rgba(0,0,0,0.08)",
  borderFocus:"rgba(0,102,204,0.60)",
  text:       "#1d1d1f",
  textMuted:  "#6e6e73",
  textDim:    "#aeaeb2",
  green:      "#28cd41",
  red:        "#ff3b30",
  blue:       "#0066cc",
  blueDark:   "rgba(0,102,204,0.08)",
  purple:     "#8944ab",
  purpleDark: "rgba(137,68,171,0.08)",
  orange:     "#bf5900",
  orangeDark: "rgba(191,89,0,0.08)",
  cyan:       "#007aff",
  gray:       "#8e8e93",
  grayDark:   "#f2f2f7",
  emerald:    "#34c759",
  emeraldDark:"rgba(52,199,89,0.08)",
  gradientA:  "#0066cc",
  gradientB:  "#0066cc",
  shadow:     "0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)",
  shadowHover:"0 2px 8px rgba(0,0,0,0.08), 0 16px 32px rgba(0,0,0,0.06)",
};

/* ─────────────────────────────────────────────
   i18n
───────────────────────────────────────────── */
const T_CN = {
  loading: "加载中...",
  loginSubtitle: "请输入密码以继续",
  loginLabel: "访问密码",
  loginPlaceholder: "输入密码...",
  loginErrorPwd: "密码错误，请重试",
  loginErrorNet: "连接服务器失败，请稍后重试",
  loginBtn: "进入面板",
  loginLoading: "验证中...",
  logout: "退出",
  online: "在线", offline: "离线", checking: "检查中...",
  tabDashboard: "Dashboard", tabChat: "聊天测试", tabModels: "模型列表", tabSettings: "设置", tabUsage: "用量",
  connDetails: "连接详情",
  proxyKeyHint: (k: string) => `当前 PROXY_API_KEY: ${k} · 可在"设置"页签修改`,
  apiEndpoints: "API 端点",
  availableModels: "可用模型",
  setupGuide: "CherryStudio 配置指南",
  quickTest: "快速测试 (curl)",
  curlLabel: "curl 示例 — Gemini 模型",
  copyCmd: "复制命令",
  copyUrl: "复制 URL",
  copied: "已复制",
  copy: "复制",
  notePrefix: "注意：",
  footerPowered: "由",
  footerVia: "驱动，通过",
  footerSuffix: "· Express.js 反向代理 · 无需自备 API Key",
  steps: [
    { title: "打开 CherryStudio 设置", desc: "前往 Settings → Model Providers，点击添加 Provider" },
    { title: "选择 Provider 类型", desc: '聊天/补全选 "OpenAI"，原生消息 API 选 "Anthropic"', note: '"OpenAI" provider 使用 /v1/chat/completions；"Anthropic" provider 使用 /v1/messages。两者均支持全部模型（含 Gemini）。' },
    { title: "配置连接", desc: "Base URL 填写本应用地址，API Key 填写 PROXY_API_KEY 的值" },
    { title: "选择模型开始对话", desc: "GPT/o 系列 → OpenAI，Claude → Anthropic，Gemini → Google，自动路由" },
  ],
  selectModel: "选择模型",
  generating: "生成中...",
  clearChat: "清空", downloadImage: "下载图片",
  chatEmpty: "发送消息开始测试",
  chatEmptySub: (m: string) => `使用 ${m} 模型，通过本代理路由`,
  chatYou: "你",
  chatPlaceholder: "输入消息... (Enter 发送，Shift+Enter 换行)",
  sendBtn: "发送",
  chatUnauth: "API Key 已变更，已自动刷新，请重新发送",
  chatUnauthFail: "会话已过期，正在跳转登录页...",
  chatFail: "请求失败",
  settingsKeyTitle: "API Key 配置",
  settingsKeyDesc: "修改 Proxy API Key 后，所有客户端需使用新 Key 才能访问。",
  settingsKeyLabel: "当前 / 新 PROXY_API_KEY",
  saveKeyBtn: "保存 API Key",
  saving: "保存中...",
  savedOk: "已保存",
  saveFail: "保存失败",
  netError: "网络错误",
  noChange: "未做更改",
  settingsPwdTitle: "修改访问密码",
  settingsPwdDesc: "修改 Portal 登录密码后，下次登录需要使用新密码。",
  newPwdLabel: "新密码",
  newPwdPlaceholder: "输入新密码...",
  confirmPwdLabel: "确认新密码",
  confirmPwdPlaceholder: "再次输入...",
  pwdMismatch: "两次密码不一致",
  updatePwdBtn: "更新密码",
  pwdUpdated: "密码已更新",
  creditsTitle: "账户余额",
  creditsRemaining: "可用余额",
  creditsUsed: "本月消耗",
  creditsTotal: "总 Credits",
  creditsLoading: "获取余额中...",
  creditsError: "余额暂不可用",
  creditsRefresh: "刷新",
  creditsExpires: "到期",
  creditsApiHint: "外部查询接口: GET /v1/credits (使用 proxyApiKey 鉴权)",
  creditsUnavailableNote: "余额查询失败，请检查 API Key 是否正确",
  creditsPartialNote: "部分数据不可用",
  creditsUsedLabel: "已用",
  creditsNeedsKey: "需要配置 OpenAI API Key 才能查询余额。",
  goToSettings: "前往设置",
  settingsOAIKeyTitle: "OpenAI API Key（余额查询）",
  settingsOAIKeyDesc: "填写您的 OpenAI API Key（sk-...），用于查询账户余额及本月用量。此 Key 仅用于计费接口，不影响代理推理请求。",
  settingsOAIKeyLabel: "OpenAI API Key",
  settingsOAIKeyPlaceholder: "sk-...",
  settingsOAIKeyClear: "清除",
  settingsOAIKeySet: "已配置",
  settingsOAIKeyUnset: "未配置",
  settingsOAIKeyFromEnv: "已通过环境变量配置，无需在此填写",
  usageTitle: "Token 消耗统计",
  usageTotalRequests: "总请求数",
  usagePromptTokens: "Prompt Tokens", usageCompletionTokens: "Completion Tokens", usageTotalTokens: "总 Token",
  usageByProvider: "按服务商分组",
  usageRecentTitle: "最近请求", usageNoData: "暂无请求记录",
  usageRefresh: "↻ 刷新",
  usageColTime: "时间", usageColModel: "模型", usageColProvider: "服务商",
  usageColPrompt: "Prompt", usageColCompletion: "Completion", usageColTotal: "Total", usageColLatency: "延迟(ms)",
};

const T_EN = {
  loading: "Loading...",
  loginSubtitle: "Enter your password to continue",
  loginLabel: "Access Password",
  loginPlaceholder: "Enter password...",
  loginErrorPwd: "Invalid password, please try again",
  loginErrorNet: "Failed to connect to server, please retry",
  loginBtn: "Enter Dashboard",
  loginLoading: "Verifying...",
  logout: "Sign Out",
  online: "Online", offline: "Offline", checking: "Checking...",
  tabDashboard: "Dashboard", tabChat: "Chat", tabModels: "Models", tabSettings: "Settings", tabUsage: "Usage",
  connDetails: "Connection Details",
  proxyKeyHint: (k: string) => `Current PROXY_API_KEY: ${k} · Change it in the Settings tab`,
  apiEndpoints: "API Endpoints",
  availableModels: "Available Models",
  setupGuide: "CherryStudio Setup Guide",
  quickTest: "Quick Test (curl)",
  curlLabel: "curl example — Gemini model",
  copyCmd: "Copy command",
  copyUrl: "Copy URL",
  copied: "Copied",
  copy: "Copy",
  notePrefix: "Note: ",
  footerPowered: "Powered by",
  footerVia: "via",
  footerSuffix: "· Express.js reverse proxy · No API keys required",
  steps: [
    { title: "Open CherryStudio Settings", desc: "Go to Settings → Model Providers and click Add Provider" },
    { title: "Choose Provider Type", desc: 'Select "OpenAI" for chat/completions or "Anthropic" for native messages API', note: '"OpenAI" provider uses /v1/chat/completions; "Anthropic" provider uses /v1/messages. Both work with all models including Gemini.' },
    { title: "Configure the Connection", desc: "Set Base URL to your app origin. Set API Key to your PROXY_API_KEY value" },
    { title: "Select a Model and Chat", desc: "Choose any model from the list. GPT/o-series → OpenAI, Claude → Anthropic, Gemini → Google — routed automatically" },
  ],
  selectModel: "Select Model",
  generating: "Generating...",
  clearChat: "Clear", downloadImage: "Download",
  chatEmpty: "Send a message to start",
  chatEmptySub: (m: string) => `Using ${m} · routed through this proxy`,
  chatYou: "You",
  chatPlaceholder: "Message... (Enter to send, Shift+Enter for newline)",
  sendBtn: "Send",
  chatUnauth: "API Key was updated — please resend",
  chatUnauthFail: "Session expired, redirecting...",
  chatFail: "Request failed",
  settingsKeyTitle: "API Key",
  settingsKeyDesc: "After changing the Proxy API Key, all clients must use the new key.",
  settingsKeyLabel: "Current / New PROXY_API_KEY",
  saveKeyBtn: "Save",
  saving: "Saving...",
  savedOk: "Saved",
  saveFail: "Save failed",
  netError: "Network error",
  noChange: "No changes",
  settingsPwdTitle: "Access Password",
  settingsPwdDesc: "After changing the Portal password, you will need the new password on next login.",
  newPwdLabel: "New Password",
  newPwdPlaceholder: "Enter new password...",
  confirmPwdLabel: "Confirm Password",
  confirmPwdPlaceholder: "Re-enter...",
  pwdMismatch: "Passwords do not match",
  updatePwdBtn: "Update Password",
  pwdUpdated: "Password updated",
  creditsTitle: "Account Credits",
  creditsRemaining: "Remaining",
  creditsUsed: "Used This Month",
  creditsTotal: "Total Credits",
  creditsLoading: "Fetching credits...",
  creditsError: "Credits unavailable",
  creditsRefresh: "Refresh",
  creditsExpires: "Expires",
  creditsApiHint: "External API: GET /v1/credits (auth with proxyApiKey)",
  creditsUnavailableNote: "Failed to fetch credits. Check your OpenAI API Key.",
  creditsPartialNote: "partial data unavailable",
  creditsUsedLabel: "used",
  creditsNeedsKey: "An OpenAI API Key is required to query account credits.",
  goToSettings: "Go to Settings",
  settingsOAIKeyTitle: "OpenAI API Key (billing)",
  settingsOAIKeyDesc: "Enter your OpenAI API Key (sk-...) to query account balance and monthly usage.",
  settingsOAIKeyLabel: "OpenAI API Key",
  settingsOAIKeyPlaceholder: "sk-...",
  settingsOAIKeyClear: "Clear",
  settingsOAIKeySet: "Configured",
  settingsOAIKeyUnset: "Not configured",
  settingsOAIKeyFromEnv: "Configured via environment variable — no action needed",
  usageTitle: "Token Usage",
  usageTotalRequests: "Total Requests",
  usagePromptTokens: "Prompt Tokens", usageCompletionTokens: "Completion Tokens", usageTotalTokens: "Total Tokens",
  usageByProvider: "By Provider",
  usageRecentTitle: "Recent Requests", usageNoData: "No requests recorded",
  usageRefresh: "↻ Refresh",
  usageColTime: "Time", usageColModel: "Model", usageColProvider: "Provider",
  usageColPrompt: "Prompt", usageColCompletion: "Completion", usageColTotal: "Total", usageColLatency: "Latency(ms)",
};

type TType = typeof T_CN;
type Lang = "cn" | "en";
type Cap = "stream" | "tools" | "vision" | "reasoning" | "json" | "image";
type ModelMeta = { id: string; note?: string; ctx: string; caps: Cap[]; route: string };

/* ─────────────────────────────────────────────
   Model catalogue
───────────────────────────────────────────── */
const OPENAI_MODELS: ModelMeta[] = [
  { id: "gpt-5.4",        note: "Latest",       ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5.3-codex",  note: "Code",         ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5.2",                               ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5.2-codex",  note: "Code",         ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5.1",                               ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5",          note: "Most capable", ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5-mini",                            ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5-nano",     note: "Fastest",      ctx: "1M",   caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-4.1",        note: "Recommended",  ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4.1-mini",                          ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4.1-nano",   note: "Fast",         ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4o",                                ctx: "128K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4o-mini",                           ctx: "128K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "o4-mini",        note: "Reasoning",    ctx: "200K", caps: ["stream","tools","vision","reasoning"],        route: "/v1/chat/completions" },
  { id: "o3",             note: "Reasoning",    ctx: "200K", caps: ["stream","vision","reasoning"],                route: "/v1/chat/completions" },
  { id: "o3-mini",        note: "Reasoning",    ctx: "200K", caps: ["stream","reasoning"],                        route: "/v1/chat/completions" },
];
const ANTHROPIC_MODELS: ModelMeta[] = [
  { id: "claude-opus-4-6",   note: "Most capable", ctx: "200K", caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-opus-4-5",                          ctx: "200K", caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-opus-4-1",                          ctx: "200K", caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-sonnet-4-6", note: "Recommended",  ctx: "200K", caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-sonnet-4-5",                        ctx: "200K", caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-haiku-4-5",  note: "Fastest",      ctx: "200K", caps: ["stream","tools","vision","json"],             route: "/v1/chat/completions · /v1/messages" },
];
const GEMINI_MODELS: ModelMeta[] = [
  { id: "gemini-3.1-pro-preview",                       ctx: "2M",  caps: ["stream","tools","vision","reasoning"],        route: "/v1/chat/completions · /v1/messages" },
  { id: "gemini-3-pro-preview",                         ctx: "2M",  caps: ["stream","tools","vision","reasoning"],        route: "/v1/chat/completions · /v1/messages" },
  { id: "gemini-3-flash-preview",                       ctx: "1M",  caps: ["stream","tools","vision","reasoning"],        route: "/v1/chat/completions · /v1/messages" },
  { id: "gemini-2.5-pro",   note: "Most capable",      ctx: "2M",  caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  { id: "gemini-2.5-flash", note: "Recommended",       ctx: "1M",  caps: ["stream","tools","vision","json","reasoning"], route: "/v1/chat/completions · /v1/messages" },
  // ── Image generation (direct Gemini API) ────────────────────────────────────
  { id: "gemini-2.0-flash-preview-image-generation", note: "Image Gen", ctx: "—", caps: ["image","vision"], route: "/v1/chat/completions" },
];
const OPENROUTER_MODELS: ModelMeta[] = [
  { id: "meta-llama/llama-4-maverick", note: "Recommended", ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "meta-llama/llama-4-scout",                          ctx: "512K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "meta-llama/llama-3.3-70b-instruct",                ctx: "128K", caps: ["stream","tools","json"],          route: "/v1/chat/completions" },
  { id: "meta-llama/llama-3.1-8b-instruct",  note: "Fast",  ctx: "128K", caps: ["stream","tools","json"],          route: "/v1/chat/completions" },
  { id: "deepseek/deepseek-r1",           note: "Reasoning", ctx: "128K", caps: ["stream","reasoning"],            route: "/v1/chat/completions" },
  { id: "deepseek/deepseek-chat-v3-0324",                    ctx: "64K",  caps: ["stream","tools","json"],          route: "/v1/chat/completions" },
  { id: "x-ai/grok-3",      note: "Most capable", ctx: "131K", caps: ["stream","tools","json"],                   route: "/v1/chat/completions" },
  { id: "x-ai/grok-3-mini", note: "Fast",         ctx: "131K", caps: ["stream","tools","json"],                   route: "/v1/chat/completions" },
  { id: "mistralai/mistral-large-2411",                          ctx: "128K", caps: ["stream","tools","json"],     route: "/v1/chat/completions" },
  { id: "mistralai/mistral-small-3.1-24b-instruct",              ctx: "128K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "mistralai/codestral-2501",              note: "Code",  ctx: "256K", caps: ["stream","json"],             route: "/v1/chat/completions" },
  { id: "qwen/qwen3-235b-a22b",  note: "Most capable", ctx: "40K",  caps: ["stream","tools","json"],              route: "/v1/chat/completions" },
  { id: "qwen/qwen-2.5-72b-instruct",                   ctx: "131K", caps: ["stream","tools","json"],             route: "/v1/chat/completions" },
  { id: "microsoft/phi-4",                                ctx: "16K",  caps: ["stream","tools","json"],            route: "/v1/chat/completions" },
  { id: "microsoft/phi-4-multimodal-instruct",            ctx: "128K", caps: ["stream","tools","vision","json"],  route: "/v1/chat/completions" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct",         ctx: "128K", caps: ["stream","tools","json"],           route: "/v1/chat/completions" },
  // ── Image generation (via OpenRouter) ──────────────────────────────────────
  { id: "google/gemini-2.0-flash-exp:image-generation", note: "Image Gen", ctx: "—", caps: ["image","vision"], route: "/v1/chat/completions" },
  { id: "openai/gpt-image-1",            note: "Image Gen", ctx: "—", caps: ["image","vision"], route: "/v1/chat/completions" },
  { id: "black-forest-labs/flux-1.1-pro", note: "Image Gen", ctx: "—", caps: ["image"], route: "/v1/chat/completions" },
  { id: "black-forest-labs/flux-1-schnell", note: "Fast",  ctx: "—", caps: ["image"], route: "/v1/chat/completions" },
  { id: "recraft-ai/recraft-v3",          note: "Image Gen", ctx: "—", caps: ["image"], route: "/v1/chat/completions" },
  { id: "stabilityai/stable-diffusion-3.5-large", note: "Image Gen", ctx: "—", caps: ["image"], route: "/v1/chat/completions" },
];
const ALL_MODELS = [
  ...OPENAI_MODELS.map((m) => ({ ...m, provider: "OpenAI" as const })),
  ...ANTHROPIC_MODELS.map((m) => ({ ...m, provider: "Anthropic" as const })),
  ...GEMINI_MODELS.map((m) => ({ ...m, provider: "Gemini" as const })),
  ...OPENROUTER_MODELS.map((m) => ({ ...m, provider: "OpenRouter" as const })),
];

const ENDPOINTS = [
  { method: "GET",  path: "/v1/models",            label: "List Models",       type: "Both",      desc: "Returns all available model IDs across OpenAI, Anthropic, Gemini and OpenRouter" },
  { method: "GET",  path: "/v1/credits",           label: "Credits Balance",   type: "Both",      desc: "Query OpenAI account credits balance and this month's usage. Auth with proxyApiKey Bearer token." },
  { method: "POST", path: "/v1/chat/completions",  label: "Chat Completions",  type: "OpenAI",    desc: "OpenAI-compatible chat API. Supports streaming, tool calls, and all models via prefix routing" },
  { method: "POST", path: "/v1/responses",         label: "Responses API",     type: "Responses", desc: "OpenAI Responses API pass-through with suffix reasoning override. Streaming supported." },
  { method: "POST", path: "/v1/messages",          label: "Messages",          type: "Anthropic", desc: "Anthropic native Messages API. Supports streaming, tool use, and all model routing with Thinking adaptation" },
];

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessage = { role: "user" | "assistant"; content: string; images?: string[] };

/* ─────────────────────────────────────────────
   Reusable micro-components
───────────────────────────────────────────── */
function CopyButton({ text, label, C, t }: { text: string; label?: string; C: Record<string, string>; t: TType }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text; el.style.position = "fixed"; el.style.left = "-9999px";
        document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
      }
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }, [text]);
  return (
    <button onClick={handleCopy} style={{
      background: copied ? C.blue : "transparent",
      border: `1px solid ${copied ? C.blue : C.border}`,
      color: copied ? "#fff" : C.textMuted,
      borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 500,
      cursor: "pointer", transition: "all 0.18s", whiteSpace: "nowrap",
      letterSpacing: "-0.01em",
    }}>
      {copied ? `✓ ${t.copied}` : label ?? t.copy}
    </button>
  );
}

function MethodBadge({ method, C }: { method: string; C: Record<string, string> }) {
  const isGet = method === "GET";
  return (
    <span style={{
      background: isGet ? C.emeraldDark : C.blueDark,
      color: isGet ? C.emerald : C.blue,
      borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600,
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      letterSpacing: "0.04em", minWidth: 44, display: "inline-block", textAlign: "center",
    }}>{method}</span>
  );
}

function StatusDot({ online, C, t }: { online: boolean | null; C: Record<string, string>; t: TType }) {
  const color = online === null ? C.orange : online ? C.green : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: color,
        display: "inline-block", flexShrink: 0,
        boxShadow: online ? `0 0 0 2px ${color}30` : "none",
      }} />
      <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 400, letterSpacing: "-0.01em" }}>
        {online === null ? t.checking : online ? t.online : t.offline}
      </span>
    </span>
  );
}

function GithubLinkButton({ C }: { C: Record<string, string> }) {
  return (
    <a
      href={PROJECT_REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Open GitHub project"
      title="GitHub"
      style={{
        width: 32,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        background: C.bgCard,
        color: C.textMuted,
        textDecoration: "none",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <Github size={16} strokeWidth={2} />
    </a>
  );
}

function Section({ title, children, C }: { title: string; children: React.ReactNode; C: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{
        color: C.text, fontSize: 20, fontWeight: 600, marginBottom: 16,
        letterSpacing: "-0.025em", lineHeight: 1.2,
      }}>{title}</h2>
      {children}
    </div>
  );
}

function Card({ children, style, C }: { children: React.ReactNode; style?: React.CSSProperties; C: Record<string, string> }) {
  return (
    <div style={{
      background: C.bgCard, borderRadius: 14, padding: "20px 24px",
      boxShadow: C.shadow, ...style,
    }}>{children}</div>
  );
}

function ModelGroup({ title, models, color, bg, C }: { title: string; models: { id: string; note?: string }[]; color: string; bg: string; C: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
        {models.map((m) => (
          <div key={m.id} style={{
            background: C.bgCard, borderRadius: 10, padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            boxShadow: C.shadow,
          }}>
            <code style={{ fontSize: 12, color: C.text, fontFamily: "'SF Mono','Fira Code',monospace", wordBreak: "break-all", flex: 1 }}>{m.id}</code>
            {m.note && (
              <span style={{ fontSize: 10, color, background: bg, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0, fontWeight: 600, letterSpacing: "0.02em" }}>{m.note}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LangToggle({ lang, setLang, C }: { lang: Lang; setLang: (l: Lang) => void; C: Record<string, string> }) {
  return (
    <div style={{
      display: "flex", background: C.bgInput, borderRadius: 8, overflow: "hidden",
      fontSize: 12, fontWeight: 500, padding: 2, gap: 2,
    }}>
      {(["cn", "en"] as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)} style={{
          padding: "4px 10px",
          background: lang === l ? C.bgCard : "transparent",
          color: lang === l ? C.text : C.textMuted,
          border: "none", cursor: "pointer", transition: "all 0.18s",
          borderRadius: 6, letterSpacing: "0.02em", fontWeight: lang === l ? 500 : 400,
          boxShadow: lang === l ? C.shadow : "none",
        }}>
          {l === "cn" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Login Page — Apple ID quality
───────────────────────────────────────────── */
function LoginPage({ C, t, onLogin, isMobile }: { C: Record<string, string>; t: TType; onLogin: (token: string, proxyApiKey: string, oaiSet?: boolean, oaiFromEnv?: boolean) => void; isMobile: boolean }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/config/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!res.ok) { setError(t.loginErrorPwd); setLoading(false); return; }
      const data = await res.json() as { token: string; proxyApiKey: string; openaiDirectKeySet?: boolean; openaiDirectKeyFromEnv?: boolean };
      onLogin(data.token, data.proxyApiKey, data.openaiDirectKeySet, data.openaiDirectKeyFromEnv);
    } catch { setError(t.loginErrorNet); setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100dvh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif",
      padding: isMobile ? "84px 16px 24px" : "0 24px",
    }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Logo mark */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img
            src={PROJECT_LOGO_URL}
            alt={`${PROJECT_NAME} logo`}
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              margin: "0 auto 20px",
              objectFit: "cover",
              display: "block",
              boxShadow: C.shadow,
              border: `1px solid ${C.border}`,
            }}
          />
          <div style={{ fontWeight: 600, fontSize: 26, color: C.text, letterSpacing: "-0.03em", marginBottom: 6 }}>{PROJECT_NAME}</div>
          <div style={{ fontSize: 15, color: C.textMuted, letterSpacing: "-0.01em" }}>{t.loginSubtitle}</div>
        </div>

        {/* Form card */}
        <div style={{
          background: C.bgCard, borderRadius: 18, padding: "28px 28px 24px",
          boxShadow: C.shadow,
        }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{
                display: "block", fontSize: 13, fontWeight: 500, color: C.textMuted,
                marginBottom: 8, letterSpacing: "-0.01em",
              }}>{t.loginLabel}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.loginPlaceholder}
                autoFocus
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                  width: "100%", background: C.bgInput, border: "none",
                  borderRadius: 10, padding: "11px 14px", fontSize: 15,
                  color: C.text, outline: "none", boxSizing: "border-box",
                  boxShadow: focused ? `0 0 0 3px ${C.borderFocus}` : "none",
                  transition: "box-shadow 0.18s",
                  letterSpacing: password ? "0.05em" : undefined,
                }}
              />
              {error && (
                <div style={{ marginTop: 8, fontSize: 13, color: C.red, letterSpacing: "-0.01em" }}>{error}</div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              style={{
                background: loading || !password ? C.bgInput : C.blue,
                border: "none", borderRadius: 10, padding: "12px",
                fontSize: 15, fontWeight: 500, color: loading || !password ? C.textDim : "#fff",
                cursor: loading || !password ? "not-allowed" : "pointer",
                transition: "all 0.18s", letterSpacing: "-0.01em",
                marginTop: 2,
              }}
            >
              {loading ? t.loginLoading : t.loginBtn}
            </button>
          </form>
        </div>

        {/* Version pill */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: C.textDim, fontWeight: 400,
            letterSpacing: "-0.01em",
          }}>
            <span style={{ fontFamily: "'SF Mono','Fira Code',monospace", color: C.textDim }}>{PROJECT_VERSION}</span>
            <span>{PROJECT_NAME}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Chat Tab
───────────────────────────────────────────── */
function ChatTab({ C, t, proxyApiKey, adminToken, onKeyRefresh, onForceRelogin, initModel, isMobile }: {
  C: Record<string, string>; t: TType; proxyApiKey: string;
  adminToken: string; onKeyRefresh: (k: string) => void; onForceRelogin: () => void;
  initModel?: string | null;
  isMobile: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(initModel ?? "gemini-2.5-flash");
  useEffect(() => { if (initModel) setSelectedModel(initModel); }, [initModel]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const proxyApiKeyRef = useRef(proxyApiKey);
  useEffect(() => { proxyApiKeyRef.current = proxyApiKey; }, [proxyApiKey]);

  const providerColor = (p: string) => p === "OpenAI" ? C.blue : p === "Anthropic" ? C.orange : p === "OpenRouter" ? C.purple : C.emerald;
  const providerBg = (p: string) => p === "OpenAI" ? C.blueDark : p === "Anthropic" ? C.orangeDark : p === "OpenRouter" ? C.purpleDark : C.emeraldDark;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const isImageGenModel = (m: string) => {
    const meta = ALL_MODELS.find((x) => x.id === m);
    if (meta) return meta.caps.includes("image");
    return /image/i.test(m);
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput(""); setError(""); setStreaming(true);

    const imageGen = isImageGenModel(selectedModel);
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    const handleUnauth = async (): Promise<boolean> => {
      const settingsRes = await fetch("/api/config/settings", { headers: { "Authorization": `Bearer ${adminToken}` } });
      if (settingsRes.ok) {
        const data = await settingsRes.json() as { proxyApiKey: string };
        onKeyRefresh(data.proxyApiKey); proxyApiKeyRef.current = data.proxyApiKey;
        setError(t.chatUnauth); setMessages(newMessages); setStreaming(false); return true;
      } else {
        setError(t.chatUnauthFail); setMessages(newMessages); setStreaming(false);
        setTimeout(onForceRelogin, 1500); return true;
      }
    };

    try {
      if (imageGen) {
        // Non-streaming path for image generation models
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${proxyApiKeyRef.current}` },
          body: JSON.stringify({ model: selectedModel, messages: newMessages, stream: false }),
        });
        if (res.status === 401) { await handleUnauth(); return; }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: { message?: string } };
          setError(errData?.error?.message ?? `HTTP ${res.status}`);
          setMessages(newMessages); setStreaming(false); return;
        }
        const data = await res.json() as { choices?: { message?: { content?: string | ContentPart[] } }[] };
        const raw = data.choices?.[0]?.message?.content ?? "";
        let text = ""; const imgs: string[] = [];
        if (typeof raw === "string") {
          text = raw;
        } else if (Array.isArray(raw)) {
          for (const part of raw as ContentPart[]) {
            if (part.type === "text") text += part.text;
            else if (part.type === "image_url") imgs.push(part.image_url.url);
          }
        }
        setMessages([...newMessages, { role: "assistant", content: text, images: imgs }]);
      } else {
        // Streaming path for text models
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${proxyApiKeyRef.current}` },
          body: JSON.stringify({ model: selectedModel, messages: newMessages, stream: true }),
        });
        if (res.status === 401) { await handleUnauth(); return; }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: { message?: string } };
          setError(errData?.error?.message ?? `HTTP ${res.status}`);
          setMessages(newMessages); setStreaming(false); return;
        }
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");
        let accumulated = ""; let sseBuffer = "";
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n"); sseBuffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const chunk = line.slice(6).trim(); if (chunk === "[DONE]") continue;
            try {
              const parsed = JSON.parse(chunk) as { choices?: { delta?: { content?: string } }[] };
              const delta = parsed.choices?.[0]?.delta?.content ?? "";
              accumulated += delta; setMessages([...newMessages, { role: "assistant", content: accumulated }]);
            } catch { /* ignore partial SSE */ }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.chatFail); setMessages(newMessages);
    } finally { setStreaming(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const selectedInfo = ALL_MODELS.find((m) => m.id === selectedModel);

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, height: isMobile ? "auto" : "calc(100vh - 58px)", minHeight: isMobile ? 0 : 500 }}>
      {/* Model selector sidebar */}
      <div style={{
        width: isMobile ? "100%" : 200, flexShrink: 0, display: "flex", flexDirection: isMobile ? "row" : "column",
        gap: isMobile ? 12 : 2, overflowX: isMobile ? "auto" : "hidden", overflowY: isMobile ? "hidden" : "auto", paddingRight: isMobile ? 0 : 4, paddingBottom: isMobile ? 4 : 0,
      }}>
        {!isMobile && (
          <div style={{
            fontSize: 10, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, paddingLeft: 8,
          }}>{t.selectModel}</div>
        )}
        {(["OpenAI", "Anthropic", "Gemini", "OpenRouter"] as const).map((provider) => (
          <div key={provider} style={{ flexShrink: 0, minWidth: isMobile ? 148 : undefined }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: providerColor(provider),
              textTransform: "uppercase", letterSpacing: "0.08em",
              padding: "6px 8px 3px", marginTop: 6,
            }}>{provider}</div>
            {ALL_MODELS.filter((m) => m.provider === provider).map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: selectedModel === m.id ? providerBg(provider) : "transparent",
                  borderTop: "none", borderRight: "none", borderBottom: "none",
                  borderLeft: `3px solid ${selectedModel === m.id ? providerColor(provider) : "transparent"}`,
                  borderRadius: "0 8px 8px 0",
                  padding: "5px 8px 5px 10px", cursor: "pointer", marginBottom: 1,
                  color: selectedModel === m.id ? providerColor(provider) : C.textMuted,
                  fontSize: 11, fontFamily: "'SF Mono','Fira Code',monospace",
                  transition: "all 0.15s", letterSpacing: "-0.01em",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {m.id}
                  {m.caps.includes("image") && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                </span>
                {m.note && (
                  <span style={{
                    display: "block", fontSize: 9, fontFamily: "system-ui",
                    color: selectedModel === m.id ? providerColor(provider) : C.textDim,
                    marginTop: 1, letterSpacing: "0.02em", fontWeight: 500,
                  }}>{m.note}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Chat panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: C.bgCard, borderRadius: 16, overflow: "hidden",
          boxShadow: C.shadow,
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            {selectedInfo && (
              <span style={{
                background: providerBg(selectedInfo.provider),
                color: providerColor(selectedInfo.provider),
                borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>{selectedInfo.provider}</span>
            )}
            <code style={{
              fontSize: 13, color: C.text,
              fontFamily: "'SF Mono','Fira Code',monospace",
              letterSpacing: "-0.01em",
            }}>{selectedModel}</code>
            {streaming && (
              <span style={{ fontSize: 12, color: C.blue, marginLeft: "auto", letterSpacing: "-0.01em" }}>
                {t.generating}
              </span>
            )}
            {messages.length > 0 && !streaming && (
              <button
                onClick={() => { setMessages([]); setError(""); }}
                style={{
                  marginLeft: "auto", background: "transparent", border: "none",
                  borderRadius: 6, padding: "3px 10px", fontSize: 12,
                  color: C.textMuted, cursor: "pointer", letterSpacing: "-0.01em",
                  transition: "color 0.15s",
                }}
              >{t.clearChat}</button>
            )}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 20px",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            {messages.length === 0 && !error && (
              <div style={{ textAlign: "center", color: C.textDim, fontSize: 14, marginTop: 60 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: C.bgInput,
                  margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div style={{ fontWeight: 500, marginBottom: 6, color: C.textMuted, letterSpacing: "-0.01em" }}>{t.chatEmpty}</div>
                <div style={{ fontSize: 12, color: C.textDim }}>{t.chatEmptySub(selectedModel)}</div>
              </div>
            )}
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              const isLoadingImageGen = streaming && isLast && msg.role === "assistant" && isImageGenModel(selectedModel);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    fontSize: 11, color: C.textDim, marginBottom: 4,
                    fontWeight: 500, letterSpacing: "-0.01em",
                  }}>{msg.role === "user" ? t.chatYou : selectedModel}</div>
                  <div style={{
                    maxWidth: isMobile ? "100%" : msg.images?.length ? "90%" : "80%",
                    padding: "10px 14px", borderRadius: 14,
                    fontSize: 14, lineHeight: 1.65,
                    background: msg.role === "user" ? C.blue : C.bgInput,
                    color: msg.role === "user" ? "#fff" : C.text,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    letterSpacing: "-0.01em",
                  }}>
                    {isLoadingImageGen
                      ? <span style={{ display: "flex", alignItems: "center", gap: 8, color: C.textDim, fontSize: 13 }}>
                          <span style={{ display: "inline-block", width: 2, height: 15, background: C.blue, borderRadius: 1, animation: "blink 1s step-start infinite", verticalAlign: "middle" }} />
                          {t.generating}
                        </span>
                      : <>
                          {msg.content && <div>{msg.content}</div>}
                          {msg.images?.map((url, j) => (
                            <div key={j} style={{ marginTop: msg.content ? 10 : 0 }}>
                              <img
                                src={url}
                                alt={`generated-${j}`}
                                style={{ maxWidth: "100%", borderRadius: 10, display: "block" }}
                              />
                              <a
                                href={url}
                                download={`image-${j + 1}.png`}
                                style={{
                                  display: "inline-block", marginTop: 6,
                                  fontSize: 11, color: C.blue, textDecoration: "none",
                                  letterSpacing: "-0.01em",
                                }}
                              >↓ {t.downloadImage}</a>
                            </div>
                          ))}
                          {!msg.content && !msg.images?.length && !streaming && ""}
                          {!msg.content && !msg.images?.length && streaming && isLast && msg.role === "assistant" && !isImageGenModel(selectedModel)
                            ? <span style={{ display: "inline-block", width: 2, height: 15, background: C.blue, borderRadius: 1, animation: "blink 1s step-start infinite", verticalAlign: "middle" }} />
                            : null}
                        </>
                    }
                  </div>
                </div>
              );
            })}
            {error && (
              <div style={{
                background: `${C.red}10`, borderRadius: 10, padding: "10px 14px",
                fontSize: 13, color: C.red, letterSpacing: "-0.01em",
              }}>{error}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: "12px 16px", borderTop: `1px solid ${C.border}`,
            display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "flex-end",
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.chatPlaceholder}
              rows={1}
              disabled={streaming}
              style={{
                flex: 1, background: C.bgInput, border: "none",
                borderRadius: 10, padding: "10px 14px", fontSize: 14,
                color: C.text, outline: "none", resize: "none",
                fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120,
                overflowY: "auto", opacity: streaming ? 0.5 : 1,
                letterSpacing: "-0.01em",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              style={{
                background: !input.trim() || streaming ? C.bgInput : C.blue,
                border: "none", borderRadius: 10, padding: "10px 18px",
                fontSize: 14, fontWeight: 500, color: !input.trim() || streaming ? C.textDim : "#fff",
                cursor: !input.trim() || streaming ? "not-allowed" : "pointer",
                transition: "all 0.18s", whiteSpace: "nowrap", letterSpacing: "-0.01em", width: isMobile ? "100%" : undefined,
              }}
            >{t.sendBtn}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Settings Tab
───────────────────────────────────────────── */
function SettingsTab({ C, t, adminToken, proxyApiKey, openaiDirectKeySet, openaiDirectKeyFromEnv, onProxyKeyChange, onOAIKeyChange, isMobile }: {
  C: Record<string, string>; t: TType; adminToken: string; proxyApiKey: string;
  openaiDirectKeySet: boolean; openaiDirectKeyFromEnv: boolean;
  onProxyKeyChange: (k: string) => void; onOAIKeyChange: (set: boolean) => void;
  isMobile: boolean;
}) {
  const [newKey, setNewKey] = useState(proxyApiKey);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [oaiKey, setOaiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [savingOAI, setSavingOAI] = useState(false);
  const [keyMsg, setKeyMsg] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [oaiMsg, setOaiMsg] = useState("");

  useEffect(() => { setNewKey(proxyApiKey); }, [proxyApiKey]);

  const saveKey = async () => {
    if (!newKey.trim() || newKey.trim() === proxyApiKey) return;
    setSavingKey(true); setKeyMsg("");
    try {
      const res = await fetch("/api/config/settings", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }, body: JSON.stringify({ proxyApiKey: newKey.trim() }) });
      if (res.ok) { const d = await res.json() as { proxyApiKey: string }; onProxyKeyChange(d.proxyApiKey); setKeyMsg(t.savedOk); setTimeout(() => setKeyMsg(""), 3000); }
      else setKeyMsg(t.saveFail);
    } catch { setKeyMsg(t.netError); }
    setSavingKey(false);
  };

  const savePassword = async () => {
    if (!newPassword.trim()) return;
    if (newPassword !== confirmPassword) { setPwdMsg(t.pwdMismatch); return; }
    setSavingPwd(true); setPwdMsg("");
    try {
      const res = await fetch("/api/config/settings", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }, body: JSON.stringify({ portalPassword: newPassword.trim() }) });
      if (res.ok) { setPwdMsg(t.pwdUpdated); setNewPassword(""); setConfirmPassword(""); setTimeout(() => setPwdMsg(""), 3000); }
      else setPwdMsg(t.saveFail);
    } catch { setPwdMsg(t.netError); }
    setSavingPwd(false);
  };

  const saveOAIKey = async (keyValue: string) => {
    setSavingOAI(true); setOaiMsg("");
    try {
      const res = await fetch("/api/config/settings", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }, body: JSON.stringify({ openaiDirectKey: keyValue }) });
      if (res.ok) {
        const d = await res.json() as { openaiDirectKeySet: boolean };
        onOAIKeyChange(d.openaiDirectKeySet); setOaiKey("");
        setOaiMsg(keyValue ? t.savedOk : "Cleared"); setTimeout(() => setOaiMsg(""), 3000);
      } else setOaiMsg(t.saveFail);
    } catch { setOaiMsg(t.netError); }
    setSavingOAI(false);
  };

  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: "100%", background: C.bgInput, border: "none",
    borderRadius: 10, padding: "10px 14px", fontSize: 14, color: C.text,
    outline: "none", boxSizing: "border-box" as const, letterSpacing: "-0.01em",
    ...extra,
  });
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted,
    marginBottom: 8, letterSpacing: "-0.01em",
  };
  const msgColor = (msg: string) => msg === t.savedOk || msg === "Cleared" || msg === t.pwdUpdated ? C.green : C.red;

  const PrimaryBtn = ({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? C.bgInput : C.blue,
      border: "none", borderRadius: 10, padding: "10px 20px",
      fontSize: 14, fontWeight: 500, color: disabled ? C.textDim : "#fff",
      cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.18s",
      letterSpacing: "-0.01em",
    }}>{children}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: isMobile ? "100%" : 560 }}>
      <Section title={t.settingsKeyTitle} C={C}>
        <Card C={C}>
          <p style={{ fontSize: 14, color: C.textMuted, marginBottom: 18, marginTop: 0, letterSpacing: "-0.01em", lineHeight: 1.6 }}>{t.settingsKeyDesc}</p>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>{t.settingsKeyLabel}</label>
            <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ ...inp(), fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 13 }} />
          </div>
          <PrimaryBtn onClick={saveKey} disabled={savingKey || !newKey.trim() || newKey.trim() === proxyApiKey}>
            {savingKey ? t.saving : t.saveKeyBtn}
          </PrimaryBtn>
          {keyMsg && <div style={{ fontSize: 13, marginTop: 10, color: msgColor(keyMsg), letterSpacing: "-0.01em" }}>{keyMsg}</div>}
        </Card>
      </Section>

      <Section title={t.settingsOAIKeyTitle} C={C}>
        <Card C={C}>
          <p style={{ fontSize: 14, color: C.textMuted, marginBottom: 18, marginTop: 0, letterSpacing: "-0.01em", lineHeight: 1.6 }}>{t.settingsOAIKeyDesc}</p>
          {openaiDirectKeyFromEnv ? (
            <div style={{ fontSize: 13, color: C.green, background: C.emeraldDark, borderRadius: 8, padding: "10px 14px", letterSpacing: "-0.01em" }}>{t.settingsOAIKeyFromEnv}</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: openaiDirectKeySet ? C.green : C.textDim,
                  background: openaiDirectKeySet ? C.emeraldDark : C.bgInput,
                  borderRadius: 6, padding: "3px 10px", letterSpacing: "0.02em",
                }}>
                  {openaiDirectKeySet ? t.settingsOAIKeySet : t.settingsOAIKeyUnset}
                </span>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>{t.settingsOAIKeyLabel}</label>
                <input type="password" value={oaiKey} onChange={(e) => setOaiKey(e.target.value)} placeholder={t.settingsOAIKeyPlaceholder} style={{ ...inp(), fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                <PrimaryBtn onClick={() => saveOAIKey(oaiKey)} disabled={savingOAI || !oaiKey.trim()}>
                  {savingOAI ? t.saving : t.saveKeyBtn}
                </PrimaryBtn>
                {openaiDirectKeySet && (
                  <button onClick={() => saveOAIKey("")} disabled={savingOAI} style={{
                    background: "transparent", border: "none",
                    borderRadius: 10, padding: "10px 16px", fontSize: 14,
                    color: C.red, cursor: savingOAI ? "not-allowed" : "pointer",
                    fontWeight: 500, letterSpacing: "-0.01em", width: isMobile ? "100%" : undefined,
                  }}>{t.settingsOAIKeyClear}</button>
                )}
              </div>
              {oaiMsg && <div style={{ fontSize: 13, marginTop: 10, color: msgColor(oaiMsg), letterSpacing: "-0.01em" }}>{oaiMsg}</div>}
            </>
          )}
        </Card>
      </Section>

      <Section title={t.settingsPwdTitle} C={C}>
        <Card C={C}>
          <p style={{ fontSize: 14, color: C.textMuted, marginBottom: 18, marginTop: 0, letterSpacing: "-0.01em", lineHeight: 1.6 }}>{t.settingsPwdDesc}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <div><label style={lbl}>{t.newPwdLabel}</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.newPwdPlaceholder} style={inp()} /></div>
            <div><label style={lbl}>{t.confirmPwdLabel}</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.confirmPwdPlaceholder} style={inp()} /></div>
          </div>
          <PrimaryBtn onClick={savePassword} disabled={savingPwd || !newPassword.trim()}>
            {savingPwd ? t.saving : t.updatePwdBtn}
          </PrimaryBtn>
          {pwdMsg && <div style={{ fontSize: 13, marginTop: 10, color: msgColor(pwdMsg), letterSpacing: "-0.01em" }}>{pwdMsg}</div>}
        </Card>
      </Section>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Models Tab
───────────────────────────────────────────── */
const CAP_LABEL: Record<Cap, { label: string; color: string }> = {
  stream:    { label: "Streaming",  color: "hsl(185,65%,45%)" },
  tools:     { label: "Tool Calls", color: "hsl(270,55%,55%)" },
  vision:    { label: "Vision",     color: "hsl(142,50%,40%)" },
  reasoning: { label: "Reasoning",  color: "hsl(30,75%,48%)"  },
  json:      { label: "JSON Mode",  color: "hsl(210,65%,48%)" },
  image:     { label: "Image Gen",  color: "hsl(320,60%,50%)" },
};

type SyncedModelEntry = { id: string; provider: string; contextLength?: number; ownedBy?: string; name?: string };
type SyncProviderResult = { provider: string; ok: boolean; source?: "live" | "static"; count: number; error?: string; models: SyncedModelEntry[] };
type SyncData = { ok: boolean; syncedAt: number; results: SyncProviderResult[] };

function fmtCtx(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return String(n);
}

function providerColorOf(C: Record<string, string>, p: string): string {
  if (p === "openai") return C.blue;
  if (p === "anthropic") return C.orange;
  if (p === "gemini") return C.emerald;
  return C.purple;
}
function providerBgOf(C: Record<string, string>, p: string): string {
  if (p === "openai") return C.blueDark;
  if (p === "anthropic") return C.orangeDark;
  if (p === "gemini") return C.emeraldDark;
  return C.purpleDark;
}

function ModelsTab({ C, t, onGoChat, adminToken, onForceRelogin, isMobile }: { C: Record<string, string>; t: TType; onGoChat: (modelId: string) => void; adminToken: string; onForceRelogin: () => void; isMobile: boolean }) {
  const staticGroups: { provider: string; color: string; bg: string; models: ModelMeta[] }[] = [
    { provider: "OpenAI",     color: C.blue,     bg: C.blueDark,     models: OPENAI_MODELS },
    { provider: "Anthropic",  color: C.orange,   bg: C.orangeDark,   models: ANTHROPIC_MODELS },
    { provider: "Gemini",     color: C.emerald,  bg: C.emeraldDark,  models: GEMINI_MODELS },
    { provider: "OpenRouter", color: C.purple,   bg: C.purpleDark,   models: OPENROUTER_MODELS },
  ];

  const [syncing, setSyncing] = useState(false);
  const [syncData, setSyncData] = useState<SyncData | null>(null);
  const [syncError, setSyncError] = useState("");
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState<string | null>(null);

  const loadModels = useCallback(async (force = false) => {
    setSyncing(true); setSyncError("");
    try {
      const method = force ? "POST" : "GET";
      const headers: Record<string, string> = { Authorization: `Bearer ${adminToken}` };
      if (force) headers["Content-Type"] = "application/json";
      const r = await fetch("/api/sync-models", { method, headers });
      if (r.status === 401) { onForceRelogin(); return; }
      const d = await r.json() as SyncData;
      if (d.ok) setSyncData(d);
      else setSyncError("获取模型列表失败");
    } catch (e: unknown) { setSyncError(String(e)); }
    finally { setSyncing(false); }
  }, [adminToken, onForceRelogin]);

  useEffect(() => { void loadModels(); }, [loadModels]);

  const allLiveModels: SyncedModelEntry[] = syncData?.results.flatMap((r) => r.models) ?? [];
  const liveByProvider = syncData?.results ?? [];

  const orBySubprovider: Record<string, SyncedModelEntry[]> = {};
  const orResult = liveByProvider.find((r) => r.provider === "openrouter");
  (orResult?.models ?? []).forEach((m) => {
    const sub = (m.ownedBy ?? m.id.split("/")[0]) || "other";
    (orBySubprovider[sub] = orBySubprovider[sub] ?? []).push(m);
  });
  const orSubProviders = Object.entries(orBySubprovider).sort((a, b) => b[1].length - a[1].length);

  const filteredStaticGroups = filterProvider
    ? staticGroups.filter((g) => g.provider.toLowerCase() === filterProvider)
    : staticGroups;
  const filteredLiveByProvider = filterProvider
    ? liveByProvider.filter((r) => r.provider === filterProvider)
    : liveByProvider;

  const searchFiltered = search.trim()
    ? allLiveModels.filter((m) =>
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        (m.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const TestBtn = ({ modelId }: { modelId: string }) => (
    <button onClick={() => onGoChat(modelId)} style={{
      background: C.blue, border: "none", borderRadius: 7,
      padding: "4px 12px", fontSize: 11, fontWeight: 500, color: "#fff",
      cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
      letterSpacing: "-0.01em", transition: "opacity 0.15s",
    }}>Test</button>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {/* Provider filter pills */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", flex: 1 }}>
          {([
            { label: "全部",       key: null,         color: C.text },
            { label: "OpenAI",     key: "openai",     color: C.blue },
            { label: "Anthropic",  key: "anthropic",  color: C.orange },
            { label: "Gemini",     key: "gemini",     color: C.emerald },
            { label: "OpenRouter", key: "openrouter", color: C.purple },
          ] as const).map((p) => {
            const isActive = filterProvider === p.key;
            return (
              <button
                key={String(p.key)}
                onClick={() => setFilterProvider(isActive ? null : p.key)}
                style={{
                  background: isActive ? p.color : C.bgCard,
                  border: "none", borderRadius: 20, padding: "6px 15px",
                  fontSize: 12, fontWeight: 500,
                  color: isActive ? "#fff" : p.key ? p.color : C.textMuted,
                  cursor: "pointer", transition: "all 0.15s",
                  boxShadow: isActive ? "none" : C.shadow,
                  letterSpacing: "-0.01em",
                }}
              >{p.label}</button>
            );
          })}
        </div>
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索上游模型…"
          style={{
            background: C.bgCard, border: "none", borderRadius: 10,
            padding: "7px 14px", fontSize: 13, color: C.text,
            outline: "none", letterSpacing: "-0.01em",
            boxShadow: C.shadow, width: isMobile ? "100%" : 190,
          }}
        />
        {/* Refresh */}
        <button
          onClick={() => void loadModels(true)}
          disabled={syncing}
          style={{
            background: C.bgCard, border: "none", borderRadius: 10,
            padding: "7px 14px", fontSize: 13, color: syncing ? C.textDim : C.blue,
            cursor: syncing ? "not-allowed" : "pointer",
            boxShadow: C.shadow, transition: "all 0.15s",
            display: "flex", alignItems: "center", gap: 5, fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >{syncing ? "同步中…" : "↻ 刷新"}</button>
        {syncData && <span style={{ fontSize: 11, color: C.textDim, letterSpacing: "-0.01em" }}>同步于 {new Date(syncData.syncedAt).toLocaleTimeString()}</span>}
        {syncError && <span style={{ fontSize: 11, color: C.red }}>{syncError}</span>}
      </div>

      {/* ── SECTION 1: 精选模型 ── */}
      <div style={{ marginBottom: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.text, letterSpacing: "-0.03em" }}>精选模型</h2>
          <span style={{ background: C.bgInput, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: "0.01em" }}>{ALL_MODELS.length}</span>
        </div>
        {filteredStaticGroups.map(({ provider, color, bg, models }) => (
          <div key={provider} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{provider}</h3>
              <span style={{ background: bg, color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{models.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
              {models.map((m) => (
                <div
                  key={m.id}
                  style={{ background: C.bgCard, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, boxShadow: C.shadow, transition: "box-shadow 0.18s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = C.shadowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = C.shadow)}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <code style={{ fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace", color: C.text, fontWeight: 500, wordBreak: "break-all", flex: 1, letterSpacing: "-0.01em" }}>{m.id}</code>
                    {m.note && <span style={{ background: bg, color, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{m.note}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: C.textDim, fontWeight: 500 }}>Context</span>
                    <span style={{ background: C.bgInput, borderRadius: 5, padding: "1px 8px", fontSize: 11, fontFamily: "'SF Mono','Fira Code',monospace", color: C.blue, fontWeight: 600 }}>{m.ctx}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {m.caps.map((cap) => {
                      const meta = CAP_LABEL[cap];
                      return <span key={cap} style={{ fontSize: 10, color: meta.color, background: `${meta.color}15`, borderRadius: 5, padding: "2px 8px", fontWeight: 600 }}>{meta.label}</span>;
                    })}
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <code style={{ fontSize: 10, color: C.textDim, fontFamily: "'SF Mono','Fira Code',monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>{m.route}</code>
                    <TestBtn modelId={m.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── SECTION 2: 上游全部模型 ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.text, letterSpacing: "-0.03em" }}>上游全部模型</h2>
          {syncData
            ? <span style={{ background: C.bgInput, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, color: C.textMuted }}>{allLiveModels.length}</span>
            : syncing
              ? <span style={{ fontSize: 12, color: C.textDim }}>正在获取…</span>
              : null}
        </div>

        {searchFiltered ? (
          <div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10, letterSpacing: "-0.01em" }}>找到 {searchFiltered.length} 个匹配模型</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {searchFiltered.map((m) => {
                const color = providerColorOf(C, m.provider);
                const bg = providerBgOf(C, m.provider);
                return (
                  <div key={m.id} style={{ background: C.bgCard, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", boxShadow: C.shadow }}>
                    <span style={{ background: bg, color, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{m.provider}</span>
                    <code style={{ fontSize: 12, fontFamily: "'SF Mono','Fira Code',monospace", color: C.text, fontWeight: 500, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{m.id}</code>
                    {m.contextLength && <span style={{ fontSize: 11, color: C.blue, fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: "nowrap" }}>{fmtCtx(m.contextLength)}</span>}
                    <TestBtn modelId={m.id} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : syncData ? (
          <div>
            {filteredLiveByProvider.map((result) => {
              const color = providerColorOf(C, result.provider);
              const bg = providerBgOf(C, result.provider);
              const label = result.provider.charAt(0).toUpperCase() + result.provider.slice(1);
              if (!result.ok) {
                return (
                  <div key={result.provider} style={{ marginBottom: 16, background: C.bgCard, borderRadius: 12, padding: "14px 18px", boxShadow: C.shadow }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 3, height: 16, borderRadius: 2, background: C.red }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</span>
                      <span style={{ fontSize: 12, color: C.red }}>获取失败: {result.error}</span>
                    </div>
                  </div>
                );
              }
              const sourceBadge = (
                <span style={{ background: result.source === "live" ? `${C.green}20` : C.bgInput, color: result.source === "live" ? C.green : C.textDim, fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em" }}>
                  {result.source === "live" ? "live" : "static"}
                </span>
              );
              if (result.provider === "openrouter") {
                return (
                  <div key="openrouter" style={{ marginBottom: 36 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={{ width: 3, height: 18, borderRadius: 2, background: color }} />
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>OpenRouter</h3>
                      <span style={{ background: bg, color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{result.count}</span>
                      <span style={{ fontSize: 12, color: C.textDim }}>{orSubProviders.length} 家厂商</span>
                      {sourceBadge}
                    </div>
                    {(filterProvider === "openrouter" ? [["openrouter", result.models] as [string, SyncedModelEntry[]]] : orSubProviders).map(([sub, models]) => (
                      <div key={sub} style={{ marginBottom: 12 }}>
                        {filterProvider !== "openrouter" && (
                          <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <code style={{ fontFamily: "'SF Mono','Fira Code',monospace" }}>{sub}</code>
                            <span style={{ background: bg, color, borderRadius: 10, padding: "1px 7px", fontSize: 10 }}>{models.length}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {models.map((m) => (
                            <div key={m.id} style={{ background: C.bgCard, borderRadius: 9, padding: "7px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", boxShadow: C.shadow }}>
                              <code style={{ fontSize: 12, fontFamily: "'SF Mono','Fira Code',monospace", color: C.text, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{m.id}</code>
                              {m.name && m.name !== m.id && <span style={{ fontSize: 11, color: C.textDim, flexShrink: 0 }}>{m.name}</span>}
                              {m.contextLength && <span style={{ fontSize: 11, color: C.blue, fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: "nowrap" }}>{fmtCtx(m.contextLength)}</span>}
                              <TestBtn modelId={m.id} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div key={result.provider} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 3, height: 18, borderRadius: 2, background: color }} />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{label}</h3>
                    <span style={{ background: bg, color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{result.count}</span>
                    {sourceBadge}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {result.models.map((m) => (
                      <div key={m.id} style={{ background: C.bgCard, borderRadius: 9, padding: "8px 13px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", boxShadow: C.shadow }}>
                        <code style={{ fontSize: 12, fontFamily: "'SF Mono','Fira Code',monospace", color: C.text, fontWeight: 500, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{m.id}</code>
                        {m.name && m.name !== m.id && <span style={{ fontSize: 11, color: C.textDim, flexShrink: 0 }}>{m.name}</span>}
                        {m.contextLength && <span style={{ fontSize: 11, color: C.blue, fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: "nowrap" }}>{fmtCtx(m.contextLength)}</span>}
                        <TestBtn modelId={m.id} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: C.bgCard, borderRadius: 12, padding: "36px 24px", textAlign: "center", boxShadow: C.shadow }}>
            {syncError
              ? <>
                  <div style={{ fontSize: 13, color: C.red, marginBottom: 14 }}>{syncError}</div>
                  <button onClick={() => void loadModels(true)} style={{ background: C.blue, border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, color: "#fff", cursor: "pointer" }}>重试</button>
                </>
              : <div style={{ fontSize: 13, color: C.textDim }}>正在从上游获取模型列表…</div>
            }
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Credits (used inside Dashboard)
───────────────────────────────────────────── */
type CreditsResp = {
  total_granted: number; remaining: number; used_this_month: number;
  currency: string; expires_at: string | null; partial: boolean;
};
function fmtUsd(n: number): string { return "$" + n.toFixed(2); }

/* ─────────────────────────────────────────────
   Usage Tab
───────────────────────────────────────────── */
type UsageEntry = {
  timestamp: number; model: string; provider: string;
  promptTokens: number; completionTokens: number; totalTokens: number;
  latencyMs: number; cached: boolean;
};
type ProviderStats = { requests: number; promptTokens: number; completionTokens: number; totalTokens: number };
type UsageSummary = {
  totalRequests: number; totalPromptTokens: number; totalCompletionTokens: number; totalTokens: number;
  cachedRequests: number; byProvider: Record<string, ProviderStats>;
};

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function fmtTs(ts: number, lang: Lang = "cn"): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(lang === "cn" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function UsageTab({ C, t, lang, adminToken, onForceRelogin, isMobile }: {
  C: Record<string, string>; t: TType; lang: Lang; adminToken: string; onForceRelogin: () => void;
  isMobile: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/usage", { headers: { Authorization: `Bearer ${adminToken}` } });
      if (r.status === 401) { onForceRelogin(); return; }
      if (r.ok) {
        const d = await r.json() as { summary: UsageSummary; entries: UsageEntry[] };
        setSummary(d.summary); setEntries(d.entries);
      }
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, [adminToken, onForceRelogin]);

  useEffect(() => { void load(); }, [load]);

  const providerColor = (p: string) => p === "openai" ? C.blue : p === "anthropic" ? C.orange : p === "gemini" ? C.emerald : C.purple;
  const providerBg = (p: string) => p === "openai" ? C.blueDark : p === "anthropic" ? C.orangeDark : p === "gemini" ? C.emeraldDark : C.purpleDark;

  const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div style={{ background: C.bgCard, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow, flex: "1 1 140px", minWidth: 120 }}>
      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, marginBottom: 6, letterSpacing: "-0.01em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? C.text, letterSpacing: "-0.04em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 3, letterSpacing: "-0.01em" }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10, marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: C.text, letterSpacing: "-0.04em", flex: 1 }}>{t.usageTitle}</h2>
        <button onClick={() => void load()} disabled={loading} style={{
          background: C.bgCard, border: "none", borderRadius: 10, padding: "7px 16px",
          fontSize: 13, color: loading ? C.textDim : C.blue, cursor: loading ? "not-allowed" : "pointer",
          boxShadow: C.shadow, fontWeight: 500, letterSpacing: "-0.01em", width: isMobile ? "100%" : undefined,
        }}>{loading ? "…" : t.usageRefresh}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, marginBottom: 16 }}>{err}</div>}

      {/* Usage Summary Cards */}
      {summary && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
          <StatCard label={t.usageTotalRequests} value={String(summary.totalRequests)} />
          <StatCard label={t.usagePromptTokens} value={fmtNum(summary.totalPromptTokens)} />
          <StatCard label={t.usageCompletionTokens} value={fmtNum(summary.totalCompletionTokens)} />
          <StatCard label={t.usageTotalTokens} value={fmtNum(summary.totalTokens)} color={C.blue} />
        </div>
      )}

      {/* By Provider */}
      {summary && Object.keys(summary.byProvider).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{t.usageByProvider}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(summary.byProvider).map(([prov, stats]) => {
              const color = providerColor(prov); const bg = providerBg(prov);
              return (
                <div key={prov} style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", boxShadow: C.shadow, minWidth: isMobile ? "100%" : 160, flex: isMobile ? "1 1 100%" : undefined }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 3, height: 16, borderRadius: 2, background: color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{prov}</span>
                    <span style={{ background: bg, color, fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "1px 7px" }}>{stats.requests}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {[
                      ["Prompt", fmtNum(stats.promptTokens)],
                      ["Completion", fmtNum(stats.completionTokens)],
                      ["Total", fmtNum(stats.totalTokens)],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: C.textMuted }}>{k}</span>
                        <span style={{ fontSize: 12, fontFamily: "'SF Mono','Fira Code',monospace", color: C.text, fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Requests Table */}
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{t.usageRecentTitle}</h3>
        {entries.length === 0 ? (
          <div style={{ background: C.bgCard, borderRadius: 12, padding: "28px 20px", textAlign: "center", fontSize: 13, color: C.textDim, boxShadow: C.shadow }}>{t.usageNoData}</div>
        ) : (
          <div style={{ background: C.bgCard, borderRadius: 12, overflow: "hidden", boxShadow: C.shadow }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {[t.usageColTime, t.usageColModel, t.usageColProvider, t.usageColPrompt, t.usageColCompletion, t.usageColTotal, t.usageColLatency].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.textMuted, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} style={{ borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <td style={{ padding: "6px 12px", color: C.textDim, whiteSpace: "nowrap" }}>{fmtTs(e.timestamp, lang)}</td>
                      <td style={{ padding: "6px 12px", maxWidth: 200 }}>
                        <code style={{ fontFamily: "'SF Mono','Fira Code',monospace", color: C.text, fontSize: 11 }}>{e.model}</code>
                      </td>
                      <td style={{ padding: "6px 12px" }}>
                        <span style={{ background: providerBg(e.provider), color: providerColor(e.provider), fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" }}>{e.provider}</span>
                      </td>
                      <td style={{ padding: "6px 12px", color: C.text, fontFamily: "'SF Mono','Fira Code',monospace" }}>{e.promptTokens || "—"}</td>
                      <td style={{ padding: "6px 12px", color: C.text, fontFamily: "'SF Mono','Fira Code',monospace" }}>{e.completionTokens || "—"}</td>
                      <td style={{ padding: "6px 12px", color: C.blue, fontWeight: 600, fontFamily: "'SF Mono','Fira Code',monospace" }}>{e.totalTokens || "—"}</td>
                      <td style={{ padding: "6px 12px", color: C.textDim, fontFamily: "'SF Mono','Fira Code',monospace" }}>{e.latencyMs || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Root App
───────────────────────────────────────────── */
export default function App() {
  const isMobile = useIsMobile();
  const [dark, setDark] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("portalLang") as Lang) ?? "cn");
  const [online, setOnline] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [proxyApiKey, setProxyApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<"dashboard" | "chat" | "models" | "settings" | "usage">("dashboard");
  const [chatInitModel, setChatInitModel] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsResp | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsErr, setCreditsErr] = useState("");
  const [creditsNeedsKey, setCreditsNeedsKey] = useState(false);
  const [openaiDirectKeySet, setOpenaiDirectKeySet] = useState(false);
  const [openaiDirectKeyFromEnv, setOpenaiDirectKeyFromEnv] = useState(false);
  const C = dark ? DARK : LIGHT;
  const t = lang === "cn" ? T_CN : T_EN;
  const origin = window.location.origin;

  const handleSetLang = (l: Lang) => { setLang(l); localStorage.setItem("portalLang", l); };

  useEffect(() => {
    document.title = PROJECT_NAME;
    const favicon = document.querySelector("link[rel='icon']") ?? document.createElement("link");
    favicon.setAttribute("rel", "icon");
    favicon.setAttribute("type", "image/jpeg");
    favicon.setAttribute("href", PROJECT_LOGO_URL);
    if (!favicon.parentNode) document.head.appendChild(favicon);
  }, []);

  useEffect(() => { fetch("/api/healthz").then((r) => setOnline(r.ok)).catch(() => setOnline(false)); }, []);

  useEffect(() => {
    const stored = localStorage.getItem("portalToken");
    if (!stored) { setAuthChecked(true); return; }
    fetch("/api/config/settings", { headers: { "Authorization": `Bearer ${stored}` } })
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json() as { proxyApiKey: string; openaiDirectKeySet?: boolean; openaiDirectKeyFromEnv?: boolean };
          setAdminToken(stored); setProxyApiKey(d.proxyApiKey);
          setOpenaiDirectKeySet(d.openaiDirectKeySet ?? false);
          setOpenaiDirectKeyFromEnv(d.openaiDirectKeyFromEnv ?? false);
          setAuthed(true);
        } else localStorage.removeItem("portalToken");
        setAuthChecked(true);
      })
      .catch(() => { localStorage.removeItem("portalToken"); setAuthChecked(true); });
  }, []);

  const handleLogin = (token: string, key: string, oaiSet?: boolean, oaiFromEnv?: boolean) => {
    localStorage.setItem("portalToken", token);
    setAdminToken(token); setProxyApiKey(key);
    setOpenaiDirectKeySet(oaiSet ?? false); setOpenaiDirectKeyFromEnv(oaiFromEnv ?? false);
    setAuthed(true);
  };
  const handleLogout = async () => {
    await fetch("/api/config/logout", { method: "POST", headers: { "Authorization": `Bearer ${adminToken}` } }).catch(() => {});
    localStorage.removeItem("portalToken"); setAdminToken(""); setProxyApiKey(""); setAuthed(false);
  };
  const handleForceRelogin = () => { localStorage.removeItem("portalToken"); setAdminToken(""); setProxyApiKey(""); setAuthed(false); };

  useEffect(() => {
    if (!authed || !adminToken) return;
    const load = async () => {
      setCreditsLoading(true);
      try {
        const res = await fetch("/api/credits", { headers: { "Authorization": `Bearer ${adminToken}` } });
        const data = await res.json() as CreditsResp & { needs_key?: boolean; error?: string };
        if (res.ok) {
          if (data.needs_key) { setCreditsNeedsKey(true); setCredits(null); setCreditsErr(""); }
          else { setCreditsNeedsKey(false); setCredits(data); setCreditsErr(""); }
        } else { setCreditsErr(data.error ?? `HTTP ${res.status}`); setCreditsNeedsKey(false); }
      } catch (e) { setCreditsErr(e instanceof Error ? e.message : "Network error"); setCreditsNeedsKey(false); }
      finally { setCreditsLoading(false); }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [authed, adminToken, openaiDirectKeySet]);

  /* Loading screen */
  if (!authChecked) {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
      }}>
        <div style={{ color: C.textDim, fontSize: 14, letterSpacing: "-0.01em" }}>{t.loading}</div>
      </div>
    );
  }

  /* Login screen */
  if (!authed) {
    return (
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}>
        <div style={{ position: "fixed", top: 16, left: isMobile ? 12 : "auto", right: isMobile ? 12 : 20, display: "flex", alignItems: "center", justifyContent: isMobile ? "space-between" : "flex-start", gap: isMobile ? 8 : 12, flexWrap: "wrap", zIndex: 100 }}>
          <span style={{ fontSize: 11, color: C.textDim, fontFamily: "'SF Mono','Fira Code',monospace" }}>{PROJECT_VERSION}</span>
          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, letterSpacing: "-0.01em" }}>{PROJECT_AUTHOR}</span>
          <GithubLinkButton C={C} />
          <LangToggle lang={lang} setLang={handleSetLang} C={C} />
        </div>
        <LoginPage C={C} t={t} onLogin={handleLogin} isMobile={isMobile} />
      </div>
    );
  }

  const authHeader = `Authorization: Bearer ${proxyApiKey}`;
  const curlExample = `curl ${origin}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${proxyApiKey}" \\\n  -d '{\n    "model": "gemini-2.5-flash",\n    "messages": [{"role": "user", "content": "Hello!"}],\n    "stream": false\n  }'`;

  const handleGoChat = (modelId: string) => { setChatInitModel(modelId); setTab("chat"); };

  const TABS = [
    { key: "dashboard" as const, label: t.tabDashboard,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
    { key: "chat" as const, label: t.tabChat,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { key: "models" as const, label: t.tabModels,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> },
    { key: "settings" as const, label: t.tabSettings,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
    { key: "usage" as const, label: t.tabUsage,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ];

  return (
    <div style={{
      height: isMobile ? "100dvh" : "100vh", display: "flex", flexDirection: "column",
      background: C.bg, color: C.text,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif",
      lineHeight: 1.6, transition: "background 0.25s, color 0.25s",
    }}>
      {/* ── Frosted glass top header ── */}
      <div style={{
        minHeight: 57, flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "12px 16px" : "0 20px",
        display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 12 : 0,
        background: dark ? "rgba(28,28,30,0.85)" : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        zIndex: 50, position: "sticky", top: 0,
      }}>
        {/* Logo + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <img
            src={PROJECT_LOGO_URL}
            alt={`${PROJECT_NAME} logo`}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              flexShrink: 0,
              objectFit: "cover",
              border: `1px solid ${C.border}`,
            }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: C.text, letterSpacing: "-0.025em" }}>{PROJECT_NAME}</div>
            {!isMobile && <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "-0.01em" }}>{PROJECT_TAGLINE}</div>}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "space-between" : "flex-start", gap: isMobile ? 8 : 12, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
          <span style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 11, color: C.textDim }}>{PROJECT_VERSION}</span>
          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, letterSpacing: "-0.01em" }}>{PROJECT_AUTHOR}</span>
          <GithubLinkButton C={C} />
          <StatusDot online={online} C={C} t={t} />
          <LangToggle lang={lang} setLang={handleSetLang} C={C} />
          <button
            onClick={() => setDark((d) => !d)}
            style={{
              background: "transparent", border: "none",
              borderRadius: 8, padding: "5px 8px", fontSize: 15,
              cursor: "pointer", color: C.textMuted, lineHeight: 1,
              transition: "color 0.15s",
            }}
          >{dark ? "○" : "●"}</button>
          <button
            onClick={handleLogout}
            style={{
              background: "transparent", border: "none",
              borderRadius: 8, padding: "5px 12px",
              fontSize: 13, cursor: "pointer", color: C.textMuted,
              fontWeight: 400, letterSpacing: "-0.01em", transition: "color 0.15s",
            }}
          >{t.logout}</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        {/* Left sidebar nav */}
        <div style={{
          width: isMobile ? "100%" : 180, flexShrink: 0,
          borderRight: isMobile ? "none" : `1px solid ${C.border}`,
          borderBottom: isMobile ? `1px solid ${C.border}` : "none",
          background: dark ? "rgba(28,28,30,0.6)" : "rgba(255,255,255,0.6)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          display: "flex", flexDirection: isMobile ? "row" : "column",
          padding: isMobile ? "10px" : "16px 10px", gap: isMobile ? 6 : 2, overflowX: isMobile ? "auto" : "hidden", overflowY: isMobile ? "hidden" : "auto",
        }}>
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  width: isMobile ? "auto" : "100%", textAlign: "left", whiteSpace: "nowrap", flexShrink: 0,
                  background: active ? (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "transparent",
                  borderTop: "none", borderRight: "none", borderBottom: isMobile ? `3px solid ${active ? C.blue : "transparent"}` : "none",
                  borderLeft: isMobile ? "none" : `3px solid ${active ? C.blue : "transparent"}`,
                  borderRadius: isMobile ? 10 : "0 10px 10px 0",
                  padding: isMobile ? "9px 12px" : "9px 12px 9px 10px",
                  cursor: "pointer",
                  color: active ? C.text : C.textMuted,
                  fontSize: 14, fontWeight: active ? 500 : 400,
                  transition: "all 0.18s", letterSpacing: "-0.02em",
                }}
              >
                <span style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }}>{tb.icon}</span>
                {tb.label}
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{
            maxWidth: tab === "chat" ? 9999 : 860,
            margin: "0 auto",
            padding: tab === "chat" ? (isMobile ? "14px 12px 20px" : "20px 20px 16px") : (isMobile ? "18px 14px 32px" : "32px 32px 64px"),
          }}>

            {/* ── Dashboard ── */}
            {tab === "dashboard" && (
              <>
                <Section title={t.connDetails} C={C}>
                  <Card C={C}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>Base URL</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <code style={{
                            background: C.bgInput, borderRadius: 8, padding: "7px 12px",
                            fontSize: 14, color: C.blue,
                            fontFamily: "'SF Mono','Fira Code',monospace",
                            flex: 1, minWidth: 0, wordBreak: "break-all", letterSpacing: "-0.01em",
                          }}>{origin}</code>
                          <CopyButton text={origin} C={C} t={t} />
                        </div>
                      </div>
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>Auth Header</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <code style={{
                            background: C.bgInput, borderRadius: 8, padding: "7px 12px",
                            fontSize: 13, color: C.orange,
                            fontFamily: "'SF Mono','Fira Code',monospace",
                            flex: 1, minWidth: 0, wordBreak: "break-all", letterSpacing: "-0.01em",
                          }}>{authHeader}</code>
                          <CopyButton text={authHeader} C={C} t={t} />
                        </div>
                        <p style={{ fontSize: 12, color: C.textDim, marginTop: 8, letterSpacing: "-0.01em" }}>{t.proxyKeyHint(proxyApiKey)}</p>
                      </div>
                    </div>
                  </Card>
                </Section>

                <Section title={t.apiEndpoints} C={C}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {ENDPOINTS.map((ep) => {
                      const tc = ep.type === "OpenAI" ? C.blue : ep.type === "Anthropic" ? C.orange : ep.type === "Responses" ? C.emerald : C.gray;
                      const tb = ep.type === "OpenAI" ? C.blueDark : ep.type === "Anthropic" ? C.orangeDark : ep.type === "Responses" ? C.emeraldDark : C.grayDark;
                      return (
                        <Card key={ep.path} C={C}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                            <MethodBadge method={ep.method} C={C} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                                <code style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 14, color: C.text, fontWeight: 500, letterSpacing: "-0.01em" }}>{ep.path}</code>
                                <span style={{ background: tb, color: tc, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.03em" }}>{ep.type}</span>
                              </div>
                              <p style={{ fontSize: 13, color: C.textMuted, margin: 0, letterSpacing: "-0.01em", lineHeight: 1.55 }}>{ep.desc}</p>
                            </div>
                            <CopyButton text={`${origin}${ep.path}`} label={t.copyUrl} C={C} t={t} />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </Section>

                <Section title={t.availableModels} C={C}>
                  <ModelGroup title="OpenAI" models={OPENAI_MODELS} color={C.blue} bg={C.blueDark} C={C} />
                  <ModelGroup title="Anthropic" models={ANTHROPIC_MODELS} color={C.orange} bg={C.orangeDark} C={C} />
                  <ModelGroup title="Google Gemini" models={GEMINI_MODELS} color={C.emerald} bg={C.emeraldDark} C={C} />
                </Section>

                <Section title={t.setupGuide} C={C}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {t.steps.map((step, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 16,
                        background: C.bgCard, borderRadius: 14, padding: "16px 18px",
                        boxShadow: C.shadow,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: C.bgInput,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 600, color: C.textMuted, flexShrink: 0,
                        }}>{i + 1}</div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14, color: C.text, marginBottom: 4, letterSpacing: "-0.02em" }}>{step.title}</div>
                          <p style={{ fontSize: 13, color: C.textMuted, margin: 0, letterSpacing: "-0.01em", lineHeight: 1.55 }}>{step.desc}</p>
                          {step.note && <p style={{ fontSize: 12, color: C.textDim, marginTop: 6, letterSpacing: "-0.01em" }}>{t.notePrefix}{step.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title={t.quickTest} C={C}>
                  <div style={{
                    background: C.bgCard, borderRadius: 14, overflow: "hidden",
                    boxShadow: C.shadow,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
                      background: C.bgInput,
                    }}>
                      <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, letterSpacing: "-0.01em" }}>{t.curlLabel}</span>
                      <CopyButton text={curlExample} label={t.copyCmd} C={C} t={t} />
                    </div>
                    <pre style={{
                      margin: 0, padding: "16px 20px",
                      fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace",
                      color: C.text, overflowX: "auto", lineHeight: 1.7,
                      background: C.bgCard, letterSpacing: "-0.01em",
                    }}>
                      <span style={{ color: C.blue }}>curl</span>{" "}<span style={{ color: C.orange }}>{origin}/v1/chat/completions</span>{" "}{`\\`}{"\n"}{"  "}
                      <span style={{ color: C.textMuted }}>-H</span>{" "}<span style={{ color: C.green }}>"Content-Type: application/json"</span>{" "}{`\\`}{"\n"}{"  "}
                      <span style={{ color: C.textMuted }}>-H</span>{" "}<span style={{ color: C.green }}>{`"Authorization: Bearer ${proxyApiKey}"`}</span>{" "}{`\\`}{"\n"}{"  "}
                      <span style={{ color: C.textMuted }}>-d</span>{" "}<span style={{ color: C.purple }}>{`'{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"stream":false}'`}</span>
                    </pre>
                  </div>
                </Section>

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, textAlign: "center", fontSize: 12, color: C.textDim, letterSpacing: "-0.01em" }}>
                  {t.footerPowered}{" "}
                  <span style={{ color: C.blue }}>OpenAI</span> +{" "}
                  <span style={{ color: C.orange }}>Anthropic</span> +{" "}
                  <span style={{ color: C.emerald }}>Gemini</span>{" "}
                  {t.footerVia}{" "}<span style={{ color: C.blue }}>Replit AI Integrations</span>{" "}
                  {t.footerSuffix}
                </div>
              </>
            )}

            {/* ── Chat ── */}
            {tab === "chat" && (
              <ChatTab
                C={C} t={t} proxyApiKey={proxyApiKey} adminToken={adminToken}
                onKeyRefresh={setProxyApiKey} onForceRelogin={handleForceRelogin}
                initModel={chatInitModel} isMobile={isMobile}
              />
            )}

            {/* ── Models ── */}
            {tab === "models" && (
              <ModelsTab C={C} t={t} onGoChat={handleGoChat} adminToken={adminToken} onForceRelogin={handleForceRelogin} isMobile={isMobile} />
            )}

            {/* ── Settings ── */}
            {tab === "settings" && (
              <SettingsTab
                C={C} t={t} adminToken={adminToken} proxyApiKey={proxyApiKey}
                openaiDirectKeySet={openaiDirectKeySet} openaiDirectKeyFromEnv={openaiDirectKeyFromEnv}
                onProxyKeyChange={setProxyApiKey} onOAIKeyChange={setOpenaiDirectKeySet} isMobile={isMobile}
              />
            )}
            {tab === "usage" && (
              <UsageTab C={C} t={t} lang={lang} adminToken={adminToken} onForceRelogin={handleForceRelogin} isMobile={isMobile} />
            )}
          </div>
        </div>
      </div>

      {/* Blink cursor keyframe */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

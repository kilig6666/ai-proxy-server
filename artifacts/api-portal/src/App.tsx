import { useState, useEffect, useCallback, useRef } from "react";

const DARK: Record<string, string> = {
  bg: "hsl(222, 47%, 11%)", bgCard: "hsl(222, 40%, 15%)", bgInput: "hsl(222, 40%, 13%)",
  border: "hsl(222, 30%, 22%)", text: "hsl(210, 40%, 92%)", textMuted: "hsl(210, 20%, 60%)",
  textDim: "hsl(210, 15%, 45%)", green: "hsl(142, 70%, 45%)", red: "hsl(0, 70%, 55%)",
  blue: "hsl(210, 80%, 60%)", blueDark: "hsl(210, 80%, 20%)", purple: "hsl(270, 70%, 65%)",
  purpleDark: "hsl(270, 60%, 20%)", orange: "hsl(30, 90%, 60%)", orangeDark: "hsl(30, 70%, 18%)",
  cyan: "hsl(185, 80%, 55%)", gray: "hsl(220, 10%, 55%)", grayDark: "hsl(220, 15%, 20%)",
  emerald: "hsl(152, 65%, 50%)", emeraldDark: "hsl(152, 55%, 14%)",
  gradientA: "hsl(210, 80%, 60%)", gradientB: "hsl(270, 70%, 65%)",
};

const LIGHT: Record<string, string> = {
  bg: "hsl(210, 20%, 97%)", bgCard: "hsl(0, 0%, 100%)", bgInput: "hsl(210, 20%, 94%)",
  border: "hsl(210, 20%, 86%)", text: "hsl(222, 40%, 12%)", textMuted: "hsl(222, 15%, 40%)",
  textDim: "hsl(222, 10%, 55%)", green: "hsl(142, 60%, 35%)", red: "hsl(0, 65%, 48%)",
  blue: "hsl(210, 75%, 45%)", blueDark: "hsl(210, 80%, 92%)", purple: "hsl(270, 60%, 48%)",
  purpleDark: "hsl(270, 60%, 92%)", orange: "hsl(30, 85%, 45%)", orangeDark: "hsl(30, 90%, 92%)",
  cyan: "hsl(185, 70%, 38%)", gray: "hsl(220, 10%, 48%)", grayDark: "hsl(220, 15%, 92%)",
  emerald: "hsl(152, 60%, 35%)", emeraldDark: "hsl(152, 55%, 90%)",
  gradientA: "hsl(210, 80%, 55%)", gradientB: "hsl(270, 65%, 55%)",
};

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
  tabDashboard: "Dashboard", tabChat: "聊天测试", tabModels: "模型列表", tabSettings: "设置",
  connDetails: "连接详情",
  proxyKeyHint: (k: string) => `当前 PROXY_API_KEY: ${k} · 可在"设置"页签修改`,
  apiEndpoints: "API 端点",
  availableModels: "可用模型",
  setupGuide: "CherryStudio 配置指南",
  quickTest: "快速测试 (curl)",
  curlLabel: "curl 示例 — Gemini 模型",
  copyCmd: "复制命令",
  copyUrl: "复制 URL",
  copied: "已复制!",
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
  generating: "● 生成中...",
  clearChat: "清空",
  chatEmpty: "发送消息开始测试",
  chatEmptySub: (m: string) => `使用 ${m} 模型，通过本代理路由`,
  chatYou: "You",
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
  savedOk: "✓ 已保存",
  saveFail: "✗ 保存失败",
  netError: "✗ 网络错误",
  noChange: "未做更改",
  settingsPwdTitle: "修改访问密码",
  settingsPwdDesc: "修改 Portal 登录密码后，下次登录需要使用新密码。",
  newPwdLabel: "新密码",
  newPwdPlaceholder: "输入新密码...",
  confirmPwdLabel: "确认新密码",
  confirmPwdPlaceholder: "再次输入...",
  pwdMismatch: "✗ 两次密码不一致",
  updatePwdBtn: "更新密码",
  pwdUpdated: "✓ 密码已更新",
  creditsTitle: "账户余额",
  creditsRemaining: "可用余额",
  creditsUsed: "本月消耗",
  creditsTotal: "总 Credits",
  creditsLoading: "获取余额中...",
  creditsError: "余额暂不可用",
  creditsRefresh: "刷新",
  creditsExpires: "到期",
  creditsApiHint: "外部查询接口: GET /v1/credits (使用 proxyApiKey 鉴权)",
  creditsUnavailableNote: "余额暂不可用，请稍后重试",
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
  logout: "Logout",
  online: "Online", offline: "Offline", checking: "Checking...",
  tabDashboard: "Dashboard", tabChat: "Chat Test", tabModels: "Models", tabSettings: "Settings",
  connDetails: "Connection Details",
  proxyKeyHint: (k: string) => `Current PROXY_API_KEY: ${k} · Change it in the Settings tab`,
  apiEndpoints: "API Endpoints",
  availableModels: "Available Models",
  setupGuide: "CherryStudio Setup Guide",
  quickTest: "Quick Test (curl)",
  curlLabel: "curl example — Gemini model",
  copyCmd: "Copy command",
  copyUrl: "Copy URL",
  copied: "Copied!",
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
  generating: "● Generating...",
  clearChat: "Clear",
  chatEmpty: "Send a message to start testing",
  chatEmptySub: (m: string) => `Using ${m} model, routed through this proxy`,
  chatYou: "You",
  chatPlaceholder: "Type a message... (Enter to send, Shift+Enter for newline)",
  sendBtn: "Send",
  chatUnauth: "API Key was updated, refreshed automatically — please resend",
  chatUnauthFail: "Session expired, redirecting to login...",
  chatFail: "Request failed",
  settingsKeyTitle: "API Key Configuration",
  settingsKeyDesc: "After changing the Proxy API Key, all clients must use the new key to access the service.",
  settingsKeyLabel: "Current / New PROXY_API_KEY",
  saveKeyBtn: "Save API Key",
  saving: "Saving...",
  savedOk: "✓ Saved",
  saveFail: "✗ Save failed",
  netError: "✗ Network error",
  noChange: "No changes",
  settingsPwdTitle: "Change Access Password",
  settingsPwdDesc: "After changing the Portal password, you will need the new password on next login.",
  newPwdLabel: "New Password",
  newPwdPlaceholder: "Enter new password...",
  confirmPwdLabel: "Confirm New Password",
  confirmPwdPlaceholder: "Re-enter password...",
  pwdMismatch: "✗ Passwords do not match",
  updatePwdBtn: "Update Password",
  pwdUpdated: "✓ Password updated",
  creditsTitle: "Account Credits",
  creditsRemaining: "Remaining",
  creditsUsed: "Used This Month",
  creditsTotal: "Total Credits",
  creditsLoading: "Fetching credits...",
  creditsError: "Credits unavailable",
  creditsRefresh: "Refresh",
  creditsExpires: "Expires",
  creditsApiHint: "External API: GET /v1/credits (auth with proxyApiKey)",
  creditsUnavailableNote: "Credits unavailable, please try again later",
};

type TType = typeof T_CN;
type Lang = "cn" | "en";

type Cap = "stream" | "tools" | "vision" | "reasoning" | "json";
type ModelMeta = { id: string; note?: string; ctx: string; caps: Cap[]; route: string };

const OPENAI_MODELS: ModelMeta[] = [
  // ── GPT-5.x series ──
  { id: "gpt-5.4",        note: "Latest",       ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-5.3-codex",  note: "Code",         ctx: "1M",   caps: ["stream","tools","json"],          route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5.2",                               ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-5.2-codex",  note: "Code",         ctx: "1M",   caps: ["stream","tools","json"],          route: "/v1/chat/completions · /v1/responses" },
  { id: "gpt-5.1",                               ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-5",          note: "Most capable", ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-5-mini",                            ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-5-nano",     note: "Fastest",      ctx: "1M",   caps: ["stream","tools","json"],          route: "/v1/chat/completions" },
  // ── GPT-4.x series ──
  { id: "gpt-4.1",        note: "Recommended",  ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4.1-mini",                          ctx: "1M",   caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4.1-nano",   note: "Fast",         ctx: "1M",   caps: ["stream","tools","json"],          route: "/v1/chat/completions" },
  { id: "gpt-4o",                                ctx: "128K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gpt-4o-mini",                           ctx: "128K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  // ── Reasoning series ──
  { id: "o4-mini",        note: "Reasoning",    ctx: "200K", caps: ["stream","tools","reasoning"],     route: "/v1/chat/completions" },
  { id: "o3",             note: "Reasoning",    ctx: "200K", caps: ["stream","reasoning"],             route: "/v1/chat/completions" },
  { id: "o3-mini",        note: "Reasoning",    ctx: "200K", caps: ["stream","reasoning"],             route: "/v1/chat/completions" },
];
const ANTHROPIC_MODELS: ModelMeta[] = [
  { id: "claude-opus-4-6",   note: "Most capable", ctx: "200K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-opus-4-5",                          ctx: "200K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-opus-4-1",                          ctx: "200K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-sonnet-4-6", note: "Recommended",  ctx: "200K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-sonnet-4-5",                        ctx: "200K", caps: ["stream","tools","vision","json"], route: "/v1/chat/completions · /v1/messages" },
  { id: "claude-haiku-4-5",  note: "Fastest",      ctx: "200K", caps: ["stream","tools","json"],          route: "/v1/chat/completions · /v1/messages" },
];
const GEMINI_MODELS: ModelMeta[] = [
  { id: "gemini-3.1-pro-preview",                       ctx: "2M",  caps: ["stream","tools","vision"],        route: "/v1/chat/completions" },
  { id: "gemini-3-pro-preview",                         ctx: "2M",  caps: ["stream","tools","vision"],        route: "/v1/chat/completions" },
  { id: "gemini-3-flash-preview",                       ctx: "1M",  caps: ["stream","tools","vision"],        route: "/v1/chat/completions" },
  { id: "gemini-2.5-pro",   note: "Most capable",      ctx: "2M",  caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
  { id: "gemini-2.5-flash", note: "Recommended",       ctx: "1M",  caps: ["stream","tools","vision","json"], route: "/v1/chat/completions" },
];
const ALL_MODELS = [
  ...OPENAI_MODELS.map((m) => ({ ...m, provider: "OpenAI" as const })),
  ...ANTHROPIC_MODELS.map((m) => ({ ...m, provider: "Anthropic" as const })),
  ...GEMINI_MODELS.map((m) => ({ ...m, provider: "Gemini" as const })),
];
const ENDPOINTS = [
  { method: "GET", path: "/v1/models", label: "List Models", type: "Both", desc: "Returns all available model IDs across OpenAI, Anthropic and Gemini" },
  { method: "GET", path: "/v1/credits", label: "Credits Balance", type: "Both", desc: "Query OpenAI account credits balance and this month's usage. Auth with proxyApiKey Bearer token." },
  { method: "POST", path: "/v1/chat/completions", label: "Chat Completions", type: "OpenAI", desc: "OpenAI-compatible chat API. Supports streaming, tool calls, and all models via prefix routing" },
  { method: "POST", path: "/v1/responses", label: "Responses API", type: "Responses", desc: "OpenAI Responses API pass-through. Supports gpt-5.4, gpt-5.3-codex, gpt-5.2-codex and all OpenAI models. Streaming supported." },
  { method: "POST", path: "/v1/messages", label: "Messages", type: "Anthropic", desc: "Anthropic native Messages API. Supports streaming, tool use, and both Claude & GPT models" },
];

type ChatMessage = { role: "user" | "assistant"; content: string };

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
    <button onClick={handleCopy} style={{ background: copied ? C.green : C.bgInput, border: `1px solid ${copied ? C.green : C.border}`, color: copied ? "#fff" : C.textMuted, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}>
      {copied ? t.copied : label ?? t.copy}
    </button>
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span style={{ background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em" }}>{children}</span>;
}

function MethodBadge({ method, C }: { method: string; C: Record<string, string> }) {
  const isGet = method === "GET";
  return <span style={{ background: isGet ? "hsl(142,60%,18%)" : C.purpleDark, color: isGet ? C.green : C.purple, borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", minWidth: 48, display: "inline-block", textAlign: "center" }}>{method}</span>;
}

function StatusDot({ online, C, t }: { online: boolean | null; C: Record<string, string>; t: TType }) {
  const color = online === null ? C.orange : online ? C.green : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block", boxShadow: `0 0 8px 2px ${color}`, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>{online === null ? t.checking : online ? t.online : t.offline}</span>
    </span>
  );
}

function Section({ title, children, C }: { title: string; children: React.ReactNode; C: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ color: C.text, fontSize: 17, fontWeight: 700, marginBottom: 14, letterSpacing: "-0.01em" }}>{title}</h2>
      {children}
    </div>
  );
}

function Card({ children, style, C }: { children: React.ReactNode; style?: React.CSSProperties; C: Record<string, string> }) {
  return <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", ...style }}>{children}</div>;
}

function ModelGroup({ title, models, color, bg, C }: { title: string; models: { id: string; note?: string }[]; color: string; bg: string; C: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
        {models.map((m) => (
          <Card key={m.id} C={C} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px" }}>
            <code style={{ fontSize: 12, color: C.text, fontFamily: "monospace", wordBreak: "break-all", flex: 1 }}>{m.id}</code>
            {m.note && <span style={{ fontSize: 11, color, background: bg, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{m.note}</span>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function LangToggle({ lang, setLang, C }: { lang: Lang; setLang: (l: Lang) => void; C: Record<string, string> }) {
  return (
    <div style={{ display: "flex", background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontSize: 12, fontWeight: 700 }}>
      {(["cn", "en"] as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)} style={{ padding: "5px 10px", background: lang === l ? `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})` : "transparent", color: lang === l ? "#fff" : C.textMuted, border: "none", cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.04em" }}>
          {l === "cn" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}

function LoginPage({ C, t, onLogin }: { C: Record<string, string>; t: TType; onLogin: (token: string, proxyApiKey: string) => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/config/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!res.ok) { setError(t.loginErrorPwd); setLoading(false); return; }
      const data = await res.json() as { token: string; proxyApiKey: string };
      onLogin(data.token, data.proxyApiKey);
    } catch { setError(t.loginErrorNet); setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: C.text, marginBottom: 6 }}>AI Proxy Portal</div>
          <div style={{ fontSize: 14, color: C.textMuted }}>{t.loginSubtitle}</div>
        </div>
        <Card C={C}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>{t.loginLabel}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.loginPlaceholder} autoFocus style={{ width: "100%", background: C.bgInput, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} />
              {error && <div style={{ marginTop: 8, fontSize: 13, color: C.red }}>{error}</div>}
            </div>
            <button type="submit" disabled={loading || !password} style={{ background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: loading || !password ? "not-allowed" : "pointer", opacity: loading || !password ? 0.7 : 1, transition: "opacity 0.2s" }}>
              {loading ? t.loginLoading : t.loginBtn}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function ChatTab({ C, t, proxyApiKey, adminToken, onKeyRefresh, onForceRelogin, initModel }: {
  C: Record<string, string>; t: TType; proxyApiKey: string;
  adminToken: string; onKeyRefresh: (k: string) => void; onForceRelogin: () => void;
  initModel?: string | null;
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

  const providerColor = (p: string) => p === "OpenAI" ? C.blue : p === "Anthropic" ? C.orange : C.emerald;
  const providerBg = (p: string) => p === "OpenAI" ? C.blueDark : p === "Anthropic" ? C.orangeDark : C.emeraldDark;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput(""); setError(""); setStreaming(true);
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    const doFetch = async (key: string): Promise<Response> => {
      return fetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: selectedModel, messages: newMessages, stream: true }),
      });
    };

    try {
      let res = await doFetch(proxyApiKeyRef.current);

      if (res.status === 401) {
        const settingsRes = await fetch("/api/config/settings", { headers: { "Authorization": `Bearer ${adminToken}` } });
        if (settingsRes.ok) {
          const data = await settingsRes.json() as { proxyApiKey: string };
          onKeyRefresh(data.proxyApiKey);
          proxyApiKeyRef.current = data.proxyApiKey;
          setError(t.chatUnauth);
          setMessages(newMessages);
          setStreaming(false);
          return;
        } else {
          setError(t.chatUnauthFail);
          setMessages(newMessages);
          setStreaming(false);
          setTimeout(onForceRelogin, 1500);
          return;
        }
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setError(errData?.error?.message ?? `HTTP ${res.status}`);
        setMessages(newMessages); setStreaming(false); return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let accumulated = "";
      let sseBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            accumulated += delta;
            setMessages([...newMessages, { role: "assistant", content: accumulated }]);
          } catch { /* ignore partial SSE */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.chatFail);
      setMessages(newMessages);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const selectedInfo = ALL_MODELS.find((m) => m.id === selectedModel);

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 130px)", minHeight: 500 }}>
      <div style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{t.selectModel}</div>
        {(["OpenAI", "Anthropic", "Gemini"] as const).map((provider) => (
          <div key={provider}>
            <div style={{ fontSize: 11, fontWeight: 700, color: providerColor(provider), textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 0", marginTop: 4 }}>{provider}</div>
            {ALL_MODELS.filter((m) => m.provider === provider).map((m) => (
              <button key={m.id} onClick={() => setSelectedModel(m.id)} style={{ display: "block", width: "100%", textAlign: "left", background: selectedModel === m.id ? providerBg(provider) : "transparent", border: `1px solid ${selectedModel === m.id ? providerColor(provider) : "transparent"}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", marginBottom: 2, color: selectedModel === m.id ? providerColor(provider) : C.textMuted, fontSize: 11, fontFamily: "monospace", transition: "all 0.15s" }}>
                {m.id}
                {m.note && <span style={{ display: "block", fontSize: 10, fontFamily: "system-ui", color: selectedModel === m.id ? providerColor(provider) : C.textDim, marginTop: 1 }}>{m.note}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Card C={C} style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: selectedInfo ? providerBg(selectedInfo.provider) : C.grayDark, color: selectedInfo ? providerColor(selectedInfo.provider) : C.gray, borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{selectedInfo?.provider ?? "?"}</span>
            <code style={{ fontSize: 13, color: C.text, fontFamily: "monospace" }}>{selectedModel}</code>
            {streaming && <span style={{ fontSize: 12, color: C.emerald, marginLeft: "auto" }}>{t.generating}</span>}
            {messages.length > 0 && !streaming && <button onClick={() => { setMessages([]); setError(""); }} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 10px", fontSize: 12, color: C.textMuted, cursor: "pointer" }}>{t.clearChat}</button>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && !error && (
              <div style={{ textAlign: "center", color: C.textDim, fontSize: 14, marginTop: 40 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>💬</div>
                <div>{t.chatEmpty}</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>{t.chatEmptySub(selectedModel)}</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 3, fontWeight: 600 }}>{msg.role === "user" ? t.chatYou : selectedModel}</div>
                <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: 10, fontSize: 14, lineHeight: 1.6, background: msg.role === "user" ? `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})` : C.bgInput, color: msg.role === "user" ? "#fff" : C.text, border: msg.role === "assistant" ? `1px solid ${C.border}` : "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content || (streaming && i === messages.length - 1 ? <span style={{ color: C.textDim }}>▋</span> : "")}
                </div>
              </div>
            ))}
            {error && <div style={{ background: C.orangeDark, border: `1px solid ${C.orange}`, borderRadius: 8, padding: "9px 13px", fontSize: 13, color: C.orange }}>⚠️ {error}</div>}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={t.chatPlaceholder} rows={1} disabled={streaming} style={{ flex: 1, background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, color: C.text, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120, overflowY: "auto", opacity: streaming ? 0.6 : 1 }} />
            <button onClick={sendMessage} disabled={!input.trim() || streaming} style={{ background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: !input.trim() || streaming ? "not-allowed" : "pointer", opacity: !input.trim() || streaming ? 0.5 : 1, transition: "opacity 0.2s", whiteSpace: "nowrap" }}>
              {t.sendBtn}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsTab({ C, t, adminToken, proxyApiKey, onProxyKeyChange }: { C: Record<string, string>; t: TType; adminToken: string; proxyApiKey: string; onProxyKeyChange: (k: string) => void }) {
  const [newKey, setNewKey] = useState(proxyApiKey);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [keyMsg, setKeyMsg] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

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

  const msgStyle = (msg: string): React.CSSProperties => ({ fontSize: 13, marginTop: 8, color: msg.startsWith("✓") ? C.green : C.red, fontWeight: 600 });
  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ width: "100%", background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, ...extra });
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.07em" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 540 }}>
      <Section title={t.settingsKeyTitle} C={C}>
        <Card C={C}>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, marginTop: 0 }}>{t.settingsKeyDesc}</p>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>{t.settingsKeyLabel}</label>
            <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ ...inp(), color: C.cyan, fontFamily: "monospace" }} />
          </div>
          <button onClick={saveKey} disabled={savingKey || !newKey.trim() || newKey.trim() === proxyApiKey} style={{ background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: savingKey || !newKey.trim() || newKey.trim() === proxyApiKey ? "not-allowed" : "pointer", opacity: savingKey || !newKey.trim() || newKey.trim() === proxyApiKey ? 0.6 : 1 }}>
            {savingKey ? t.saving : t.saveKeyBtn}
          </button>
          {keyMsg && <div style={msgStyle(keyMsg)}>{keyMsg}</div>}
        </Card>
      </Section>

      <Section title={t.settingsPwdTitle} C={C}>
        <Card C={C}>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, marginTop: 0 }}>{t.settingsPwdDesc}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>{t.newPwdLabel}</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.newPwdPlaceholder} style={inp()} /></div>
            <div><label style={lbl}>{t.confirmPwdLabel}</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.confirmPwdPlaceholder} style={inp()} /></div>
          </div>
          <button onClick={savePassword} disabled={savingPwd || !newPassword.trim()} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: C.text, cursor: savingPwd || !newPassword.trim() ? "not-allowed" : "pointer", opacity: savingPwd || !newPassword.trim() ? 0.6 : 1 }}>
            {savingPwd ? t.saving : t.updatePwdBtn}
          </button>
          {pwdMsg && <div style={msgStyle(pwdMsg)}>{pwdMsg}</div>}
        </Card>
      </Section>
    </div>
  );
}

const CAP_LABEL: Record<Cap, { label: string; color: string }> = {
  stream:    { label: "Streaming",  color: "hsl(185,80%,55%)" },
  tools:     { label: "Tool Calls", color: "hsl(270,70%,65%)" },
  vision:    { label: "Vision",     color: "hsl(142,65%,50%)" },
  reasoning: { label: "Reasoning",  color: "hsl(30,90%,60%)"  },
  json:      { label: "JSON Mode",  color: "hsl(210,80%,60%)" },
};

function ModelsTab({ C, t, onGoChat }: { C: Record<string, string>; t: TType; onGoChat: (modelId: string) => void }) {
  const groups: { provider: string; color: string; bg: string; models: ModelMeta[] }[] = [
    { provider: "OpenAI",   color: C.blue,   bg: C.blueDark,   models: OPENAI_MODELS },
    { provider: "Anthropic",color: C.orange, bg: C.orangeDark, models: ANTHROPIC_MODELS },
    { provider: "Gemini",   color: C.emerald,bg: C.emeraldDark,models: GEMINI_MODELS },
  ];
  const total = ALL_MODELS.length;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        {[
          { label: t.tabModels, value: `${total}`, color: C.text },
          { label: "OpenAI",    value: `${OPENAI_MODELS.length}`,    color: C.blue },
          { label: "Anthropic", value: `${ANTHROPIC_MODELS.length}`, color: C.orange },
          { label: "Gemini",    value: `${GEMINI_MODELS.length}`,    color: C.emerald },
        ].map((s) => (
          <div key={s.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 20px", display: "flex", flexDirection: "column", gap: 4, minWidth: 90 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Provider sections */}
      {groups.map(({ provider, color, bg, models }) => (
        <div key={provider} style={{ marginBottom: 32 }}>
          {/* Provider header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 4, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{provider}</h2>
            <span style={{ background: bg, color, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{models.length} models</span>
          </div>

          {/* Model cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {models.map((m) => (
              <div key={m.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, transition: "border-color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}>
                {/* Model ID + note */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <code style={{ fontSize: 13, fontFamily: "monospace", color: C.text, fontWeight: 700, wordBreak: "break-all", flex: 1 }}>{m.id}</code>
                  {m.note && <span style={{ background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{m.note}</span>}
                </div>

                {/* Context window */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.textDim, fontWeight: 600 }}>Context</span>
                  <span style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 8px", fontSize: 12, fontFamily: "monospace", color: C.cyan, fontWeight: 700 }}>{m.ctx}</span>
                </div>

                {/* Capabilities */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {m.caps.map((cap) => {
                    const meta = CAP_LABEL[cap];
                    return <span key={cap} style={{ fontSize: 11, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40`, borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>{meta.label}</span>;
                  })}
                </div>

                {/* Route + test button */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <code style={{ fontSize: 11, color: C.textDim, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>{m.route}</code>
                  <button onClick={() => onGoChat(m.id)} style={{ background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {t.tabChat} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type CreditsResp = {
  total_granted: number; remaining: number; used_this_month: number;
  currency: string; expires_at: string | null; partial: boolean;
};

function fmtUsd(n: number): string {
  return "$" + n.toFixed(2);
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("portalLang") as Lang) ?? "cn");
  const [online, setOnline] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [proxyApiKey, setProxyApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<"dashboard" | "chat" | "models" | "settings">("dashboard");
  const [chatInitModel, setChatInitModel] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsResp | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsErr, setCreditsErr] = useState("");
  const C = dark ? DARK : LIGHT;
  const t = lang === "cn" ? T_CN : T_EN;
  const origin = window.location.origin;

  const handleSetLang = (l: Lang) => { setLang(l); localStorage.setItem("portalLang", l); };

  useEffect(() => { fetch("/api/healthz").then((r) => setOnline(r.ok)).catch(() => setOnline(false)); }, []);

  useEffect(() => {
    const stored = localStorage.getItem("portalToken");
    if (!stored) { setAuthChecked(true); return; }
    fetch("/api/config/settings", { headers: { "Authorization": `Bearer ${stored}` } })
      .then(async (r) => {
        if (r.ok) { const d = await r.json() as { proxyApiKey: string }; setAdminToken(stored); setProxyApiKey(d.proxyApiKey); setAuthed(true); }
        else localStorage.removeItem("portalToken");
        setAuthChecked(true);
      })
      .catch(() => { localStorage.removeItem("portalToken"); setAuthChecked(true); });
  }, []);

  const handleLogin = (token: string, key: string) => { localStorage.setItem("portalToken", token); setAdminToken(token); setProxyApiKey(key); setAuthed(true); };
  const handleLogout = async () => { await fetch("/api/config/logout", { method: "POST", headers: { "Authorization": `Bearer ${adminToken}` } }).catch(() => {}); localStorage.removeItem("portalToken"); setAdminToken(""); setProxyApiKey(""); setAuthed(false); };
  const handleForceRelogin = () => { localStorage.removeItem("portalToken"); setAdminToken(""); setProxyApiKey(""); setAuthed(false); };

  useEffect(() => {
    if (!authed || !adminToken) return;
    const load = async () => {
      setCreditsLoading(true);
      try {
        const res = await fetch("/api/credits", { headers: { "Authorization": `Bearer ${adminToken}` } });
        if (res.ok) { setCredits(await res.json() as CreditsResp); setCreditsErr(""); }
        else { const e = await res.json().catch(() => ({})) as { error?: string }; setCreditsErr(e.error ?? `HTTP ${res.status}`); }
      } catch (e) { setCreditsErr(e instanceof Error ? e.message : "Network error"); }
      finally { setCreditsLoading(false); }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [authed, adminToken]);

  if (!authChecked) {
    return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}><div style={{ color: C.textMuted, fontSize: 14 }}>{t.loading}</div></div>;
  }

  if (!authed) {
    return (
      <div>
        <div style={{ position: "absolute", top: 16, right: 16 }}><LangToggle lang={lang} setLang={handleSetLang} C={C} /></div>
        <LoginPage C={C} t={t} onLogin={handleLogin} />
      </div>
    );
  }

  const authHeader = `Authorization: Bearer ${proxyApiKey}`;
  const curlExample = `curl ${origin}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${proxyApiKey}" \\\n  -d '{\n    "model": "gemini-2.5-flash",\n    "messages": [{"role": "user", "content": "Hello!"}],\n    "stream": false\n  }'`;

  const handleGoChat = (modelId: string) => { setChatInitModel(modelId); setTab("chat"); };

  const TABS = [
    { key: "dashboard" as const, label: t.tabDashboard, icon: "▣" },
    { key: "chat" as const, label: t.tabChat, icon: "💬" },
    { key: "models" as const, label: t.tabModels, icon: "◈" },
    { key: "settings" as const, label: t.tabSettings, icon: "⚙" },
  ];

  const HEADER_H = 57;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.6, transition: "background 0.2s, color 0.2s" }}>
      {/* ── Top header ── */}
      <div style={{ height: HEADER_H, flexShrink: 0, borderBottom: `1px solid ${C.border}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgCard, zIndex: 10, transition: "background 0.2s, border-color 0.2s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>AI Proxy API</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>OpenAI · Anthropic · Gemini — reverse proxy · <span style={{ color: C.gradientB, fontWeight: 600 }}>by kilig</span></div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gradientB, background: C.purpleDark, border: `1px solid ${C.purple}`, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.06em", fontFamily: "monospace" }}>v2.3</div>
          <StatusDot online={online} C={C} t={t} />
          <LangToggle lang={lang} setLang={handleSetLang} C={C} />
          <button onClick={() => setDark((d) => !d)} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 17, cursor: "pointer", color: C.text, lineHeight: 1 }}>{dark ? "☀️" : "🌙"}</button>
          <button onClick={handleLogout} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer", color: C.textMuted, fontWeight: 500 }}>{t.logout}</button>
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar */}
        <div style={{ width: 180, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.bgCard, display: "flex", flexDirection: "column", padding: "16px 10px", gap: 4, overflowY: "auto", transition: "background 0.2s" }}>
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <button key={tb.key} onClick={() => setTab(tb.key)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: active ? (dark ? "hsl(222,40%,20%)" : C.bgInput) : "transparent", border: `1px solid ${active ? C.border : "transparent"}`, borderLeft: active ? `3px solid ${C.gradientA}` : "3px solid transparent", borderRadius: 8, padding: "9px 11px", cursor: "pointer", color: active ? C.text : C.textMuted, fontSize: 14, fontWeight: active ? 700 : 400, transition: "all 0.15s" }}>
                <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{tb.icon}</span>
                {tb.label}
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ maxWidth: tab === "chat" ? 9999 : 860, margin: "0 auto", padding: tab === "chat" ? "20px 20px 16px" : "28px 28px 60px" }}>
        {tab === "dashboard" && (
          <>
            {/* ── Credits Card ── */}
            <Section title={t.creditsTitle} C={C}>
              <Card C={C}>
                {creditsLoading && !credits ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[0, 1].map((i) => (
                        <div key={i} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
                          <div style={{ height: 10, width: "60%", background: C.border, borderRadius: 4, marginBottom: 14, animation: "pulse 1.4s ease-in-out infinite" }} />
                          <div style={{ height: 28, width: "80%", background: C.border, borderRadius: 4, marginBottom: 10, animation: "pulse 1.4s ease-in-out infinite" }} />
                          <div style={{ height: 8, width: "50%", background: C.border, borderRadius: 4, animation: "pulse 1.4s ease-in-out infinite" }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 6, background: C.bgInput, borderRadius: 3 }} />
                  </div>
                ) : creditsErr && !credits ? (
                  <div style={{ color: C.textDim, fontSize: 13 }}>{t.creditsUnavailableNote}</div>
                ) : credits ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Two stat rows */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Remaining */}
                      <div style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{t.creditsRemaining}</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: C.green, fontFamily: "monospace", letterSpacing: "-0.02em" }}>{fmtUsd(credits.remaining)}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{t.creditsTotal}: {fmtUsd(credits.total_granted)}</div>
                        {credits.expires_at && <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{t.creditsExpires}: {credits.expires_at.slice(0, 10)}</div>}
                      </div>
                      {/* Used this month */}
                      <div style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{t.creditsUsed}</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: C.orange, fontFamily: "monospace", letterSpacing: "-0.02em" }}>{fmtUsd(credits.used_this_month)}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                          {new Date().toLocaleString("default", { month: "long", year: "numeric" })}
                        </div>
                        {credits.partial && <div style={{ fontSize: 11, color: C.orange, marginTop: 2 }}>⚠ partial data</div>}
                      </div>
                    </div>
                    {/* Progress bar */}
                    {credits.total_granted > 0 && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textDim, marginBottom: 5 }}>
                          <span>{fmtUsd(credits.total_granted - credits.remaining)} used</span>
                          <span>{Math.round(((credits.total_granted - credits.remaining) / credits.total_granted) * 100)}%</span>
                        </div>
                        <div style={{ height: 6, background: C.bgInput, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, ((credits.total_granted - credits.remaining) / credits.total_granted) * 100)}%`, background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, borderRadius: 3, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    )}
                    {/* External API hint */}
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <code style={{ fontSize: 11, color: C.textDim, fontFamily: "monospace" }}>{t.creditsApiHint}</code>
                      <button onClick={() => { setCreditsLoading(true); fetch("/api/credits", { headers: { "Authorization": `Bearer ${adminToken}` } }).then(async r => { if (r.ok) { setCredits(await r.json() as CreditsResp); setCreditsErr(""); } }).catch(() => {}).finally(() => setCreditsLoading(false)); }} disabled={creditsLoading} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: creditsLoading ? "not-allowed" : "pointer", color: C.textMuted, opacity: creditsLoading ? 0.6 : 1 }}>{creditsLoading ? "..." : t.creditsRefresh}</button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </Section>

            <Section title={t.connDetails} C={C}>
              <Card C={C}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Base URL</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <code style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 14, color: C.cyan, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>{origin}</code>
                      <CopyButton text={origin} C={C} t={t} />
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Auth Header</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <code style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 13, color: C.orange, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>{authHeader}</code>
                      <CopyButton text={authHeader} C={C} t={t} />
                    </div>
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>{t.proxyKeyHint(proxyApiKey)}</p>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                            <code style={{ fontFamily: "monospace", fontSize: 14, color: C.text, fontWeight: 600 }}>{ep.path}</code>
                            <Badge color={tc} bg={tb}>{ep.type}</Badge>
                          </div>
                          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{ep.desc}</p>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {t.steps.map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>{step.title}</div>
                      <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{step.desc}</p>
                      {step.note && <p style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>{t.notePrefix}{step.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={t.quickTest} C={C}>
              <Card C={C} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.bgInput }}>
                  <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{t.curlLabel}</span>
                  <CopyButton text={curlExample} label={t.copyCmd} C={C} t={t} />
                </div>
                <pre style={{ margin: 0, padding: "16px 20px", fontSize: 13, fontFamily: "monospace", color: C.text, overflowX: "auto", lineHeight: 1.7, background: C.bgCard }}>
                  <span style={{ color: C.cyan }}>curl</span>{" "}<span style={{ color: C.orange }}>{origin}/v1/chat/completions</span>{" "}{`\\`}{"\n"}{"  "}
                  <span style={{ color: C.textMuted }}>-H</span>{" "}<span style={{ color: C.green }}>"Content-Type: application/json"</span>{" "}{`\\`}{"\n"}{"  "}
                  <span style={{ color: C.textMuted }}>-H</span>{" "}<span style={{ color: C.green }}>{`"Authorization: Bearer ${proxyApiKey}"`}</span>{" "}{`\\`}{"\n"}{"  "}
                  <span style={{ color: C.textMuted }}>-d</span>{" "}<span style={{ color: C.purple }}>{`'{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"stream":false}'`}</span>
                </pre>
              </Card>
            </Section>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, textAlign: "center", fontSize: 12, color: C.textDim }}>
              {t.footerPowered}{" "}<span style={{ color: C.blue }}>OpenAI</span> + <span style={{ color: C.orange }}>Anthropic</span> + <span style={{ color: C.emerald }}>Gemini</span>{" "}{t.footerVia}{" "}<span style={{ color: C.cyan }}>Replit AI Integrations</span>{" "}{t.footerSuffix}
            </div>
          </>
        )}

        {tab === "chat" && (
          <ChatTab C={C} t={t} proxyApiKey={proxyApiKey} adminToken={adminToken} onKeyRefresh={setProxyApiKey} onForceRelogin={handleForceRelogin} initModel={chatInitModel} />
        )}

        {tab === "models" && (
          <ModelsTab C={C} t={t} onGoChat={handleGoChat} />
        )}

        {tab === "settings" && (
          <SettingsTab C={C} t={t} adminToken={adminToken} proxyApiKey={proxyApiKey} onProxyKeyChange={setProxyApiKey} />
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

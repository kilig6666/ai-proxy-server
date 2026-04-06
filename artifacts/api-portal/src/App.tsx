import { useState, useEffect, useCallback, useRef } from "react";

const DARK: Record<string, string> = {
  bg: "hsl(222, 47%, 11%)",
  bgCard: "hsl(222, 40%, 15%)",
  bgInput: "hsl(222, 40%, 13%)",
  border: "hsl(222, 30%, 22%)",
  text: "hsl(210, 40%, 92%)",
  textMuted: "hsl(210, 20%, 60%)",
  textDim: "hsl(210, 15%, 45%)",
  green: "hsl(142, 70%, 45%)",
  red: "hsl(0, 70%, 55%)",
  blue: "hsl(210, 80%, 60%)",
  blueDark: "hsl(210, 80%, 20%)",
  purple: "hsl(270, 70%, 65%)",
  purpleDark: "hsl(270, 60%, 20%)",
  orange: "hsl(30, 90%, 60%)",
  orangeDark: "hsl(30, 70%, 18%)",
  cyan: "hsl(185, 80%, 55%)",
  gray: "hsl(220, 10%, 55%)",
  grayDark: "hsl(220, 15%, 20%)",
  emerald: "hsl(152, 65%, 50%)",
  emeraldDark: "hsl(152, 55%, 14%)",
  gradientA: "hsl(210, 80%, 60%)",
  gradientB: "hsl(270, 70%, 65%)",
};

const LIGHT: Record<string, string> = {
  bg: "hsl(210, 20%, 97%)",
  bgCard: "hsl(0, 0%, 100%)",
  bgInput: "hsl(210, 20%, 94%)",
  border: "hsl(210, 20%, 86%)",
  text: "hsl(222, 40%, 12%)",
  textMuted: "hsl(222, 15%, 40%)",
  textDim: "hsl(222, 10%, 55%)",
  green: "hsl(142, 60%, 35%)",
  red: "hsl(0, 65%, 48%)",
  blue: "hsl(210, 75%, 45%)",
  blueDark: "hsl(210, 80%, 92%)",
  purple: "hsl(270, 60%, 48%)",
  purpleDark: "hsl(270, 60%, 92%)",
  orange: "hsl(30, 85%, 45%)",
  orangeDark: "hsl(30, 90%, 92%)",
  cyan: "hsl(185, 70%, 38%)",
  gray: "hsl(220, 10%, 48%)",
  grayDark: "hsl(220, 15%, 92%)",
  emerald: "hsl(152, 60%, 35%)",
  emeraldDark: "hsl(152, 55%, 90%)",
  gradientA: "hsl(210, 80%, 55%)",
  gradientB: "hsl(270, 65%, 55%)",
};

const OPENAI_MODELS = [
  { id: "gpt-4o", note: "Recommended" },
  { id: "gpt-4o-mini", note: "Fast" },
  { id: "gpt-4.1", note: "Latest" },
  { id: "gpt-4.1-mini" },
  { id: "gpt-4.1-nano", note: "Fastest" },
  { id: "gpt-5", note: "Most capable" },
  { id: "gpt-5-mini" },
  { id: "o3-mini", note: "Reasoning" },
  { id: "o4-mini", note: "Reasoning" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6", note: "Most capable" },
  { id: "claude-opus-4-5" },
  { id: "claude-sonnet-4-6", note: "Recommended" },
  { id: "claude-sonnet-4-5" },
  { id: "claude-haiku-4-5", note: "Fastest" },
];

const GEMINI_MODELS = [
  { id: "gemini-2.5-pro", note: "Most capable" },
  { id: "gemini-2.5-flash", note: "Recommended" },
  { id: "gemini-3-flash-preview" },
  { id: "gemini-3-pro-preview" },
];

const ALL_MODELS = [
  ...OPENAI_MODELS.map((m) => ({ ...m, provider: "OpenAI" as const })),
  ...ANTHROPIC_MODELS.map((m) => ({ ...m, provider: "Anthropic" as const })),
  ...GEMINI_MODELS.map((m) => ({ ...m, provider: "Gemini" as const })),
];

const ENDPOINTS = [
  { method: "GET", path: "/v1/models", label: "List Models", type: "Both", desc: "Returns all available model IDs across OpenAI, Anthropic and Gemini" },
  { method: "POST", path: "/v1/chat/completions", label: "Chat Completions", type: "OpenAI", desc: "OpenAI-compatible chat API. Supports streaming, tool calls, and all models via prefix routing" },
  { method: "POST", path: "/v1/responses", label: "Responses API", type: "Responses", desc: "OpenAI Responses API pass-through. Supports gpt-5.4, gpt-5.3-codex, gpt-5.2-codex and all OpenAI models. Streaming supported." },
  { method: "POST", path: "/v1/messages", label: "Messages", type: "Anthropic", desc: "Anthropic native Messages API. Supports streaming, tool use, and both Claude & GPT models" },
];

const STEPS = [
  { num: 1, title: "Open CherryStudio Settings", desc: "Go to Settings → Model Providers and click Add Provider" },
  { num: 2, title: "Choose Provider Type", desc: 'Select "OpenAI" for chat/completions or "Anthropic" for native messages API', note: '"OpenAI" provider uses /v1/chat/completions; "Anthropic" provider uses /v1/messages. Both work with all models including Gemini.' },
  { num: 3, title: "Configure the Connection", desc: "Set Base URL to your app origin. Set API Key to your PROXY_API_KEY value" },
  { num: 4, title: "Select a Model and Chat", desc: "Choose any model from the list. GPT/o-series → OpenAI, Claude → Anthropic, Gemini → Google — routed automatically" },
];

type ChatMessage = { role: "user" | "assistant"; content: string };

function CopyButton({ text, label, C }: { text: string; label?: string; C: Record<string, string> }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }, [text]);
  return (
    <button onClick={handleCopy} style={{ background: copied ? C.green : C.bgInput, border: `1px solid ${copied ? C.green : C.border}`, color: copied ? "#fff" : C.textMuted, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}>
      {copied ? "Copied!" : label ?? "Copy"}
    </button>
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span style={{ background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em" }}>{children}</span>;
}

function MethodBadge({ method, C }: { method: string; C: Record<string, string> }) {
  const isGet = method === "GET";
  return (
    <span style={{ background: isGet ? "hsl(142,60%,18%)" : C.purpleDark, color: isGet ? C.green : C.purple, borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", minWidth: 48, display: "inline-block", textAlign: "center" }}>
      {method}
    </span>
  );
}

function StatusDot({ online, C }: { online: boolean | null; C: Record<string, string> }) {
  const color = online === null ? C.orange : online ? C.green : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block", boxShadow: `0 0 8px 2px ${color}`, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>{online === null ? "Checking..." : online ? "Online" : "Offline"}</span>
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

function LoginPage({ C, onLogin }: { C: Record<string, string>; onLogin: (token: string, proxyApiKey: string) => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/config/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("密码错误，请重试");
        setLoading(false);
        return;
      }
      const data = await res.json() as { token: string; proxyApiKey: string };
      onLogin(data.token, data.proxyApiKey);
    } catch {
      setError("连接服务器失败，请稍后重试");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: C.text, marginBottom: 6 }}>AI Proxy Portal</div>
          <div style={{ fontSize: 14, color: C.textMuted }}>请输入密码以继续</div>
        </div>
        <Card C={C}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>访问密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码..."
                autoFocus
                style={{ width: "100%", background: C.bgInput, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
              />
              {error && <div style={{ marginTop: 8, fontSize: 13, color: C.red }}>{error}</div>}
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              style={{ background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: loading || !password ? "not-allowed" : "pointer", opacity: loading || !password ? 0.7 : 1, transition: "opacity 0.2s" }}
            >
              {loading ? "验证中..." : "进入面板"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function ChatTab({ C, proxyApiKey }: { C: Record<string, string>; proxyApiKey: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const providerColor = (provider: string) => {
    if (provider === "OpenAI") return C.blue;
    if (provider === "Anthropic") return C.orange;
    return C.emerald;
  };
  const providerBg = (provider: string) => {
    if (provider === "OpenAI") return C.blueDark;
    if (provider === "Anthropic") return C.orangeDark;
    return C.emeraldDark;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setError("");
    setStreaming(true);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${proxyApiKey}` },
        body: JSON.stringify({ model: selectedModel, messages: newMessages, stream: true }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (errData as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
        setError(msg);
        setMessages(newMessages);
        setStreaming(false);
        return;
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
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
      setMessages(newMessages);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const selectedModelInfo = ALL_MODELS.find((m) => m.id === selectedModel);

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 130px)", minHeight: 500 }}>
      {/* Sidebar: model selector */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>选择模型</div>
        {(["OpenAI", "Anthropic", "Gemini"] as const).map((provider) => (
          <div key={provider}>
            <div style={{ fontSize: 11, fontWeight: 700, color: providerColor(provider), textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 0", marginTop: 4 }}>{provider}</div>
            {ALL_MODELS.filter((m) => m.provider === provider).map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: selectedModel === m.id ? providerBg(provider) : "transparent",
                  border: `1px solid ${selectedModel === m.id ? providerColor(provider) : "transparent"}`,
                  borderRadius: 6, padding: "6px 10px", cursor: "pointer", marginBottom: 3,
                  color: selectedModel === m.id ? providerColor(provider) : C.textMuted,
                  fontSize: 12, fontFamily: "monospace", transition: "all 0.15s",
                }}
              >
                {m.id}
                {m.note && <span style={{ display: "block", fontSize: 10, fontFamily: "system-ui", color: selectedModel === m.id ? providerColor(provider) : C.textDim, marginTop: 1 }}>{m.note}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Card C={C} style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          {/* Chat header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ background: selectedModelInfo ? providerBg(selectedModelInfo.provider) : C.grayDark, color: selectedModelInfo ? providerColor(selectedModelInfo.provider) : C.gray, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {selectedModelInfo?.provider ?? "Unknown"}
            </span>
            <code style={{ fontSize: 13, color: C.text, fontFamily: "monospace" }}>{selectedModel}</code>
            {streaming && <span style={{ fontSize: 12, color: C.emerald, marginLeft: "auto" }}>● 生成中...</span>}
            {messages.length > 0 && !streaming && (
              <button onClick={() => { setMessages([]); setError(""); }} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, color: C.textMuted, cursor: "pointer" }}>清空</button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.length === 0 && !error && (
              <div style={{ textAlign: "center", color: C.textDim, fontSize: 14, marginTop: 40 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>💬</div>
                <div>发送消息开始测试</div>
                <div style={{ fontSize: 12, marginTop: 6, color: C.textDim }}>使用 {selectedModel} 模型，通过本代理服务路由</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4, fontWeight: 600 }}>{msg.role === "user" ? "You" : selectedModel}</div>
                <div style={{
                  maxWidth: "85%", padding: "10px 14px", borderRadius: 10, fontSize: 14, lineHeight: 1.6,
                  background: msg.role === "user" ? `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})` : C.bgInput,
                  color: msg.role === "user" ? "#fff" : C.text,
                  border: msg.role === "assistant" ? `1px solid ${C.border}` : "none",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {msg.content || (streaming && i === messages.length - 1 ? <span style={{ color: C.textDim }}>▋</span> : "")}
                </div>
              </div>
            ))}
            {error && (
              <div style={{ background: C.orangeDark, border: `1px solid ${C.orange}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.orange }}>
                ⚠️ {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
              rows={1}
              disabled={streaming}
              style={{
                flex: 1, background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", resize: "none",
                fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
                opacity: streaming ? 0.6 : 1,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              style={{
                background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`,
                border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14,
                fontWeight: 700, color: "#fff", cursor: !input.trim() || streaming ? "not-allowed" : "pointer",
                opacity: !input.trim() || streaming ? 0.5 : 1, transition: "opacity 0.2s", whiteSpace: "nowrap",
              }}
            >
              发送
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsTab({ C, adminToken, proxyApiKey, onProxyKeyChange }: { C: Record<string, string>; adminToken: string; proxyApiKey: string; onProxyKeyChange: (key: string) => void }) {
  const [newKey, setNewKey] = useState(proxyApiKey);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [keyMsg, setKeyMsg] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  const saveKey = async () => {
    if (!newKey.trim()) return;
    setSavingKey(true);
    setKeyMsg("");
    try {
      const res = await fetch("/api/config/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` },
        body: JSON.stringify({ proxyApiKey: newKey.trim() }),
      });
      if (res.ok) {
        const data = await res.json() as { proxyApiKey: string };
        onProxyKeyChange(data.proxyApiKey);
        setKeyMsg("✓ 已保存");
        setTimeout(() => setKeyMsg(""), 3000);
      } else {
        setKeyMsg("✗ 保存失败");
      }
    } catch { setKeyMsg("✗ 网络错误"); }
    setSavingKey(false);
  };

  const savePassword = async () => {
    if (!newPassword.trim()) return;
    if (newPassword !== confirmPassword) { setPwdMsg("✗ 两次密码不一致"); return; }
    setSavingPwd(true);
    setPwdMsg("");
    try {
      const res = await fetch("/api/config/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` },
        body: JSON.stringify({ portalPassword: newPassword.trim() }),
      });
      if (res.ok) {
        setPwdMsg("✓ 密码已更新");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwdMsg(""), 3000);
      } else {
        setPwdMsg("✗ 保存失败");
      }
    } catch { setPwdMsg("✗ 网络错误"); }
    setSavingPwd(false);
  };

  const msgStyle = (msg: string): React.CSSProperties => ({
    fontSize: 13, marginTop: 8, color: msg.startsWith("✓") ? C.green : C.red, fontWeight: 600,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 540 }}>
      <Section title="API Key 配置" C={C}>
        <Card C={C}>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
            修改 Proxy API Key 后，所有客户端需使用新的 Key 才能访问。
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>当前 / 新 PROXY_API_KEY</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ width: "100%", background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, color: C.cyan, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <button
            onClick={saveKey}
            disabled={savingKey || !newKey.trim() || newKey.trim() === proxyApiKey}
            style={{ background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: savingKey || !newKey.trim() || newKey.trim() === proxyApiKey ? "not-allowed" : "pointer", opacity: savingKey || !newKey.trim() || newKey.trim() === proxyApiKey ? 0.6 : 1 }}
          >
            {savingKey ? "保存中..." : "保存 API Key"}
          </button>
          {keyMsg && <div style={msgStyle(keyMsg)}>{keyMsg}</div>}
        </Card>
      </Section>

      <Section title="修改访问密码" C={C}>
        <Card C={C}>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
            修改 Portal 登录密码后，下次登录需要使用新密码。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>新密码</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="输入新密码..." style={{ width: "100%", background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>确认新密码</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码..." style={{ width: "100%", background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <button
            onClick={savePassword}
            disabled={savingPwd || !newPassword.trim()}
            style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, color: C.text, cursor: savingPwd || !newPassword.trim() ? "not-allowed" : "pointer", opacity: savingPwd || !newPassword.trim() ? 0.6 : 1 }}
          >
            {savingPwd ? "保存中..." : "更新密码"}
          </button>
          {pwdMsg && <div style={msgStyle(pwdMsg)}>{pwdMsg}</div>}
        </Card>
      </Section>
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [online, setOnline] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [proxyApiKey, setProxyApiKey] = useState("981115");
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<"dashboard" | "chat" | "settings">("dashboard");
  const C = dark ? DARK : LIGHT;
  const origin = window.location.origin;

  useEffect(() => {
    fetch("/api/healthz").then((r) => setOnline(r.ok)).catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("portalToken");
    if (!stored) { setAuthChecked(true); return; }
    fetch("/api/config/settings", { headers: { "Authorization": `Bearer ${stored}` } })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json() as { proxyApiKey: string };
          setAdminToken(stored);
          setProxyApiKey(data.proxyApiKey);
          setAuthed(true);
        } else {
          localStorage.removeItem("portalToken");
        }
        setAuthChecked(true);
      })
      .catch(() => { localStorage.removeItem("portalToken"); setAuthChecked(true); });
  }, []);

  const handleLogin = (token: string, key: string) => {
    localStorage.setItem("portalToken", token);
    setAdminToken(token);
    setProxyApiKey(key);
    setAuthed(true);
  };

  const handleLogout = async () => {
    await fetch("/api/config/logout", { method: "POST", headers: { "Authorization": `Bearer ${adminToken}` } }).catch(() => {});
    localStorage.removeItem("portalToken");
    setAdminToken("");
    setAuthed(false);
  };

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ color: C.textMuted, fontSize: 14 }}>加载中...</div>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage C={C} onLogin={handleLogin} />;
  }

  const authHeader = `Authorization: Bearer ${proxyApiKey}`;
  const curlExample = `curl ${origin}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${proxyApiKey}" \\\n  -d '{\n    "model": "gemini-2.5-flash",\n    "messages": [{"role": "user", "content": "Hello!"}],\n    "stream": false\n  }'`;

  const TABS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "chat", label: "Chat Test" },
    { key: "settings", label: "Settings" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.6, transition: "background 0.2s, color 0.2s" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgCard, position: "sticky", top: 0, zIndex: 10, transition: "background 0.2s, border-color 0.2s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>AI Proxy API</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>OpenAI · Anthropic · Gemini — dual-compatible reverse proxy</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gradientB, background: C.purpleDark, border: `1px solid ${C.purple}`, borderRadius: 6, padding: "2px 8px", letterSpacing: "0.06em", fontFamily: "monospace" }}>v2.1</div>
          <StatusDot online={online} C={C} />
          <button onClick={() => setDark((d) => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 18, cursor: "pointer", color: C.text, transition: "all 0.2s", lineHeight: 1 }}>
            {dark ? "☀️" : "🌙"}
          </button>
          <button onClick={handleLogout} style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", color: C.textMuted, transition: "all 0.2s", fontWeight: 500 }}>退出</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: C.bgCard, padding: "0 24px", display: "flex", gap: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "transparent", border: "none", borderBottom: tab === t.key ? `2px solid ${C.gradientA}` : "2px solid transparent",
              padding: "12px 16px", fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? C.text : C.textMuted, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ maxWidth: tab === "chat" ? 1100 : 860, margin: "0 auto", padding: tab === "chat" ? "20px 16px 16px" : "32px 24px 60px" }}>
        {tab === "dashboard" && (
          <>
            <Section title="Connection Details" C={C}>
              <Card C={C}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Base URL</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <code style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 14, color: C.cyan, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>{origin}</code>
                      <CopyButton text={origin} C={C} />
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Auth Header</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <code style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 13, color: C.orange, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>{authHeader}</code>
                      <CopyButton text={authHeader} C={C} />
                    </div>
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>当前 PROXY_API_KEY: <code style={{ color: C.orange, fontSize: 12 }}>{proxyApiKey}</code> · 可在 Settings 页签修改</p>
                  </div>
                </div>
              </Card>
            </Section>

            <Section title="API Endpoints" C={C}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ENDPOINTS.map((ep) => {
                  const typeColor = ep.type === "OpenAI" ? C.blue : ep.type === "Anthropic" ? C.orange : ep.type === "Responses" ? C.emerald : C.gray;
                  const typeBg = ep.type === "OpenAI" ? C.blueDark : ep.type === "Anthropic" ? C.orangeDark : ep.type === "Responses" ? C.emeraldDark : C.grayDark;
                  return (
                    <Card key={ep.path} C={C}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <MethodBadge method={ep.method} C={C} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                            <code style={{ fontFamily: "monospace", fontSize: 14, color: C.text, fontWeight: 600 }}>{ep.path}</code>
                            <Badge color={typeColor} bg={typeBg}>{ep.type}</Badge>
                          </div>
                          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{ep.desc}</p>
                        </div>
                        <CopyButton text={`${origin}${ep.path}`} label="Copy URL" C={C} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Section>

            <Section title="Available Models" C={C}>
              <ModelGroup title="OpenAI" models={OPENAI_MODELS} color={C.blue} bg={C.blueDark} C={C} />
              <ModelGroup title="Anthropic" models={ANTHROPIC_MODELS} color={C.orange} bg={C.orangeDark} C={C} />
              <ModelGroup title="Google Gemini" models={GEMINI_MODELS} color={C.emerald} bg={C.emeraldDark} C={C} />
            </Section>

            <Section title="CherryStudio Setup Guide" C={C}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {STEPS.map((step) => (
                  <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: 16, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{step.num}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>{step.title}</div>
                      <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{step.desc}</p>
                      {step.note && <p style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>Note: {step.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Quick Test (curl)" C={C}>
              <Card C={C} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.bgInput }}>
                  <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>curl example — Gemini model</span>
                  <CopyButton text={curlExample} label="Copy command" C={C} />
                </div>
                <pre style={{ margin: 0, padding: "16px 20px", fontSize: 13, fontFamily: "monospace", color: C.text, overflowX: "auto", lineHeight: 1.7, background: C.bgCard }}>
                  <span style={{ color: C.cyan }}>curl</span>{" "}
                  <span style={{ color: C.orange }}>{origin}/v1/chat/completions</span>{" "}
                  {`\\`}{"\n"}{"  "}
                  <span style={{ color: C.textMuted }}>-H</span>{" "}
                  <span style={{ color: C.green }}>"Content-Type: application/json"</span>{" "}
                  {`\\`}{"\n"}{"  "}
                  <span style={{ color: C.textMuted }}>-H</span>{" "}
                  <span style={{ color: C.green }}>{`"Authorization: Bearer ${proxyApiKey}"`}</span>{" "}
                  {`\\`}{"\n"}{"  "}
                  <span style={{ color: C.textMuted }}>-d</span>{" "}
                  <span style={{ color: C.purple }}>{`'{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"stream":false}'`}</span>
                </pre>
              </Card>
            </Section>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, textAlign: "center", fontSize: 12, color: C.textDim }}>
              Powered by{" "}
              <span style={{ color: C.blue }}>OpenAI</span> +{" "}
              <span style={{ color: C.orange }}>Anthropic</span> +{" "}
              <span style={{ color: C.emerald }}>Gemini</span> via{" "}
              <span style={{ color: C.cyan }}>Replit AI Integrations</span> &middot; Express.js reverse proxy &middot; No API keys required
            </div>
          </>
        )}

        {tab === "chat" && (
          <ChatTab C={C} proxyApiKey={proxyApiKey} />
        )}

        {tab === "settings" && (
          <SettingsTab C={C} adminToken={adminToken} proxyApiKey={proxyApiKey} onProxyKeyChange={setProxyApiKey} />
        )}
      </div>
    </div>
  );
}

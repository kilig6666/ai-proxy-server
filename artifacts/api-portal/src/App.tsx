import { useState, useEffect, useCallback } from "react";

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
  { id: "gpt-5.2", note: "Most capable" },
  { id: "gpt-5.1" },
  { id: "gpt-5" },
  { id: "gpt-5-mini", note: "Cost-effective" },
  { id: "gpt-5-nano", note: "Fastest" },
  { id: "o4-mini", note: "Reasoning" },
  { id: "o3", note: "Best reasoning" },
  { id: "o3-mini", note: "Reasoning" },
  { id: "gpt-4.1", note: "Legacy" },
  { id: "gpt-4.1-mini", note: "Legacy" },
  { id: "gpt-4.1-nano", note: "Legacy" },
  { id: "gpt-4o", note: "Legacy" },
  { id: "gpt-4o-mini", note: "Legacy" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6", note: "Most capable" },
  { id: "claude-opus-4-5" },
  { id: "claude-opus-4-1" },
  { id: "claude-sonnet-4-6", note: "Recommended" },
  { id: "claude-sonnet-4-5" },
  { id: "claude-haiku-4-5", note: "Fastest" },
];

const GEMINI_MODELS = [
  { id: "gemini-3.1-pro-preview", note: "Latest & best" },
  { id: "gemini-3-pro-preview", note: "Powerful" },
  { id: "gemini-3-flash-preview", note: "Recommended" },
  { id: "gemini-2.5-pro", note: "Coding & reasoning" },
  { id: "gemini-2.5-flash", note: "High-volume" },
];

const ENDPOINTS = [
  {
    method: "GET",
    path: "/v1/models",
    label: "List Models",
    type: "Both",
    desc: "Returns all available model IDs across OpenAI, Anthropic and Gemini",
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    label: "Chat Completions",
    type: "OpenAI",
    desc: "OpenAI-compatible chat API. Supports streaming, tool calls, and all models via prefix routing",
  },
  {
    method: "POST",
    path: "/v1/messages",
    label: "Messages",
    type: "Anthropic",
    desc: "Anthropic native Messages API. Supports streaming, tool use, and both Claude & GPT models",
  },
];

const STEPS = [
  {
    num: 1,
    title: "Open CherryStudio Settings",
    desc: "Go to Settings → Model Providers and click Add Provider",
  },
  {
    num: 2,
    title: "Choose Provider Type",
    desc: 'Select "OpenAI" for chat/completions or "Anthropic" for native messages API',
    note: '"OpenAI" provider uses /v1/chat/completions; "Anthropic" provider uses /v1/messages. Both work with all models including Gemini.',
  },
  {
    num: 3,
    title: "Configure the Connection",
    desc: "Set Base URL to your app origin. Set API Key to your PROXY_API_KEY value",
  },
  {
    num: 4,
    title: "Select a Model and Chat",
    desc: "Choose any model from the list. GPT/o-series → OpenAI, Claude → Anthropic, Gemini → Google — routed automatically",
  },
];

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
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? C.green : C.bgInput,
        border: `1px solid ${copied ? C.green : C.border}`,
        color: copied ? "#fff" : C.textMuted,
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "Copied!" : label ?? "Copy"}
    </button>
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{ background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em" }}>
      {children}
    </span>
  );
}

function MethodBadge({ method, C }: { method: string; C: Record<string, string> }) {
  const isGet = method === "GET";
  return (
    <span style={{
      background: isGet ? "hsl(142,60%,18%)" : C.purpleDark,
      color: isGet ? C.green : C.purple,
      borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 700,
      fontFamily: "monospace", letterSpacing: "0.05em",
      minWidth: 48, display: "inline-block", textAlign: "center",
    }}>
      {method}
    </span>
  );
}

function StatusDot({ online, C }: { online: boolean | null; C: Record<string, string> }) {
  const color = online === null ? C.orange : online ? C.green : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block", boxShadow: `0 0 8px 2px ${color}`, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>
        {online === null ? "Checking..." : online ? "Online" : "Offline"}
      </span>
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
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", ...style }}>
      {children}
    </div>
  );
}

function ModelGroup({
  title, models, color, bg, C,
}: {
  title: string;
  models: { id: string; note?: string }[];
  color: string;
  bg: string;
  C: Record<string, string>;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
        {models.map((m) => (
          <Card key={m.id} C={C} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px" }}>
            <code style={{ fontSize: 12, color: C.text, fontFamily: "monospace", wordBreak: "break-all", flex: 1 }}>{m.id}</code>
            {m.note && (
              <span style={{ fontSize: 11, color, background: bg, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{m.note}</span>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [dark, setDark] = useState(true);
  const C = dark ? DARK : LIGHT;
  const origin = window.location.origin;
  const authHeader = `Authorization: Bearer 981115`;

  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  const curlExample = `curl ${origin}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer 981115" \\
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'`;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.6, transition: "background 0.2s, color 0.2s" }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: "18px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.bgCard, position: "sticky", top: 0, zIndex: 10,
        transition: "background 0.2s, border-color 0.2s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>AI Proxy API</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>OpenAI · Anthropic · Gemini — dual-compatible reverse proxy</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <StatusDot online={online} C={C} />
          <button
            onClick={() => setDark((d) => !d)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: C.bgInput, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "6px 12px", fontSize: 18,
              cursor: "pointer", color: C.text, transition: "all 0.2s",
              lineHeight: 1,
            }}
          >
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 60px" }}>

        {/* Connection Details */}
        <Section title="Connection Details" C={C}>
          <Card C={C}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Base URL</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <code style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 14, color: C.cyan, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>
                    {origin}
                  </code>
                  <CopyButton text={origin} C={C} />
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Auth Header</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <code style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 13, color: C.orange, fontFamily: "monospace", flex: 1, minWidth: 0, wordBreak: "break-all" }}>
                    {authHeader}
                  </code>
                  <CopyButton text={authHeader} C={C} />
                </div>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
                  Replace <code style={{ color: C.orange, fontSize: 12 }}>981115</code> with your actual <strong>PROXY_API_KEY</strong> value if it changes
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* API Endpoints */}
        <Section title="API Endpoints" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ENDPOINTS.map((ep) => {
              const typeColor = ep.type === "OpenAI" ? C.blue : ep.type === "Anthropic" ? C.orange : C.gray;
              const typeBg = ep.type === "OpenAI" ? C.blueDark : ep.type === "Anthropic" ? C.orangeDark : C.grayDark;
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

        {/* Available Models */}
        <Section title="Available Models" C={C}>
          <ModelGroup title="OpenAI" models={OPENAI_MODELS} color={C.blue} bg={C.blueDark} C={C} />
          <ModelGroup title="Anthropic" models={ANTHROPIC_MODELS} color={C.orange} bg={C.orangeDark} C={C} />
          <ModelGroup title="Google Gemini" models={GEMINI_MODELS} color={C.emerald} bg={C.emeraldDark} C={C} />
        </Section>

        {/* CherryStudio Setup */}
        <Section title="CherryStudio Setup Guide" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STEPS.map((step) => (
              <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: 16, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.gradientA}, ${C.gradientB})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {step.num}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>{step.title}</div>
                  <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{step.desc}</p>
                  {step.note && (
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                      Note: {step.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Quick Test */}
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
              <span style={{ color: C.green }}>"Authorization: Bearer 981115"</span>{" "}
              {`\\`}{"\n"}{"  "}
              <span style={{ color: C.textMuted }}>-d</span>{" "}
              <span style={{ color: C.purple }}>{`'{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"stream":false}'`}</span>
            </pre>
          </Card>
        </Section>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, textAlign: "center", fontSize: 12, color: C.textDim }}>
          Powered by{" "}
          <span style={{ color: C.blue }}>OpenAI</span> +{" "}
          <span style={{ color: C.orange }}>Anthropic</span> +{" "}
          <span style={{ color: C.emerald }}>Gemini</span> via{" "}
          <span style={{ color: C.cyan }}>Replit AI Integrations</span> &middot; Express.js reverse proxy &middot; No API keys required
        </div>
      </div>
    </div>
  );
}

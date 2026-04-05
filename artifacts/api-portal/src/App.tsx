import { useState, useEffect, useCallback } from "react";

const COLORS = {
  bg: "hsl(222, 47%, 11%)",
  bgCard: "hsl(222, 40%, 15%)",
  bgCardHover: "hsl(222, 38%, 18%)",
  bgInput: "hsl(222, 40%, 13%)",
  border: "hsl(222, 30%, 22%)",
  text: "hsl(210, 40%, 92%)",
  textMuted: "hsl(210, 20%, 60%)",
  textDim: "hsl(210, 15%, 45%)",
  green: "hsl(142, 70%, 45%)",
  greenGlow: "hsl(142, 70%, 45%)",
  red: "hsl(0, 70%, 55%)",
  blue: "hsl(210, 80%, 60%)",
  blueDark: "hsl(210, 80%, 20%)",
  purple: "hsl(270, 70%, 65%)",
  purpleDark: "hsl(270, 60%, 20%)",
  orange: "hsl(30, 90%, 60%)",
  orangeDark: "hsl(30, 70%, 18%)",
  cyan: "hsl(185, 80%, 55%)",
  cyanDark: "hsl(185, 60%, 15%)",
  gray: "hsl(220, 10%, 55%)",
  grayDark: "hsl(220, 15%, 20%)",
  gradientA: "hsl(210, 80%, 60%)",
  gradientB: "hsl(270, 70%, 65%)",
};

const MODELS = [
  { id: "gpt-5.2", provider: "OpenAI" },
  { id: "gpt-5-mini", provider: "OpenAI" },
  { id: "gpt-5-nano", provider: "OpenAI" },
  { id: "o4-mini", provider: "OpenAI" },
  { id: "o3", provider: "OpenAI" },
  { id: "claude-opus-4-6", provider: "Anthropic" },
  { id: "claude-sonnet-4-6", provider: "Anthropic" },
  { id: "claude-haiku-4-5", provider: "Anthropic" },
];

const ENDPOINTS = [
  {
    method: "GET",
    path: "/v1/models",
    label: "List Models",
    type: "Both",
    desc: "Returns all available model IDs across OpenAI and Anthropic",
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    label: "Chat Completions",
    type: "OpenAI",
    desc: "OpenAI-compatible chat API. Supports streaming, tool calls, and both OpenAI & Claude models via model prefix routing",
  },
  {
    method: "POST",
    path: "/v1/messages",
    label: "Messages",
    type: "Anthropic",
    desc: "Anthropic native Messages API. Supports streaming, tool use, and both Claude & GPT models via model prefix routing",
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
  },
  {
    num: 3,
    title: "Configure the Connection",
    desc: "Set Base URL to your app origin. Set API Key to your PROXY_API_KEY value",
  },
  {
    num: 4,
    title: "Select a Model and Chat",
    desc: "Choose any model from the list above. GPT models route to OpenAI, Claude models route to Anthropic — automatically",
  },
];

function CopyButton({ text, label }: { text: string; label?: string }) {
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
        background: copied ? COLORS.green : COLORS.bgInput,
        border: `1px solid ${copied ? COLORS.green : COLORS.border}`,
        color: copied ? "#fff" : COLORS.textMuted,
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

function Badge({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        background: bg,
        color,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {children}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const isGet = method === "GET";
  return (
    <span
      style={{
        background: isGet ? "hsl(142,60%,18%)" : "hsl(270,60%,20%)",
        color: isGet ? COLORS.green : COLORS.purple,
        borderRadius: 4,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "monospace",
        letterSpacing: "0.05em",
        minWidth: 48,
        display: "inline-block",
        textAlign: "center",
      }}
    >
      {method}
    </span>
  );
}

function StatusDot({ online }: { online: boolean | null }) {
  const color = online === null ? COLORS.orange : online ? COLORS.green : COLORS.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          boxShadow: `0 0 8px 2px ${color}`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>
        {online === null ? "Checking..." : online ? "Online" : "Offline"}
      </span>
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        style={{
          color: COLORS.text,
          fontSize: 17,
          fontWeight: 700,
          marginBottom: 14,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: "16px 20px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const origin = window.location.origin;
  const baseUrl = origin;
  const authHeader = `Authorization: Bearer YOUR_PROXY_API_KEY`;

  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_PROXY_API_KEY" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        lineHeight: 1.6,
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: COLORS.bgCard,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${COLORS.gradientA}, ${COLORS.gradientB})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text }}>
              AI Proxy API
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>
              OpenAI + Anthropic dual-compatible reverse proxy
            </div>
          </div>
        </div>
        <StatusDot online={online} />
      </div>

      {/* Main content */}
      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "32px 24px 60px",
        }}
      >
        {/* Connection Details */}
        <Section title="Connection Details">
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Base URL
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <code
                    style={{
                      background: COLORS.bgInput,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 14,
                      color: COLORS.cyan,
                      fontFamily: "monospace",
                      flex: 1,
                      minWidth: 0,
                      wordBreak: "break-all",
                    }}
                  >
                    {baseUrl}
                  </code>
                  <CopyButton text={baseUrl} />
                </div>
              </div>
              <div
                style={{
                  borderTop: `1px solid ${COLORS.border}`,
                  paddingTop: 14,
                }}
              >
                <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Auth Header
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <code
                    style={{
                      background: COLORS.bgInput,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 13,
                      color: COLORS.orange,
                      fontFamily: "monospace",
                      flex: 1,
                      minWidth: 0,
                      wordBreak: "break-all",
                    }}
                  >
                    {authHeader}
                  </code>
                  <CopyButton text={authHeader} />
                </div>
                <p style={{ fontSize: 12, color: COLORS.textDim, marginTop: 8 }}>
                  Replace <code style={{ color: COLORS.orange, fontSize: 12 }}>YOUR_PROXY_API_KEY</code> with your <strong>PROXY_API_KEY</strong> secret value
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* API Endpoints */}
        <Section title="API Endpoints">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ENDPOINTS.map((ep) => {
              const typeColor =
                ep.type === "OpenAI"
                  ? COLORS.blue
                  : ep.type === "Anthropic"
                  ? COLORS.orange
                  : COLORS.gray;
              const typeBg =
                ep.type === "OpenAI"
                  ? COLORS.blueDark
                  : ep.type === "Anthropic"
                  ? COLORS.orangeDark
                  : COLORS.grayDark;
              const fullUrl = `${baseUrl}${ep.path}`;
              return (
                <Card key={ep.path}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <MethodBadge method={ep.method} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <code
                          style={{
                            fontFamily: "monospace",
                            fontSize: 14,
                            color: COLORS.text,
                            fontWeight: 600,
                          }}
                        >
                          {ep.path}
                        </code>
                        <Badge color={typeColor} bg={typeBg}>
                          {ep.type}
                        </Badge>
                      </div>
                      <p style={{ fontSize: 13, color: COLORS.textMuted, margin: 0 }}>
                        {ep.desc}
                      </p>
                    </div>
                    <CopyButton text={fullUrl} label="Copy URL" />
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>

        {/* Available Models */}
        <Section title="Available Models">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            {MODELS.map((m) => {
              const isOpenAI = m.provider === "OpenAI";
              return (
                <Card
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "12px 14px",
                  }}
                >
                  <code
                    style={{
                      fontSize: 13,
                      color: COLORS.text,
                      fontFamily: "monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    {m.id}
                  </code>
                  <Badge
                    color={isOpenAI ? COLORS.blue : COLORS.orange}
                    bg={isOpenAI ? COLORS.blueDark : COLORS.orangeDark}
                  >
                    {m.provider}
                  </Badge>
                </Card>
              );
            })}
          </div>
        </Section>

        {/* CherryStudio Setup */}
        <Section title="CherryStudio Setup Guide">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STEPS.map((step) => (
              <div
                key={step.num}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: "14px 18px",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${COLORS.gradientA}, ${COLORS.gradientB})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: COLORS.text,
                      marginBottom: 4,
                    }}
                  >
                    {step.title}
                  </div>
                  <p style={{ fontSize: 13, color: COLORS.textMuted, margin: 0 }}>
                    {step.desc}
                  </p>
                  {step.num === 2 && (
                    <p style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6 }}>
                      Note: "OpenAI" provider uses <code style={{ fontSize: 12 }}>/v1/chat/completions</code>; "Anthropic" provider uses <code style={{ fontSize: 12 }}>/v1/messages</code>. Both work with all models.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Quick Test */}
        <Section title="Quick Test (curl)">
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: `1px solid ${COLORS.border}`,
                background: COLORS.bgInput,
              }}
            >
              <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>
                curl example
              </span>
              <CopyButton text={curlExample} label="Copy command" />
            </div>
            <pre
              style={{
                margin: 0,
                padding: "16px 20px",
                fontSize: 13,
                fontFamily: "monospace",
                color: COLORS.text,
                overflowX: "auto",
                lineHeight: 1.7,
              }}
            >
              <span style={{ color: COLORS.cyan }}>curl</span>{" "}
              <span style={{ color: COLORS.orange }}>{baseUrl}/v1/chat/completions</span>{" "}
              {`\\`}{"\n"}{"  "}
              <span style={{ color: COLORS.textMuted }}>-H</span>{" "}
              <span style={{ color: COLORS.green }}>"Content-Type: application/json"</span>{" "}
              {`\\`}{"\n"}{"  "}
              <span style={{ color: COLORS.textMuted }}>-H</span>{" "}
              <span style={{ color: COLORS.green }}>"Authorization: Bearer YOUR_PROXY_API_KEY"</span>{" "}
              {`\\`}{"\n"}{"  "}
              <span style={{ color: COLORS.textMuted }}>-d</span>{" "}
              <span style={{ color: COLORS.purple }}>{`'{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello!"}],"stream":false}'`}</span>
            </pre>
          </Card>
        </Section>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 24,
            textAlign: "center",
            fontSize: 12,
            color: COLORS.textDim,
          }}
        >
          Powered by{" "}
          <span style={{ color: COLORS.blue }}>OpenAI</span> +{" "}
          <span style={{ color: COLORS.orange }}>Anthropic</span> via{" "}
          <span style={{ color: COLORS.cyan }}>Replit AI Integrations</span> &middot;
          Express.js reverse proxy &middot; No API keys required
        </div>
      </div>
    </div>
  );
}

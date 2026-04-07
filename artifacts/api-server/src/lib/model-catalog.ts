export type ProviderId = "openai" | "anthropic" | "gemini";
export type ThinkingCapabilityMode = "effort" | "budget" | "hybrid";

export interface ThinkingCapability {
  supported: boolean;
  mode: ThinkingCapabilityMode;
  supportsAuto?: boolean;
  supportsMax?: boolean;
}

export interface ProxyModelDefinition {
  id: string;
  provider: ProviderId;
  ownedBy: "openai" | "anthropic" | "google";
  routes: string[];
  thinking: ThinkingCapability;
}

const NO_THINKING: ThinkingCapability = { supported: false, mode: "effort" };
const OPENAI_THINKING: ThinkingCapability = { supported: true, mode: "effort" };
const CLAUDE_BUDGET_THINKING: ThinkingCapability = { supported: true, mode: "budget", supportsAuto: true };
const CLAUDE_ADAPTIVE_THINKING: ThinkingCapability = { supported: true, mode: "hybrid", supportsAuto: true };
const CLAUDE_ADAPTIVE_MAX_THINKING: ThinkingCapability = { supported: true, mode: "hybrid", supportsAuto: true, supportsMax: true };
const GEMINI_THINKING: ThinkingCapability = { supported: true, mode: "hybrid", supportsAuto: true };

export const PROXY_MODEL_CATALOG: ProxyModelDefinition[] = [
  { id: "gpt-5.4", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-5.2", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-5.1", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-5", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-5-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-5-nano", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "o4-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "o3", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "o3-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-4.1", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING },
  { id: "gpt-4.1-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING },
  { id: "gpt-4.1-nano", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING },
  { id: "gpt-4o", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING },
  { id: "gpt-4o-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING },
  { id: "gpt-5.3-codex", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "gpt-5.2-codex", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING },
  { id: "claude-opus-4-6", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_ADAPTIVE_MAX_THINKING },
  { id: "claude-opus-4-5", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_BUDGET_THINKING },
  { id: "claude-opus-4-1", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_BUDGET_THINKING },
  { id: "claude-sonnet-4-6", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_ADAPTIVE_THINKING },
  { id: "claude-sonnet-4-5", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_BUDGET_THINKING },
  { id: "claude-haiku-4-5", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: NO_THINKING },
  { id: "gemini-3.1-pro-preview", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING },
  { id: "gemini-3-pro-preview", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING },
  { id: "gemini-3-flash-preview", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING },
  { id: "gemini-2.5-pro", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING },
  { id: "gemini-2.5-flash", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING },
];

export function getModelDefinition(model: string): ProxyModelDefinition | undefined {
  return PROXY_MODEL_CATALOG.find((item) => item.id === model);
}

export function listModelObjects(now = Math.floor(Date.now() / 1000)): Array<{ id: string; object: "model"; created: number; owned_by: string }> {
  return PROXY_MODEL_CATALOG.map((item) => ({
    id: item.id,
    object: "model",
    created: now,
    owned_by: item.ownedBy,
  }));
}

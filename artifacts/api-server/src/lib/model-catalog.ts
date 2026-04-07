export type ProviderId = "openai" | "anthropic" | "gemini";
export type ThinkingCapabilityMode = "effort" | "budget" | "hybrid";
export type VisionRoute = "chat" | "messages" | "responses";

export interface ThinkingCapability {
  supported: boolean;
  mode: ThinkingCapabilityMode;
  supportsAuto?: boolean;
  supportsMax?: boolean;
}

export interface VisionCapability {
  supported: boolean;
}

export interface ProxyModelDefinition {
  id: string;
  provider: ProviderId;
  ownedBy: "openai" | "anthropic" | "google";
  routes: string[];
  thinking: ThinkingCapability;
  vision: VisionCapability;
}

const NO_THINKING: ThinkingCapability = { supported: false, mode: "effort" };
const OPENAI_THINKING: ThinkingCapability = { supported: true, mode: "effort" };
const CLAUDE_BUDGET_THINKING: ThinkingCapability = { supported: true, mode: "budget", supportsAuto: true };
const CLAUDE_ADAPTIVE_THINKING: ThinkingCapability = { supported: true, mode: "hybrid", supportsAuto: true };
const CLAUDE_ADAPTIVE_MAX_THINKING: ThinkingCapability = { supported: true, mode: "hybrid", supportsAuto: true, supportsMax: true };
const GEMINI_THINKING: ThinkingCapability = { supported: true, mode: "hybrid", supportsAuto: true };
const NO_VISION: VisionCapability = { supported: false };
const WITH_VISION: VisionCapability = { supported: true };

export const PROXY_MODEL_CATALOG: ProxyModelDefinition[] = [
  { id: "gpt-5.4", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "gpt-5.2", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "gpt-5.1", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "gpt-5", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "gpt-5-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "gpt-5-nano", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "o4-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "o3", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "o3-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: NO_VISION },
  { id: "gpt-4.1", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING, vision: WITH_VISION },
  { id: "gpt-4.1-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING, vision: WITH_VISION },
  { id: "gpt-4.1-nano", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING, vision: WITH_VISION },
  { id: "gpt-4o", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING, vision: WITH_VISION },
  { id: "gpt-4o-mini", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: NO_THINKING, vision: WITH_VISION },
  { id: "gpt-5.3-codex", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "gpt-5.2-codex", provider: "openai", ownedBy: "openai", routes: ["/v1/chat/completions", "/v1/responses"], thinking: OPENAI_THINKING, vision: WITH_VISION },
  { id: "claude-opus-4-6", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_ADAPTIVE_MAX_THINKING, vision: WITH_VISION },
  { id: "claude-opus-4-5", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_BUDGET_THINKING, vision: WITH_VISION },
  { id: "claude-opus-4-1", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_BUDGET_THINKING, vision: WITH_VISION },
  { id: "claude-sonnet-4-6", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_ADAPTIVE_THINKING, vision: WITH_VISION },
  { id: "claude-sonnet-4-5", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: CLAUDE_BUDGET_THINKING, vision: WITH_VISION },
  { id: "claude-haiku-4-5", provider: "anthropic", ownedBy: "anthropic", routes: ["/v1/chat/completions", "/v1/messages"], thinking: NO_THINKING, vision: WITH_VISION },
  { id: "gemini-3.1-pro-preview", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING, vision: WITH_VISION },
  { id: "gemini-3-pro-preview", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING, vision: WITH_VISION },
  { id: "gemini-3-flash-preview", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING, vision: WITH_VISION },
  { id: "gemini-2.5-pro", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING, vision: WITH_VISION },
  { id: "gemini-2.5-flash", provider: "gemini", ownedBy: "google", routes: ["/v1/chat/completions", "/v1/messages"], thinking: GEMINI_THINKING, vision: WITH_VISION },
];

function normalizeCatalogModelId(model: string): string {
  return model.replace(/\((?:[^()]*)\)$/, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsType(value: unknown, expectedType: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsType(item, expectedType));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  if (value.type === expectedType) {
    return true;
  }

  return Object.values(value).some((entry) => containsType(entry, expectedType));
}

export function getModelDefinition(model: string): ProxyModelDefinition | undefined {
  const normalizedModel = normalizeCatalogModelId(model);
  return PROXY_MODEL_CATALOG.find((item) => item.id === normalizedModel);
}

export function supportsVision(model: string): boolean {
  return Boolean(getModelDefinition(model)?.vision.supported);
}

export function requestHasVisionInput(route: VisionRoute, body: unknown): boolean {
  if (!isPlainObject(body)) return false;

  switch (route) {
    case "chat":
      return containsType(body.messages, "image_url");
    case "messages":
      return containsType(body.messages, "image");
    case "responses":
      return containsType(body.input, "input_image");
    default:
      return false;
  }
}

export function listModelObjects(now = Math.floor(Date.now() / 1000)): Array<{ id: string; object: "model"; created: number; owned_by: string }> {
  return PROXY_MODEL_CATALOG.map((item) => ({
    id: item.id,
    object: "model",
    created: now,
    owned_by: item.ownedBy,
  }));
}

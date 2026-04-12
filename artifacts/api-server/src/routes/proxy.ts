import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { getConfig } from "../lib/config.js";
import { fetchCredits, buildCreditsJson } from "../lib/credits.js";
import { appendUsage } from "../lib/usage-log.js";
import { getModelDefinition, listModelObjects, requestHasVisionInput, supportsVision } from "../lib/model-catalog.js";
import { getAllSyncedModels } from "../lib/model-sync.js";
import { normalizeSamplingParams } from "../lib/sampling.js";
import {
  buildAnthropicThinkingPayload,
  buildGeminiThinkingConfig,
  buildOpenAIReasoningEffort,
  buildResponsesReasoning,
  buildThinkingLogMeta,
  collectReasoningTexts,
  joinReasoningTexts,
  resolveThinkingRequest,
  stripAllKnownThinkingFields,
  stripThinkingModelSuffix,
} from "../lib/thinking.js";
import {
  convertAnthropicImageBlockToOpenAIContentPart,
  convertOpenAIImagePartToGeminiPart,
  summarizeVisionInput,
  VisionInputError,
} from "../lib/vision.js";

const router: IRouter = Router();

// ─── Fix 3: Singleton clients — created once, reused across all requests ───────

let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });
  }
  return _openai;
}

let _anthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

let _gemini: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!_gemini) {
    _gemini = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "dummy",
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    } as ConstructorParameters<typeof GoogleGenAI>[0]);
  }
  return _gemini;
}

let _openrouter: OpenAI | null = null;
function getOpenRouterClient(): OpenAI {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://api-proxy.local",
        "X-Title": "AI Reverse Proxy",
      },
    });
  }
  return _openrouter;
}

// ─── Fix 10: In-memory rate limiter (120 req/min per API key) ─────────────────

const RATE_LIMIT_RPM = 120;
const _rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let bucket = _rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    _rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT_RPM) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

// ─── Fix 1: Retry with exponential backoff (for 429 / 50x / network errors) ──

function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };
  const status = inferUpstreamErrorStatus(err);
  if ([429, 502, 503, 504].includes(status ?? e.status ?? 0)) return true;
  if (["ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(e.code ?? "")) return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === maxAttempts - 1) throw err;
      const delay = Math.min(1000 * 2 ** attempt + Math.random() * 300, 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ─── Fix 2: Request timeout via AbortController (60 s) ────────────────────────

const UPSTREAM_TIMEOUT_MS = 60_000;

function makeAbortController(): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Upstream timeout")), UPSTREAM_TIMEOUT_MS);
  return { controller, clear: () => clearTimeout(timer) };
}

type ProxyAuthSource = "authorization" | "x-proxy-api-key" | "x-api-key";

type ResolvedProxyAuth = {
  ok: boolean;
  source?: ProxyAuthSource;
  rateLimitKey?: string;
};

type AnthropicUpstreamAuthSource = "x-api-key" | "authorization" | "env" | "missing";

type ResolvedAnthropicUpstreamAuth = {
  source: AnthropicUpstreamAuthSource;
  missing: boolean;
  usedEnvFallback: boolean;
  requestOptions?: Anthropic.RequestOptions;
};

function readHeaderValue(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProxyAuth(req: Request): ResolvedProxyAuth {
  const proxyKey = getConfig().proxyApiKey;
  const authHeader = readHeaderValue(req.headers.authorization as string | string[] | undefined);
  const xProxyApiKey = readHeaderValue(req.headers["x-proxy-api-key"] as string | string[] | undefined);
  const xApiKey = readHeaderValue(req.headers["x-api-key"] as string | string[] | undefined);

  if (authHeader === `Bearer ${proxyKey}`) {
    return { ok: true, source: "authorization", rateLimitKey: `authorization:${authHeader}` };
  }

  if (xProxyApiKey === proxyKey) {
    return { ok: true, source: "x-proxy-api-key", rateLimitKey: `x-proxy-api-key:${xProxyApiKey}` };
  }

  if (xApiKey === proxyKey) {
    return { ok: true, source: "x-api-key", rateLimitKey: `x-api-key:${xApiKey}` };
  }

  return { ok: false };
}

function getProxyAuthSource(res: Response): ProxyAuthSource | undefined {
  return (res.locals as { proxyAuthSource?: ProxyAuthSource }).proxyAuthSource;
}

function resolveAnthropicUpstreamAuth(req: Request): ResolvedAnthropicUpstreamAuth {
  const proxyKey = getConfig().proxyApiKey;
  const authHeader = readHeaderValue(req.headers.authorization as string | string[] | undefined);
  const xApiKey = readHeaderValue(req.headers["x-api-key"] as string | string[] | undefined);
  const proxyBearer = `Bearer ${proxyKey}`;

  if (xApiKey && xApiKey !== proxyKey) {
    return {
      source: "x-api-key",
      missing: false,
      usedEnvFallback: false,
      requestOptions: { headers: { "X-Api-Key": xApiKey } },
    };
  }

  if (authHeader && authHeader !== proxyBearer) {
    return {
      source: "authorization",
      missing: false,
      usedEnvFallback: false,
      requestOptions: { headers: { Authorization: authHeader } },
    };
  }

  const envApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim();
  if (envApiKey) {
    return {
      source: "env",
      missing: false,
      usedEnvFallback: true,
      requestOptions: { headers: { "X-Api-Key": envApiKey } },
    };
  }

  return { source: "missing", missing: true, usedEnvFallback: false };
}

function collectAnthropicBetaValues(req: Request, body?: Record<string, unknown>): string[] {
  const values: string[] = [];
  const pushValue = (value: unknown) => {
    if (typeof value !== "string") return;
    for (const item of value.split(",")) {
      const normalized = item.trim();
      if (normalized) values.push(normalized);
    }
  };

  const betaHeader = req.headers["anthropic-beta"];
  if (Array.isArray(betaHeader)) betaHeader.forEach(pushValue);
  else pushValue(betaHeader);

  const bodyBetas = body?.betas;
  if (Array.isArray(bodyBetas)) bodyBetas.forEach(pushValue);
  else pushValue(bodyBetas);

  return [...new Set(values)];
}

function buildAnthropicRequestOptions(
  req: Request,
  body: Record<string, unknown> | undefined,
  baseOptions?: Anthropic.RequestOptions,
): Anthropic.RequestOptions | undefined {
  const betas = collectAnthropicBetaValues(req, body);
  if (betas.length === 0) return baseOptions;
  const baseHeaders = (baseOptions?.headers ?? {}) as Record<string, string>;
  return {
    ...(baseOptions ?? {}),
    headers: {
      ...baseHeaders,
      "anthropic-beta": betas.join(","),
    },
  };
}

function logAnthropicUpstreamAuth(req: Request, res: Response, meta: { model: string; feature: "messages" | "count_tokens"; auth: ResolvedAnthropicUpstreamAuth }) {
  const logMeta = {
    model: meta.model,
    provider: "anthropic",
    feature: meta.feature,
    proxyAuthSource: getProxyAuthSource(res),
    anthropicAuthSource: meta.auth.source,
    anthropicAuthMissing: meta.auth.missing,
    anthropicAuthUsedEnvFallback: meta.auth.usedEnvFallback,
  };

  if (meta.auth.missing) {
    req.log.warn(logMeta, "Anthropic upstream auth unavailable");
    return;
  }

  req.log.info(logMeta, "Anthropic upstream auth resolved");
}

// ─── Auth + rate-limit middleware ─────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: () => void) {
  const resolvedAuth = resolveProxyAuth(req);

  if (!resolvedAuth.ok) {
    res.status(401).json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } });
    return;
  }

  (res.locals as { proxyAuthSource?: ProxyAuthSource }).proxyAuthSource = resolvedAuth.source;

  const { allowed, retryAfter } = checkRateLimit(resolvedAuth.rateLimitKey ?? "proxy:unknown");
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfter ?? 60));
    res.status(429).json({ error: { message: "Rate limit exceeded. Please retry later.", type: "rate_limit_error", code: 429 } });
    return;
  }
  next();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendAnthropicInvalidRequest(res: Response, message: string, status = 400) {
  res.status(status).json({ type: "error", error: { type: "invalid_request_error", message } });
}

function sendAnthropicAuthUnavailable(res: Response) {
  res.status(401).json({
    type: "error",
    error: {
      type: "authentication_error",
      message: "auth_unavailable: no upstream Anthropic auth available; provide a distinct x-api-key or Authorization header for Anthropic, or configure AI_INTEGRATIONS_ANTHROPIC_API_KEY",
    },
  });
}

function sendOpenAIInvalidRequest(res: Response, message: string, status = 400) {
  res.status(status).json({ error: { message, type: "invalid_request_error", code: status } });
}

type NormalizedProviderError = {
  status: number;
  message: string;
  openAIType: "api_error" | "rate_limit_error" | "authentication_error";
  openAICode: string | number;
  anthropicType: "api_error" | "rate_limit_error" | "authentication_error";
};

function extractWrappedErrorPayload(rawMessage: string): { status?: number; message?: string } | null {
  const firstBrace = rawMessage.indexOf("{");
  const lastBrace = rawMessage.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  const payloadText = rawMessage.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(payloadText) as Record<string, unknown>;
    const error = isPlainObject(parsed.error) ? parsed.error : undefined;
    const code = typeof error?.code === "number" ? error.code : undefined;
    const message = typeof error?.message === "string" ? error.message : undefined;
    if (!code && !message) return null;
    return { status: code, message };
  } catch {
    return null;
  }
}

function inferUpstreamErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const candidate = err as { status?: number; code?: number | string; message?: string };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  if (typeof candidate.message === "string") {
    const wrapped = extractWrappedErrorPayload(candidate.message);
    if (wrapped?.status) return wrapped.status;
    const match = candidate.message.match(/(^|\D)(429|401|400|404|500|502|503|504)(\D|$)/);
    if (match) return Number(match[2]);
    if (candidate.message.includes("RESOURCE_EXHAUSTED")) return 429;
  }
  return undefined;
}

function normalizeProviderError(err: unknown, fallbackMessage = "Internal server error"): NormalizedProviderError {
  const rawMessage = typeof (err as { message?: unknown })?.message === "string"
    ? (err as { message: string }).message
    : "";
  const wrapped = rawMessage ? extractWrappedErrorPayload(rawMessage) : null;
  const status = inferUpstreamErrorStatus(err) ?? 500;
  const message = wrapped?.message?.trim() || rawMessage.trim() || fallbackMessage;

  if (status === 401 || message.includes("auth_unavailable")) {
    return {
      status: 401,
      message,
      openAIType: "authentication_error",
      openAICode: 401,
      anthropicType: "authentication_error",
    };
  }

  if (
    status === 429
    || message.includes("RESOURCE_EXHAUSTED")
    || /quota/i.test(message)
    || /rate limit/i.test(message)
  ) {
    return {
      status: 429,
      message,
      openAIType: "rate_limit_error",
      openAICode: 429,
      anthropicType: "rate_limit_error",
    };
  }

  return {
    status,
    message,
    openAIType: "api_error",
    openAICode: "api_error",
    anthropicType: "api_error",
  };
}

function sendOpenAIProviderError(res: Response, err: unknown, fallbackMessage = "Internal server error") {
  const normalized = normalizeProviderError(err, fallbackMessage);
  res.status(normalized.status).json({
    error: {
      message: normalized.message,
      type: normalized.openAIType,
      param: "",
      code: normalized.openAICode,
    },
  });
}

function sendAnthropicProviderError(res: Response, err: unknown, fallbackMessage = "Internal server error") {
  const normalized = normalizeProviderError(err, fallbackMessage);
  res.status(normalized.status).json({
    type: "error",
    error: {
      type: normalized.anthropicType,
      message: normalized.message,
    },
  });
}

function stripAnthropicOutputConfigEffort(outputConfig: Anthropic.OutputConfig | undefined): Anthropic.OutputConfig | undefined {
  if (!isPlainObject(outputConfig)) return outputConfig;
  const nextOutputConfig = { ...outputConfig } as Record<string, unknown>;
  delete nextOutputConfig.effort;
  return Object.keys(nextOutputConfig).length > 0 ? nextOutputConfig as Anthropic.OutputConfig : undefined;
}

function isAnthropicThinkingEnabled(thinking: Anthropic.MessageCreateParamsNonStreaming["thinking"] | undefined): boolean {
  return Boolean(thinking && thinking.type !== "disabled");
}

function hasForcedAnthropicToolChoice(toolChoice: Anthropic.MessageCreateParams["tool_choice"] | undefined): boolean {
  return toolChoice?.type === "any" || toolChoice?.type === "tool";
}

function normalizeAnthropicCompatibility(args: {
  toolChoice?: Anthropic.MessageCreateParams["tool_choice"];
  thinking?: Anthropic.MessageCreateParamsNonStreaming["thinking"];
  outputConfig?: Anthropic.OutputConfig;
  temperature?: number;
}): {
  toolChoice?: Anthropic.MessageCreateParams["tool_choice"];
  thinking?: Anthropic.MessageCreateParamsNonStreaming["thinking"];
  outputConfig?: Anthropic.OutputConfig;
  temperature?: number;
  adjustments: Array<"thinking_removed_for_forced_tool_choice" | "temperature_set_to_1_for_thinking">;
} {
  let { toolChoice, thinking, outputConfig, temperature } = args;
  const adjustments: Array<"thinking_removed_for_forced_tool_choice" | "temperature_set_to_1_for_thinking"> = [];

  if (hasForcedAnthropicToolChoice(toolChoice) && isAnthropicThinkingEnabled(thinking)) {
    thinking = undefined;
    outputConfig = stripAnthropicOutputConfigEffort(outputConfig);
    adjustments.push("thinking_removed_for_forced_tool_choice");
  }

  if (isAnthropicThinkingEnabled(thinking) && temperature !== undefined && temperature !== 1) {
    temperature = 1;
    adjustments.push("temperature_set_to_1_for_thinking");
  }

  return { toolChoice, thinking, outputConfig, temperature, adjustments };
}

function isValidAnthropicContentBlock(block: unknown): boolean {
  return isPlainObject(block) && typeof block.type === "string";
}

function isValidAnthropicMessageParam(message: unknown): message is Anthropic.MessageParam {
  if (!isPlainObject(message)) return false;
  if (message.role !== "user" && message.role !== "assistant") return false;
  if (typeof message.content === "string") return true;
  return Array.isArray(message.content) && message.content.every((item) => isValidAnthropicContentBlock(item));
}

function validateAnthropicMessagesInput(body: { model?: unknown; messages?: unknown }): string | undefined {
  if (!body.model || typeof body.model !== "string") {
    return "model is required";
  }
  if (!Array.isArray(body.messages)) {
    return "messages must be an array";
  }
  for (let index = 0; index < body.messages.length; index++) {
    if (!isValidAnthropicMessageParam(body.messages[index])) {
      return `messages[${index}] must be an object with role and content`;
    }
  }
  return undefined;
}

function isOpenAIModel(model: string): boolean {
  const baseModel = stripThinkingModelSuffix(model);
  return baseModel.startsWith("gpt-") || baseModel.startsWith("o");
}

function isAnthropicModel(model: string): boolean {
  return stripThinkingModelSuffix(model).startsWith("claude-");
}

function isGeminiModel(model: string): boolean {
  return stripThinkingModelSuffix(model).startsWith("gemini-");
}

function isOpenRouterModel(model: string): boolean {
  return model.includes("/");
}

function shouldUseOpenAIMaxCompletionTokens(model: string): boolean {
  const baseModel = stripThinkingModelSuffix(model);
  const definition = getModelDefinition(baseModel);
  if (definition?.provider === "openai") {
    return definition.thinking.supported;
  }
  return baseModel.startsWith("o") || baseModel.startsWith("gpt-5");
}

// ─── Fix 6: Gemini finish_reason mapping ──────────────────────────────────────

function mapGeminiFinishReason(reason: string | undefined): OpenAI.ChatCompletion.Choice["finish_reason"] {
  switch (reason) {
    case "STOP": return "stop";
    case "MAX_TOKENS": return "length";
    case "SAFETY":
    case "RECITATION": return "content_filter";
    case "TOOL_CALLS":
    case "FUNCTION_CALL": return "tool_calls";
    default: return "stop";
  }
}

// ─── Fix 4+8: Gemini message + tool conversion ────────────────────────────────

type GeminiPart =
  | { text: string }
  | { text: string; thought: true; thoughtSignature?: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }
  | Record<string, unknown>;

type GeminiContent = { role: string; parts: GeminiPart[] };

type OpenAIFunctionTool = OpenAI.ChatCompletionFunctionTool;
type OpenAIFunctionToolCall = OpenAI.ChatCompletionMessageFunctionToolCall;

type AnthropicClientResponseBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ThinkingBlockParam
  | Anthropic.ToolUseBlockParam;

function isOpenAIFunctionTool(tool: OpenAI.ChatCompletionTool): tool is OpenAIFunctionTool {
  return tool.type === "function" && "function" in tool;
}

function isOpenAIFunctionToolCall(toolCall: OpenAI.ChatCompletionMessageToolCall): toolCall is OpenAIFunctionToolCall {
  return toolCall.type === "function" && "function" in toolCall;
}

function isAnthropicToolDefinition(tool: Anthropic.ToolUnion): tool is Anthropic.Tool {
  return "input_schema" in tool;
}

async function convertOpenAIContentToGeminiParts(content: unknown): Promise<GeminiPart[]> {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ text: "" }];
  }

  const parts: GeminiPart[] = [];
  for (const rawPart of content) {
    if (!isPlainObject(rawPart)) {
      parts.push({ text: JSON.stringify(rawPart) });
      continue;
    }

    if (rawPart.type === "text") {
      parts.push({ text: String(rawPart.text ?? "") });
      continue;
    }

    if (rawPart.type === "image_url") {
      parts.push(await convertOpenAIImagePartToGeminiPart(rawPart));
      continue;
    }

    parts.push({ text: JSON.stringify(rawPart) });
  }

  if (parts.length === 0) {
    return [{ text: "" }];
  }

  return parts;
}

async function convertMessagesToGemini(messages: OpenAI.ChatCompletionMessageParam[]): Promise<{
  systemInstruction?: string;
  contents: GeminiContent[];
}> {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  // Build a tool_call_id → function_name map for tool result conversion
  const toolCallNameMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (isOpenAIFunctionToolCall(tc)) toolCallNameMap.set(tc.id, tc.function.name);
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = typeof msg.content === "string" ? msg.content : "";
      continue;
    }

    if (msg.role === "tool") {
      const name = toolCallNameMap.get(msg.tool_call_id) ?? "unknown_function";
      const resultText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const part: GeminiPart = {
        functionResponse: { name, response: { content: resultText } },
      };
      const last = contents[contents.length - 1];
      if (last && last.role === "user") {
        last.parts.push(part);
      } else {
        contents.push({ role: "user", parts: [part] });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const parts: GeminiPart[] = [];
      const reasoningText = joinReasoningTexts(
        collectReasoningTexts((msg as unknown as Record<string, unknown>).reasoning_content),
      );
      if (reasoningText) parts.push({ text: reasoningText, thought: true });
      parts.push(...await convertOpenAIContentToGeminiParts(msg.content));
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          if (!isOpenAIFunctionToolCall(tc)) continue;
          try { args = JSON.parse(tc.function.arguments); } catch {}
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      if (parts.length === 0) parts.push({ text: "" });
      contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "user") {
      const parts = await convertOpenAIContentToGeminiParts(msg.content);
      const last = contents[contents.length - 1];
      if (last && last.role === "user") {
        last.parts.push(...parts);
      } else {
        contents.push({ role: "user", parts });
      }
    }
  }

  return { systemInstruction, contents };
}

function convertToolsToGemini(tools: OpenAI.ChatCompletionTool[]): Record<string, unknown>[] {
  return [{
    functionDeclarations: tools.map(t => ({
      name: isOpenAIFunctionTool(t) ? t.function.name : t.custom.name,
      description: isOpenAIFunctionTool(t) ? (t.function.description ?? "") : (t.custom.description ?? ""),
      parameters: isOpenAIFunctionTool(t) ? (t.function.parameters ?? { type: "object", properties: {} }) : { type: "object", properties: { input: { type: "string" } } },
    })),
  }];
}

function convertToolChoiceToGemini(
  toolChoice: OpenAI.ChatCompletionCreateParams["tool_choice"],
): Record<string, unknown> | undefined {
  if (!toolChoice || toolChoice === "auto") return undefined;
  if (toolChoice === "none") return { function_calling_config: { mode: "NONE" } };
  if (toolChoice === "required") return { function_calling_config: { mode: "ANY" } };
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return { function_calling_config: { mode: "ANY", allowed_function_names: [toolChoice.function.name] } };
  }
  return undefined;
}

// ─── Anthropic tool conversion ─────────────────────────────────────────────────

function convertToolsToAnthropic(tools: OpenAI.ChatCompletionTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: isOpenAIFunctionTool(t) ? t.function.name : t.custom.name,
    description: isOpenAIFunctionTool(t) ? t.function.description : t.custom.description,
    input_schema: (isOpenAIFunctionTool(t)
      ? t.function.parameters
      : { type: "object", properties: { input: { type: "string" } } }) as Anthropic.Tool["input_schema"],
  }));
}

function convertToolChoiceToAnthropic(
  toolChoice: OpenAI.ChatCompletionCreateParams["tool_choice"],
): Anthropic.MessageCreateParams["tool_choice"] | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none") return undefined;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "required") return { type: "any" };
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

/**
 * Convert OpenAI messages → Anthropic messages.
 * Strips OpenAI-specific/unknown fields (cache_control, name, etc.) that
 * Anthropic does not accept at the message level.
 */
function convertMessagesToAnthropic(
  messages: OpenAI.ChatCompletionMessageParam[],
): { system?: string; messages: Anthropic.MessageParam[] } {
  let system: string | undefined;
  const converted: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : "";
      continue;
    }

    if (msg.role === "tool") {
      const toolResultBlock: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      };
      const last = converted[converted.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(toolResultBlock);
      } else {
        converted.push({ role: "user", content: [toolResultBlock] });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const reasoningText = joinReasoningTexts(
        collectReasoningTexts((msg as unknown as Record<string, unknown>).reasoning_content),
      );
      const thinkingBlocks = reasoningText
        ? [{ type: "thinking" as const, thinking: reasoningText, signature: "" }]
        : [];
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const content: Anthropic.ContentBlockParam[] = [...thinkingBlocks];
        if (msg.content) {
          content.push({ type: "text", text: typeof msg.content === "string" ? msg.content : "" });
        }
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          if (!isOpenAIFunctionToolCall(tc)) continue;
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
        converted.push({ role: "assistant", content });
      } else {
        if (thinkingBlocks.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [...thinkingBlocks];
          const textContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
          if (textContent) content.push({ type: "text", text: textContent });
          converted.push({ role: "assistant", content });
          continue;
        }
        converted.push({
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
        });
      }
      continue;
    }

    if (msg.role === "user") {
      const rawContent = msg.content;
      if (typeof rawContent === "string") {
        converted.push({ role: "user", content: rawContent });
      } else if (Array.isArray(rawContent)) {
        const blocks: Anthropic.ContentBlockParam[] = rawContent.map((part) => {
          if (part.type === "text") {
            return { type: "text" as const, text: part.text };
          }
          if (part.type === "image_url") {
            const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url ?? "";
            if (url.startsWith("data:")) {
              const [header, data] = url.split(",");
              const mediaType = (header.split(";")[0].split(":")[1] ?? "image/jpeg") as Anthropic.Base64ImageSource["media_type"];
              return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data } };
            }
            return { type: "image" as const, source: { type: "url" as const, url } };
          }
          return { type: "text" as const, text: JSON.stringify(part) };
        });
        converted.push({ role: "user", content: blocks });
      } else {
        converted.push({ role: "user", content: String(rawContent ?? "") });
      }
      continue;
    }
  }

  return { system, messages: converted };
}

type AnthropicPayloadParts = {
  system?: Anthropic.MessageCreateParamsNonStreaming["system"];
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.MessageCreateParamsNonStreaming["tools"];
};

type AnthropicPayloadSanitizeResult = AnthropicPayloadParts & {
  removedPaths: string[];
};

const ALLOWED_ANTHROPIC_CACHE_CONTROL_KEYS = new Set(["type", "ttl"]);

function sanitizeAnthropicNode(node: unknown, path: string, removedPaths: string[]): unknown {
  if (Array.isArray(node)) {
    return node.map((item, index) => sanitizeAnthropicNode(item, `${path}.${index}`, removedPaths));
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const input = node as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === "cache_control") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        removedPaths.push(`${path}.cache_control`);
        continue;
      }
      const cacheControl = value as Record<string, unknown>;
      const sanitizedCacheControl: Record<string, unknown> = {};
      for (const [cacheKey, cacheValue] of Object.entries(cacheControl)) {
        if (ALLOWED_ANTHROPIC_CACHE_CONTROL_KEYS.has(cacheKey)) {
          sanitizedCacheControl[cacheKey] = cacheValue;
        } else {
          removedPaths.push(`${path}.cache_control.${cacheKey}`);
        }
      }
      if (Object.keys(sanitizedCacheControl).length > 0) {
        output[key] = sanitizedCacheControl;
      } else {
        removedPaths.push(`${path}.cache_control`);
      }
      continue;
    }

    output[key] = sanitizeAnthropicNode(value, `${path}.${key}`, removedPaths);
  }

  return output;
}

function sanitizeAnthropicPayload(parts: AnthropicPayloadParts): AnthropicPayloadSanitizeResult {
  const removedPaths: string[] = [];
  const result: AnthropicPayloadSanitizeResult = {
    messages: sanitizeAnthropicNode(parts.messages, "messages", removedPaths) as Anthropic.MessageParam[],
    removedPaths,
  };

  if (parts.system !== undefined) {
    result.system = sanitizeAnthropicNode(parts.system, "system", removedPaths) as Anthropic.MessageCreateParamsNonStreaming["system"];
  }

  if (parts.tools) {
    result.tools = sanitizeAnthropicNode(parts.tools, "tools", removedPaths) as Anthropic.MessageCreateParamsNonStreaming["tools"];
  }

  return result;
}

function convertAnthropicToOpenAI(anthropicMsg: Anthropic.Message, model: string): OpenAI.ChatCompletion {
  const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
  let textContent = "";
  const reasoningTexts: string[] = [];

  for (const block of anthropicMsg.content) {
    if (block.type === "text") textContent += block.text;
    else if (block.type === "thinking") reasoningTexts.push(block.thinking);
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }

  const finishReason =
    anthropicMsg.stop_reason === "tool_use" ? "tool_calls"
    : anthropicMsg.stop_reason === "end_turn" ? "stop"
    : anthropicMsg.stop_reason === "max_tokens" ? "length"
    : (anthropicMsg.stop_reason ?? "stop");

  const message: OpenAI.ChatCompletionMessage = {
    role: "assistant",
    content: textContent || null,
    refusal: null,
  };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;
  const joinedReasoning = joinReasoningTexts(reasoningTexts);
  if (joinedReasoning) {
    (message as unknown as Record<string, unknown>).reasoning_content = joinedReasoning;
  }

  return {
    id: anthropicMsg.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason as OpenAI.ChatCompletion.Choice["finish_reason"],
      logprobs: null,
    }],
    usage: {
      prompt_tokens: anthropicMsg.usage.input_tokens,
      completion_tokens: anthropicMsg.usage.output_tokens,
      total_tokens: anthropicMsg.usage.input_tokens + anthropicMsg.usage.output_tokens,
    },
  };
}

function buildUsage(
  promptTokens: number,
  completionTokens: number,
  reasoningTokens?: number,
): OpenAI.CompletionUsage {
  const usage: OpenAI.CompletionUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
  if (reasoningTokens && reasoningTokens > 0) {
    (usage as unknown as Record<string, unknown>).completion_tokens_details = {
      reasoning_tokens: reasoningTokens,
    };
  }
  return usage;
}

function attachReasoningContent<T extends Record<string, unknown>>(target: T, texts: string[]): T {
  const reasoningContent = joinReasoningTexts(texts);
  if (reasoningContent) {
    (target as Record<string, unknown>).reasoning_content = reasoningContent;
  }
  return target;
}

function logThinkingDecision(req: Request, resolution: ReturnType<typeof resolveThinkingRequest>, extra: Record<string, unknown> = {}) {
  if (!resolution.hadRequestConfig) return;
  req.log.info(
    {
      requestedModel: resolution.requestedModel,
      model: resolution.model,
      ...buildThinkingLogMeta(resolution),
      ...extra,
    },
    resolution.stripped ? "Thinking config stripped" : "Thinking config resolved",
  );
}

function convertAnthropicRequestToOpenAIPayload(body: Anthropic.MessageCreateParams): {
  messages: OpenAI.ChatCompletionMessageParam[];
  tools?: OpenAI.ChatCompletionTool[];
  toolChoice?: OpenAI.ChatCompletionCreateParams["tool_choice"];
} {
  const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [];
  if (body.system) {
    const sysText = typeof body.system === "string" ? body.system
      : (body.system as Anthropic.TextBlockParam[]).map((b) => b.text).join("");
    openAIMessages.push({ role: "system", content: sysText });
  }

  for (const msg of body.messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        openAIMessages.push({ role: "user", content: msg.content });
      } else {
        const content = msg.content as Anthropic.ContentBlockParam[];
        const userParts: Array<OpenAI.ChatCompletionContentPartText | OpenAI.ChatCompletionContentPartImage> = [];
        for (const block of content) {
          if (block.type === "tool_result") {
            const toolResult = block as Anthropic.ToolResultBlockParam;
            openAIMessages.push({
              role: "tool",
              tool_call_id: toolResult.tool_use_id,
              content: typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content),
            });
            continue;
          }

          if (block.type === "text") {
            userParts.push({ type: "text", text: (block as Anthropic.TextBlockParam).text });
            continue;
          }

          if (block.type === "image") {
            userParts.push(convertAnthropicImageBlockToOpenAIContentPart(block as Anthropic.ImageBlockParam));
          }
        }

        if (userParts.length > 0) {
          openAIMessages.push({ role: "user", content: userParts });
        }
      }
    } else if (msg.role === "assistant") {
      const blocks = Array.isArray(msg.content) ? (msg.content as Anthropic.ContentBlock[]) : [];
      const toolUseBlocks = blocks.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
      const textBlocks = blocks.filter((b) => b.type === "text") as Anthropic.TextBlock[];
      const thinkingBlocks = blocks.filter((b) => b.type === "thinking") as Anthropic.ThinkingBlock[];
      const textContent = typeof msg.content === "string" ? msg.content : textBlocks.map((b) => b.text).join("");
      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textContent || null,
      };
      if (toolUseBlocks.length > 0) {
        assistantMsg.tool_calls = toolUseBlocks.map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      }
      const reasoningText = joinReasoningTexts(thinkingBlocks.map((block) => block.thinking));
      if (reasoningText) {
        (assistantMsg as unknown as Record<string, unknown>).reasoning_content = reasoningText;
      }
      openAIMessages.push(assistantMsg);
    }
  }

  const tools: OpenAI.ChatCompletionTool[] | undefined = body.tools
    ?.filter(isAnthropicToolDefinition)
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

  let toolChoice: OpenAI.ChatCompletionCreateParams["tool_choice"] | undefined;
  if (body.tool_choice) {
    const tc = body.tool_choice;
    if (tc.type === "auto") toolChoice = "auto";
    else if (tc.type === "any") toolChoice = "required";
    else if (tc.type === "tool") toolChoice = { type: "function", function: { name: (tc as Anthropic.ToolChoiceTool).name } };
  }

  return { messages: openAIMessages, tools, toolChoice };
}

/** Write an SSE error event when headers are already flushed */
function writeSseError(res: Response, message: string) {
  try {
    const chunk: OpenAI.ChatCompletionChunk = {
      id: `err-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "",
      choices: [{ index: 0, delta: {}, finish_reason: "stop", logprobs: null }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write(`data: [DONE]\n\n`);
  } catch {
    // best-effort
  }
}

function setupSseHeaders(req: Request, res: Response, keepaliveFn: () => void): ReturnType<typeof setInterval> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const keepalive = setInterval(keepaliveFn, 5000);
  return keepalive;
}

// ─── GET /v1/models ───────────────────────────────────────────────────────────

router.get("/models", requireAuth, (_req: Request, res: Response) => {
  const now = Math.floor(Date.now() / 1000);
  const staticModels = listModelObjects(now);
  const synced = getAllSyncedModels();
  if (synced.length === 0) {
    res.json({ object: "list", data: staticModels });
    return;
  }
  const staticIds = new Set(staticModels.map((m) => m.id));
  const syncedExtra = synced
    .filter((m) => !staticIds.has(m.id))
    .map((m) => ({
      id: m.id,
      object: "model" as const,
      created: m.created ?? now,
      owned_by: m.ownedBy,
    }));
  res.json({ object: "list", data: [...staticModels, ...syncedExtra] });
});

// ─── GET /v1/credits ──────────────────────────────────────────────────────────

router.get("/credits", requireAuth, async (_req: Request, res: Response) => {
  const result = await fetchCredits();
  if (result.needsKey) {
    res.json({ needs_key: true, error: result.error });
    return;
  }
  if (!result.ok) {
    res.status(503).json({ error: result.error ?? "Credits unavailable" });
    return;
  }
  res.json(buildCreditsJson(result));
});

// ─── POST /v1/chat/completions ────────────────────────────────────────────────

router.post("/chat/completions", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const requestedModel = body.model as string;
  const stream = Boolean(body.stream);
  const rawMessages = (body.messages ?? []) as OpenAI.ChatCompletionMessageParam[];
  const tools = body.tools as OpenAI.ChatCompletionTool[] | undefined;
  const toolChoice = body.tool_choice as OpenAI.ChatCompletionCreateParams["tool_choice"] | undefined;
  // Fix 7: extract all common sampling params
  const samplingInput = {
    temperature: body.temperature as number | undefined,
    topP: body.top_p as number | undefined,
    frequencyPenalty: body.frequency_penalty as number | undefined,
    presencePenalty: body.presence_penalty as number | undefined,
  };
  const maxTokens = body.max_tokens as number | undefined;
  const stop = body.stop as string | string[] | null | undefined;
  // Fix 9: preserve stream_options for OpenAI pass-through; detect include_usage for Anthropic/Gemini
  const streamOpts = body.stream_options as { include_usage?: boolean } | undefined;
  const includeUsageInStream = Boolean(streamOpts?.include_usage);

  if (!requestedModel) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  const model = stripThinkingModelSuffix(requestedModel);
  const targetProvider = isOpenAIModel(model) ? "openai"
    : isAnthropicModel(model) ? "anthropic"
    : isGeminiModel(model) ? "gemini"
    : isOpenRouterModel(model) ? "openrouter"
    : null;

  const visionSummary = summarizeVisionInput("chat", body);
  const hasVisionInput = requestHasVisionInput("chat", body);

  if (hasVisionInput) {
    req.log.info({
      model,
      requestedModel,
      visionInputCount: visionSummary.count,
      visionInputKinds: visionSummary.kinds,
      visionTargetProvider: targetProvider ?? "unknown",
    }, "Vision input detected");
  }

  if (hasVisionInput && !supportsVision(model)) {
    req.log.warn({
      model,
      requestedModel,
      visionInputCount: visionSummary.count,
      visionInputKinds: visionSummary.kinds,
      visionRejectedForUnsupportedModel: true,
    }, "Vision input rejected for unsupported model");
    sendOpenAIInvalidRequest(res, `Model "${requestedModel}" does not support image inputs`);
    return;
  }

  const thinkingResolution = targetProvider
    ? resolveThinkingRequest({ model: requestedModel, body, route: "chat", targetProvider })
    : null;

  if (thinkingResolution) {
    logThinkingDecision(req, thinkingResolution);
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  if (isOpenAIModel(model)) {
    const sampling = normalizeSamplingParams("openai", samplingInput);

    const openAIParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: rawMessages,
      stream: false,
    };
    if (tools) openAIParams.tools = tools;
    if (toolChoice) openAIParams.tool_choice = toolChoice;
    if (sampling.temperature !== undefined) openAIParams.temperature = sampling.temperature;
    if (maxTokens !== undefined) {
      if (shouldUseOpenAIMaxCompletionTokens(model)) {
        (openAIParams as unknown as Record<string, unknown>).max_completion_tokens = maxTokens;
      } else {
        openAIParams.max_tokens = maxTokens;
      }
    }
    // Fix 7: forward extra sampling params
    if (sampling.topP !== undefined) openAIParams.top_p = sampling.topP;
    if (stop != null) openAIParams.stop = stop as string | string[];
    if (sampling.presencePenalty !== undefined) openAIParams.presence_penalty = sampling.presencePenalty;
    if (sampling.frequencyPenalty !== undefined) openAIParams.frequency_penalty = sampling.frequencyPenalty;
    const reasoningEffort = thinkingResolution ? buildOpenAIReasoningEffort(thinkingResolution) : undefined;
    if (reasoningEffort !== undefined) openAIParams.reasoning_effort = reasoningEffort;
    // Always request usage in stream so we can record token counts accurately
    if (stream) {
      (openAIParams as unknown as Record<string, unknown>).stream_options = { ...(streamOpts ?? {}), include_usage: true };
    }

    const openai = getOpenAIClient();
    const startTs = Date.now();

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const { controller, clear } = makeAbortController();
        req.on("close", clear);
        const streamRes = await withRetry(() =>
          openai.chat.completions.create({ ...openAIParams, stream: true }, { signal: controller.signal })
        );
        let streamPt = 0, streamCt = 0;
        for await (const chunk of streamRes) {
          if ((chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage) {
            const u = (chunk as { usage: { prompt_tokens?: number; completion_tokens?: number } }).usage;
            streamPt = u.prompt_tokens ?? 0;
            streamCt = u.completion_tokens ?? 0;
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          (res as any).flush?.();
        }
        res.write("data: [DONE]\n\n");
        clear();
        const streamLatMs = Date.now() - startTs;
        req.log.info({ model, provider: "openai", latencyMs: streamLatMs, stream: true, promptTokens: streamPt, completionTokens: streamCt }, "OpenAI stream complete");
        appendUsage({ timestamp: Date.now(), model, provider: "openai", promptTokens: streamPt, completionTokens: streamCt, totalTokens: streamPt + streamCt, latencyMs: streamLatMs, cached: false });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "openai" }, "OpenAI stream error");
        writeSseError(res, (streamErr as { message?: string }).message ?? "Stream error");
      } finally {
        clearInterval(keepalive);
        res.end();
      }
    } else {
      try {
        const { controller, clear } = makeAbortController();
        const result = await withRetry(() =>
          openai.chat.completions.create({ ...openAIParams, stream: false }, { signal: controller.signal })
        );
        clear();
        const pt = result.usage?.prompt_tokens ?? 0;
        const ct = result.usage?.completion_tokens ?? 0;
        const latMs = Date.now() - startTs;
        // Fix 11: log model + usage + latency
        req.log.info({
          model,
          provider: "openai",
          latencyMs: latMs,
          promptTokens: pt,
          completionTokens: ct,
        }, "OpenAI request complete");
        appendUsage({ timestamp: Date.now(), model, provider: "openai", promptTokens: pt, completionTokens: ct, totalTokens: pt + ct, latencyMs: latMs, cached: false });
        res.json(result);
      } catch (err: unknown) {
        req.log.error({ err, model, provider: "openai" }, "OpenAI error");
        sendOpenAIProviderError(res, err);
      }
    }
    return;
  }

  // ── Anthropic ────────────────────────────────────────────────────────────────
  if (isAnthropicModel(model)) {
    const sampling = normalizeSamplingParams("anthropic", samplingInput);
    if (sampling.adjustments.length > 0) {
      req.log.info({ model, provider: "anthropic", samplingAdjustments: sampling.adjustments }, "Anthropic sampling normalized");
    }

    const anthropicUpstreamAuth = resolveAnthropicUpstreamAuth(req);
    logAnthropicUpstreamAuth(req, res, { model, feature: "messages", auth: anthropicUpstreamAuth });
    if (anthropicUpstreamAuth.missing) {
      sendAnthropicAuthUnavailable(res);
      return;
    }

    const anthropic = getAnthropicClient();
    const { system, messages } = convertMessagesToAnthropic(rawMessages);
    // Fix B: when tool_choice is "none", strip both tools and tool_choice
    const effectiveToolChoice = toolChoice === "none" ? undefined : toolChoice;
    const sanitizedAnthropic = sanitizeAnthropicPayload({
      system,
      messages,
      tools: tools && toolChoice !== "none" ? convertToolsToAnthropic(tools) : undefined,
    });

    if (sanitizedAnthropic.removedPaths.length > 0) {
      req.log.info({ model, provider: "anthropic", removedPaths: sanitizedAnthropic.removedPaths }, "Sanitized unsupported Anthropic payload fields");
    }

    const anthropicThinking = thinkingResolution
        ? buildAnthropicThinkingPayload({
          resolution: thinkingResolution,
          maxTokens: maxTokens ?? 8192,
          existingOutputConfig: isPlainObject(body.output_config)
            ? (body.output_config as Anthropic.MessageCreateParamsNonStreaming["output_config"])
            : undefined,
        })
      : {};

    const convertedToolChoice = effectiveToolChoice ? convertToolChoiceToAnthropic(effectiveToolChoice) : undefined;
    const anthropicCompat = normalizeAnthropicCompatibility({
      toolChoice: convertedToolChoice,
      thinking: anthropicThinking.thinking,
      outputConfig: anthropicThinking.outputConfig,
      temperature: sampling.temperature,
    });
    if (anthropicCompat.adjustments.length > 0) {
      req.log.info({ model, provider: "anthropic", compatibilityAdjustments: anthropicCompat.adjustments }, "Anthropic compatibility normalized");
    }

    const anthropicParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens ?? 8192,
      messages: sanitizedAnthropic.messages,
    };
    if (sanitizedAnthropic.system) anthropicParams.system = sanitizedAnthropic.system;
    if (sanitizedAnthropic.tools) anthropicParams.tools = sanitizedAnthropic.tools;
    if (anthropicCompat.toolChoice) anthropicParams.tool_choice = anthropicCompat.toolChoice;
    if (anthropicCompat.temperature !== undefined) anthropicParams.temperature = anthropicCompat.temperature;
    if (anthropicCompat.thinking) anthropicParams.thinking = anthropicCompat.thinking;
    if (anthropicCompat.outputConfig) anthropicParams.output_config = anthropicCompat.outputConfig;
    // Fix 7: forward top_p and stop sequences where Anthropic supports them
    if (sampling.topP !== undefined) (anthropicParams as unknown as Record<string, unknown>).top_p = sampling.topP;
    if (stop != null) {
      const stopArr = Array.isArray(stop) ? stop : [stop];
      if (stopArr.length > 0) (anthropicParams as unknown as Record<string, unknown>).stop_sequences = stopArr;
    }

    const anthropicRequestOptions = buildAnthropicRequestOptions(req, body, anthropicUpstreamAuth.requestOptions);

    const startTs = Date.now();

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      let messageId = `chatcmpl-${Date.now()}`;
      let toolUseBlocks: { id: string; name: string; inputJson: string }[] = [];
      let currentToolIndex = -1;
      let streamInputTokens = 0;
      let streamOutputTokens = 0;

      try {
        const anthropicStream = anthropic.messages.stream(anthropicParams, anthropicRequestOptions);

        for await (const event of anthropicStream) {
          if (event.type === "message_start") {
            messageId = event.message.id;
            streamInputTokens = event.message.usage?.input_tokens ?? 0;
            // Fix C: content: null (not "") for the role-announcement chunk
            const initChunk: OpenAI.ChatCompletionChunk = {
              id: messageId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: { role: "assistant", content: null }, finish_reason: null, logprobs: null }],
            };
            res.write(`data: ${JSON.stringify(initChunk)}\n\n`);
            (res as any).flush?.();
          } else if (event.type === "content_block_start") {
            if (event.content_block.type === "tool_use") {
              currentToolIndex++;
              toolUseBlocks.push({ id: event.content_block.id, name: event.content_block.name, inputJson: "" });
              const toolStartChunk: OpenAI.ChatCompletionChunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: currentToolIndex,
                      id: event.content_block.id,
                      type: "function",
                      function: { name: event.content_block.name, arguments: "" },
                    }],
                  },
                  finish_reason: null,
                  logprobs: null,
                }],
              };
              res.write(`data: ${JSON.stringify(toolStartChunk)}\n\n`);
              (res as any).flush?.();
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              const textChunk: OpenAI.ChatCompletionChunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null, logprobs: null }],
              };
              res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
              (res as any).flush?.();
            } else if (event.delta.type === "thinking_delta") {
              const reasoningChunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: { reasoning_content: event.delta.thinking },
                  finish_reason: null,
                  logprobs: null,
                }],
              } as unknown as OpenAI.ChatCompletionChunk;
              res.write(`data: ${JSON.stringify(reasoningChunk)}\n\n`);
              (res as any).flush?.();
            } else if (event.delta.type === "input_json_delta") {
              const tb = toolUseBlocks[currentToolIndex];
              if (tb) {
                tb.inputJson += event.delta.partial_json;
                const argChunk: OpenAI.ChatCompletionChunk = {
                  id: messageId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: currentToolIndex,
                        function: { arguments: event.delta.partial_json },
                      }],
                    },
                    finish_reason: null,
                    logprobs: null,
                  }],
                };
                res.write(`data: ${JSON.stringify(argChunk)}\n\n`);
                (res as any).flush?.();
              }
            }
          } else if (event.type === "message_delta") {
            const finishReason =
              event.delta.stop_reason === "tool_use" ? "tool_calls"
              : event.delta.stop_reason === "end_turn" ? "stop"
              : event.delta.stop_reason === "max_tokens" ? "length"
              : (event.delta.stop_reason ?? "stop");
            streamOutputTokens = event.usage?.output_tokens ?? 0;
            const finalChunk: OpenAI.ChatCompletionChunk = {
              id: messageId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: {}, finish_reason: finishReason as OpenAI.ChatCompletionChunk.Choice["finish_reason"], logprobs: null }],
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            (res as any).flush?.();
            // Fix D/E: emit usage chunk when client requested it
            if (includeUsageInStream) {
              const usageChunk: OpenAI.ChatCompletionChunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [],
                usage: {
                  prompt_tokens: streamInputTokens,
                  completion_tokens: streamOutputTokens,
                  total_tokens: streamInputTokens + streamOutputTokens,
                },
              };
              res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
              (res as any).flush?.();
            }
          }
        }
        res.write("data: [DONE]\n\n");
        const anthStreamLatMs = Date.now() - startTs;
        // Fix 11: log after stream
        req.log.info({
          model,
          provider: "anthropic",
          latencyMs: anthStreamLatMs,
          promptTokens: streamInputTokens,
          completionTokens: streamOutputTokens,
          stream: true,
        }, "Anthropic stream complete");
        appendUsage({ timestamp: Date.now(), model, provider: "anthropic", promptTokens: streamInputTokens, completionTokens: streamOutputTokens, totalTokens: streamInputTokens + streamOutputTokens, latencyMs: anthStreamLatMs, cached: false });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "anthropic" }, "Anthropic stream error");
        writeSseError(res, (streamErr as { message?: string }).message ?? "Anthropic stream error");
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    // Non-streaming
    try {
      const finalMsg = await withRetry(() =>
        anthropic.messages.stream(anthropicParams, anthropicRequestOptions).finalMessage()
      );
      const apt = finalMsg.usage.input_tokens;
      const act = finalMsg.usage.output_tokens;
      const anthLatMs = Date.now() - startTs;
      req.log.info({
        model,
        provider: "anthropic",
        latencyMs: anthLatMs,
        promptTokens: apt,
        completionTokens: act,
      }, "Anthropic request complete");
      const anthResult = convertAnthropicToOpenAI(finalMsg, model);
      appendUsage({ timestamp: Date.now(), model, provider: "anthropic", promptTokens: apt, completionTokens: act, totalTokens: apt + act, latencyMs: anthLatMs, cached: false });
      res.json(anthResult);
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "anthropic" }, "Anthropic error");
      sendOpenAIProviderError(res, err);
    }
    return;
  }

  // ── Gemini ───────────────────────────────────────────────────────────────────
  if (isGeminiModel(model)) {
    const sampling = normalizeSamplingParams("gemini", samplingInput);
    if (sampling.adjustments.length > 0) {
      req.log.info({ model, provider: "gemini", samplingAdjustments: sampling.adjustments }, "Gemini sampling normalized");
    }

    const gemini = getGeminiClient();
    let systemInstruction: string | undefined;
    let contents: GeminiContent[];
    try {
      ({ systemInstruction, contents } = await convertMessagesToGemini(rawMessages));
    } catch (error) {
      if (error instanceof VisionInputError) {
        req.log.warn({
          model,
          provider: "gemini",
          visionFetchedRemoteImage: visionSummary.kinds.includes("remote_url"),
          visionFetchFailureReason: error.message,
        }, "Gemini vision input rejected");
        sendOpenAIInvalidRequest(res, error.message);
        return;
      }
      throw error;
    }

    // Fix 7: full generationConfig
    const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens ?? 8192 };
    if (sampling.temperature !== undefined) generationConfig.temperature = sampling.temperature;
    if (sampling.topP !== undefined) generationConfig.topP = sampling.topP;
    if (stop != null) {
      const stopArr = Array.isArray(stop) ? stop : [stop];
      if (stopArr.length > 0) generationConfig.stopSequences = stopArr;
    }
    const geminiThinking = thinkingResolution ? buildGeminiThinkingConfig(thinkingResolution) : undefined;
    if (geminiThinking) generationConfig.thinkingConfig = geminiThinking;
    // Enable image output for image-generation models
    const isGeminiImageGen = /image/i.test(model);
    if (isGeminiImageGen) generationConfig.responseModalities = ["TEXT", "IMAGE"];

    const geminiConfig: Record<string, unknown> = { generationConfig };
    if (systemInstruction) geminiConfig.systemInstruction = systemInstruction;
    // Fix 4: Gemini tool calling
    if (tools && toolChoice !== "none") {
      geminiConfig.tools = convertToolsToGemini(tools);
      const tc = convertToolChoiceToGemini(toolChoice);
      if (tc) geminiConfig.toolConfig = tc;
    }

    const startTs = Date.now();

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      const msgId = `chatcmpl-${Date.now()}`;
      let geminiInputTokens = 0;
      let geminiOutputTokens = 0;
      let currentToolIndex = -1;

      try {
        // Fix 8: content: null for init chunk
        const initChunk: OpenAI.ChatCompletionChunk = {
          id: msgId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { role: "assistant", content: null }, finish_reason: null, logprobs: null }],
        };
        res.write(`data: ${JSON.stringify(initChunk)}\n\n`);

        const geminiStream = await withRetry(() =>
          gemini.models.generateContentStream({ model, contents, config: geminiConfig })
        );

        for await (const chunk of geminiStream) {
          const candidate = (chunk as any).candidates?.[0];
          const parts = candidate?.content?.parts ?? [];

          for (const part of parts) {
            if (part.text && part.thought) {
              const reasoningChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { reasoning_content: part.text }, finish_reason: null, logprobs: null }],
              } as unknown as OpenAI.ChatCompletionChunk;
              res.write(`data: ${JSON.stringify(reasoningChunk)}\n\n`);
              (res as any).flush?.();
            } else if (part.text) {
              const textChunk: OpenAI.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: part.text }, finish_reason: null, logprobs: null }],
              };
              res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
              (res as any).flush?.();
            } else if (part.inlineData) {
              const dataUrl = `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}`;
              const imageChunk: OpenAI.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: `\n[IMAGE:${dataUrl}]` }, finish_reason: null, logprobs: null }],
              };
              res.write(`data: ${JSON.stringify(imageChunk)}\n\n`);
              (res as any).flush?.();
            } else if (part.functionCall) {
              currentToolIndex++;
              const callId = `call_${Date.now()}_${currentToolIndex}`;
              const toolStartChunk: OpenAI.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: currentToolIndex,
                      id: callId,
                      type: "function",
                      function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
                    }],
                  },
                  finish_reason: null,
                  logprobs: null,
                }],
              };
              res.write(`data: ${JSON.stringify(toolStartChunk)}\n\n`);
              (res as any).flush?.();
            }
          }

          // Fix 5: collect token usage
          const meta = (chunk as any).usageMetadata;
          if (meta) {
            geminiInputTokens = meta.promptTokenCount ?? geminiInputTokens;
            geminiOutputTokens = meta.candidatesTokenCount ?? geminiOutputTokens;
          }

          if (candidate?.finishReason) {
            const finishReason = currentToolIndex >= 0 ? "tool_calls" : mapGeminiFinishReason(candidate.finishReason);
            const doneChunk: OpenAI.ChatCompletionChunk = {
              id: msgId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: {}, finish_reason: finishReason, logprobs: null }],
            };
            res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
            // Fix D/E equivalent for Gemini
            if (includeUsageInStream) {
              const usageChunk: OpenAI.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [],
                usage: buildUsage(
                  geminiInputTokens,
                  geminiOutputTokens,
                  meta?.thoughtsTokenCount,
                ),
              };
              res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
            }
            (res as any).flush?.();
          }
        }

        res.write("data: [DONE]\n\n");
        const gemStreamLatMs = Date.now() - startTs;
        req.log.info({
          model, provider: "gemini",
          latencyMs: gemStreamLatMs,
          promptTokens: geminiInputTokens,
          completionTokens: geminiOutputTokens,
          stream: true,
        }, "Gemini stream complete");
        appendUsage({ timestamp: Date.now(), model, provider: "gemini", promptTokens: geminiInputTokens, completionTokens: geminiOutputTokens, totalTokens: geminiInputTokens + geminiOutputTokens, latencyMs: gemStreamLatMs, cached: false });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "gemini" }, "Gemini stream error");
        writeSseError(res, (streamErr as { message?: string }).message ?? "Gemini stream error");
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    // Gemini non-streaming
    try {
      const response = await withRetry(() =>
        gemini.models.generateContent({ model, contents, config: geminiConfig })
      );
      const candidate = (response as any).candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const meta = (response as any).usageMetadata;

      // Fix 4: handle tool calls in non-streaming response
      const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
      let textContent = "";
      const reasoningTexts: string[] = [];
      const inlineImageUrls: string[] = [];
      for (const part of parts) {
        if (part.text && part.thought) {
          reasoningTexts.push(part.text);
        } else if (part.text) {
          textContent += part.text;
        } else if (part.inlineData) {
          const dataUrl = `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}`;
          inlineImageUrls.push(dataUrl);
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            type: "function",
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        }
      }

      const finishReason = toolCalls.length > 0 ? "tool_calls" : mapGeminiFinishReason(candidate?.finishReason);

      // Build content: if images returned, use content array
      let messageContent: string | OpenAI.ChatCompletionContentPart[] | null;
      if (inlineImageUrls.length > 0) {
        const contentParts: OpenAI.ChatCompletionContentPart[] = [];
        if (textContent) contentParts.push({ type: "text", text: textContent });
        for (const url of inlineImageUrls) {
          contentParts.push({ type: "image_url", image_url: { url } });
        }
        messageContent = contentParts;
      } else {
        messageContent = textContent || null;
      }

      const message: OpenAI.ChatCompletionMessage = {
        role: "assistant",
        content: messageContent as string | null,
        refusal: null,
      };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      attachReasoningContent(message as unknown as Record<string, unknown>, reasoningTexts);

      // Fix 5: real usage from usageMetadata
      const promptTokens = meta?.promptTokenCount ?? 0;
      const completionTokens = meta?.candidatesTokenCount ?? 0;

      const result: OpenAI.ChatCompletion = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message,
          finish_reason: finishReason,
          logprobs: null,
        }],
        usage: buildUsage(promptTokens, completionTokens, meta?.thoughtsTokenCount),
      };

      const gemLatMs = Date.now() - startTs;
      req.log.info({
        model, provider: "gemini",
        latencyMs: gemLatMs,
        promptTokens, completionTokens,
      }, "Gemini request complete");
      appendUsage({ timestamp: Date.now(), model, provider: "gemini", promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, latencyMs: gemLatMs, cached: false });
      res.json(result);
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "gemini" }, "Gemini error");
      sendOpenAIProviderError(res, err);
    }
    return;
  }

  // ─── OpenRouter (OpenAI-compatible, any model with "/" in name) ───────────
  if (isOpenRouterModel(model)) {
    const client = getOpenRouterClient();
    const { temperature, topP, frequencyPenalty, presencePenalty } = normalizeSamplingParams("openai", samplingInput);
    const orStartTs = Date.now();
    try {
      if (stream) {
        const orStream = await client.chat.completions.create({
          model,
          messages: rawMessages,
          stream: true,
          ...(tools ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(topP !== undefined ? { top_p: topP } : {}),
          ...(frequencyPenalty !== undefined ? { frequency_penalty: frequencyPenalty } : {}),
          ...(presencePenalty !== undefined ? { presence_penalty: presencePenalty } : {}),
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
          ...(stop != null ? { stop } : {}),
          stream_options: { ...(streamOpts ?? {}), include_usage: true },
        });
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        let orStreamPt = 0, orStreamCt = 0;
        for await (const chunk of orStream) {
          if ((chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage) {
            const u = (chunk as { usage: { prompt_tokens?: number; completion_tokens?: number } }).usage;
            orStreamPt = u.prompt_tokens ?? 0;
            orStreamCt = u.completion_tokens ?? 0;
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
        const orStreamLatMs = Date.now() - orStartTs;
        req.log.info({ model, provider: "openrouter", latencyMs: orStreamLatMs, stream: true, promptTokens: orStreamPt, completionTokens: orStreamCt }, "OpenRouter stream complete");
        appendUsage({ timestamp: Date.now(), model, provider: "openrouter", promptTokens: orStreamPt, completionTokens: orStreamCt, totalTokens: orStreamPt + orStreamCt, latencyMs: orStreamLatMs, cached: false });
      } else {
        const result = await client.chat.completions.create({
          model,
          messages: rawMessages,
          stream: false,
          ...(tools ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(topP !== undefined ? { top_p: topP } : {}),
          ...(frequencyPenalty !== undefined ? { frequency_penalty: frequencyPenalty } : {}),
          ...(presencePenalty !== undefined ? { presence_penalty: presencePenalty } : {}),
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
          ...(stop != null ? { stop } : {}),
        });
        const orPt = result.usage?.prompt_tokens ?? 0;
        const orCt = result.usage?.completion_tokens ?? 0;
        const orLatMs = Date.now() - orStartTs;
        req.log.info({ model, provider: "openrouter", latencyMs: orLatMs, promptTokens: orPt, completionTokens: orCt }, "OpenRouter request complete");
        appendUsage({ timestamp: Date.now(), model, provider: "openrouter", promptTokens: orPt, completionTokens: orCt, totalTokens: orPt + orCt, latencyMs: orLatMs, cached: false });
        res.json(result);
      }
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "openrouter" }, "OpenRouter error");
      sendOpenAIProviderError(res, err);
    }
    return;
  }

  res.status(400).json({ error: { message: `Unsupported model: ${model}`, type: "invalid_request_error" } });
});

// ─── POST /v1/messages (Anthropic native API) ─────────────────────────────────

router.post("/messages/count_tokens", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Anthropic.MessageCountTokensParams & {
    output_config?: Anthropic.OutputConfig;
    thinking?: Anthropic.ThinkingConfigParam;
    tools?: Anthropic.ToolUnion[];
    system?: string | Anthropic.TextBlockParam[];
  };

  const inputError = validateAnthropicMessagesInput(body);
  if (inputError) {
    sendAnthropicInvalidRequest(res, inputError);
    return;
  }

  const requestedModel = body.model;
  const model = stripThinkingModelSuffix(requestedModel);
  if (!isAnthropicModel(model)) {
    sendAnthropicInvalidRequest(res, `count_tokens currently supports Anthropic models only. Model "${requestedModel}" is not supported here.`);
    return;
  }

  const hasVisionInput = requestHasVisionInput("messages", body as unknown as Record<string, unknown>);
  if (hasVisionInput && !supportsVision(model)) {
    req.log.warn({ model, requestedModel, visionRejectedForUnsupportedModel: true, feature: "count_tokens" }, "Vision input rejected for unsupported Anthropic model");
    sendAnthropicInvalidRequest(res, `Model "${requestedModel}" does not support image inputs`);
    return;
  }

  const thinkingResolution = resolveThinkingRequest({
    model: requestedModel,
    body: body as unknown as Record<string, unknown>,
    route: "messages",
    targetProvider: "anthropic",
  });
  logThinkingDecision(req, thinkingResolution, { feature: "count_tokens" });

  const anthropicUpstreamAuth = resolveAnthropicUpstreamAuth(req);
  logAnthropicUpstreamAuth(req, res, { model, feature: "count_tokens", auth: anthropicUpstreamAuth });
  if (anthropicUpstreamAuth.missing) {
    sendAnthropicAuthUnavailable(res);
    return;
  }

  const anthropic = getAnthropicClient();
  const sanitizedAnthropic = sanitizeAnthropicPayload({
    system: body.system,
    messages: body.messages,
    tools: body.tools,
  });

  if (sanitizedAnthropic.removedPaths.length > 0) {
    req.log.info({ model, provider: "anthropic", removedPaths: sanitizedAnthropic.removedPaths }, "Sanitized unsupported Anthropic payload fields");
  }

  const anthropicThinking = buildAnthropicThinkingPayload({
    resolution: thinkingResolution,
    maxTokens: 200_000,
    existingOutputConfig: body.output_config,
    allowOutputConfig: false,
  });
  const anthropicCompat = normalizeAnthropicCompatibility({
    toolChoice: body.tool_choice,
    thinking: anthropicThinking.thinking,
    outputConfig: anthropicThinking.outputConfig,
  });
  if (anthropicCompat.adjustments.length > 0) {
    req.log.info({ model, provider: "anthropic", compatibilityAdjustments: anthropicCompat.adjustments, feature: "count_tokens" }, "Anthropic compatibility normalized");
  }

  const countParams: Anthropic.MessageCountTokensParams = {
    model,
    messages: sanitizedAnthropic.messages,
  };
  if (sanitizedAnthropic.system) countParams.system = sanitizedAnthropic.system;
  if (sanitizedAnthropic.tools) countParams.tools = sanitizedAnthropic.tools;
  if (anthropicCompat.toolChoice) countParams.tool_choice = anthropicCompat.toolChoice;
  if (anthropicCompat.thinking) countParams.thinking = anthropicCompat.thinking;

  const anthropicRequestOptions = buildAnthropicRequestOptions(req, body as unknown as Record<string, unknown>, anthropicUpstreamAuth.requestOptions);

  try {
    const result = await withRetry(() => anthropic.messages.countTokens(countParams, anthropicRequestOptions));
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err, model, provider: "anthropic" }, "Anthropic count_tokens error");
    sendAnthropicProviderError(res, err);
  }
});

router.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Anthropic.MessageCreateParams;
  const inputError = validateAnthropicMessagesInput(body);
  if (inputError) {
    sendAnthropicInvalidRequest(res, inputError);
    return;
  }
  const requestedModel = body.model;
  const stream = Boolean(body.stream);
  const samplingInput = {
    temperature: body.temperature,
    topP: (body as any).top_p as number | undefined,
    frequencyPenalty: (body as any).frequency_penalty as number | undefined,
    presencePenalty: (body as any).presence_penalty as number | undefined,
  };

  if (!requestedModel) {
    res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: "model is required" } });
    return;
  }
  const model = stripThinkingModelSuffix(requestedModel);
  const targetProvider = isAnthropicModel(model) ? "anthropic"
    : isOpenAIModel(model) ? "openai"
    : isGeminiModel(model) ? "gemini"
    : isOpenRouterModel(model) ? "openrouter"
    : null;
  const visionSummary = summarizeVisionInput("messages", body as unknown as Record<string, unknown>);
  const hasVisionInput = requestHasVisionInput("messages", body as unknown as Record<string, unknown>);
  if (hasVisionInput) {
    req.log.info({
      model,
      requestedModel,
      visionInputCount: visionSummary.count,
      visionInputKinds: visionSummary.kinds,
      visionTargetProvider: targetProvider ?? "unknown",
    }, "Vision input detected");
  }
  if (hasVisionInput && !supportsVision(model)) {
    req.log.warn({
      model,
      requestedModel,
      visionInputCount: visionSummary.count,
      visionInputKinds: visionSummary.kinds,
      visionRejectedForUnsupportedModel: true,
    }, "Vision input rejected for unsupported model");
    sendAnthropicInvalidRequest(res, `Model "${requestedModel}" does not support image inputs`);
    return;
  }
  const thinkingResolution = targetProvider
    ? resolveThinkingRequest({ model: requestedModel, body: body as unknown as Record<string, unknown>, route: "messages", targetProvider })
    : null;
  if (thinkingResolution) {
    logThinkingDecision(req, thinkingResolution);
  }
  const startTs = Date.now();

  if (isAnthropicModel(model)) {
    const sampling = normalizeSamplingParams("anthropic", samplingInput);
    if (sampling.adjustments.length > 0) {
      req.log.info({ model, provider: "anthropic", samplingAdjustments: sampling.adjustments }, "Anthropic sampling normalized");
    }

    const anthropicUpstreamAuth = resolveAnthropicUpstreamAuth(req);
    logAnthropicUpstreamAuth(req, res, { model, feature: "messages", auth: anthropicUpstreamAuth });
    if (anthropicUpstreamAuth.missing) {
      sendAnthropicAuthUnavailable(res);
      return;
    }

    const anthropic = getAnthropicClient();
    const sanitizedAnthropic = sanitizeAnthropicPayload({
      system: body.system,
      messages: body.messages,
      tools: body.tools,
    });

    if (sanitizedAnthropic.removedPaths.length > 0) {
      req.log.info({ model, provider: "anthropic", removedPaths: sanitizedAnthropic.removedPaths }, "Sanitized unsupported Anthropic payload fields");
    }

    const anthropicThinking = thinkingResolution
      ? buildAnthropicThinkingPayload({
          resolution: thinkingResolution,
          maxTokens: body.max_tokens ?? 8192,
          existingOutputConfig: body.output_config,
        })
      : {};
    const anthropicCompat = normalizeAnthropicCompatibility({
      toolChoice: body.tool_choice,
      thinking: anthropicThinking.thinking,
      outputConfig: anthropicThinking.outputConfig,
      temperature: sampling.temperature,
    });
    if (anthropicCompat.adjustments.length > 0) {
      req.log.info({ model, provider: "anthropic", compatibilityAdjustments: anthropicCompat.adjustments }, "Anthropic compatibility normalized");
    }

    const anthropicParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: body.max_tokens ?? 8192,
      messages: sanitizedAnthropic.messages,
    };
    if (sanitizedAnthropic.system) anthropicParams.system = sanitizedAnthropic.system;
    if (sanitizedAnthropic.tools) anthropicParams.tools = sanitizedAnthropic.tools;
    if (anthropicCompat.toolChoice) anthropicParams.tool_choice = anthropicCompat.toolChoice;
    if (anthropicCompat.temperature !== undefined) anthropicParams.temperature = anthropicCompat.temperature;
    if (sampling.topP !== undefined) (anthropicParams as any).top_p = sampling.topP;
    if (anthropicCompat.thinking) anthropicParams.thinking = anthropicCompat.thinking;
    if (anthropicCompat.outputConfig) anthropicParams.output_config = anthropicCompat.outputConfig;
    if ((body as any).stop_sequences) (anthropicParams as any).stop_sequences = (body as any).stop_sequences;

    const anthropicRequestOptions = buildAnthropicRequestOptions(req, body as unknown as Record<string, unknown>, anthropicUpstreamAuth.requestOptions);

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const anthropicStream = anthropic.messages.stream(anthropicParams, anthropicRequestOptions);
        let streamInputTokens = 0;
        let streamOutputTokens = 0;
        for await (const event of anthropicStream) {
          if (event.type === "message_start") {
            streamInputTokens = event.message.usage?.input_tokens ?? streamInputTokens;
          } else if (event.type === "message_delta") {
            streamOutputTokens = event.usage?.output_tokens ?? streamOutputTokens;
          }
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          (res as any).flush?.();
        }
        const latencyMs = Date.now() - startTs;
        req.log.info({ model, provider: "anthropic", latencyMs, stream: true, promptTokens: streamInputTokens, completionTokens: streamOutputTokens }, "Anthropic native stream complete");
        appendUsage({
          timestamp: Date.now(),
          model,
          provider: "anthropic",
          promptTokens: streamInputTokens,
          completionTokens: streamOutputTokens,
          totalTokens: streamInputTokens + streamOutputTokens,
          latencyMs,
          cached: false,
        });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "anthropic" }, "Anthropic native stream error");
        try {
          const normalized = normalizeProviderError(streamErr, "Stream error");
          const errObj = { type: "error", error: { type: normalized.anthropicType, message: normalized.message } };
          res.write(`event: error\ndata: ${JSON.stringify(errObj)}\n\n`);
        } catch {}
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    try {
      const finalMsg = await withRetry(() =>
        anthropic.messages.stream(anthropicParams, anthropicRequestOptions).finalMessage()
      );
      const promptTokens = finalMsg.usage.input_tokens;
      const completionTokens = finalMsg.usage.output_tokens;
      const latencyMs = Date.now() - startTs;
      req.log.info({ model, provider: "anthropic", latencyMs, promptTokens, completionTokens }, "Anthropic native request complete");
      appendUsage({
        timestamp: Date.now(),
        model,
        provider: "anthropic",
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
        cached: false,
      });
      res.json(finalMsg);
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "anthropic" }, "Anthropic native error");
      sendAnthropicProviderError(res, err);
    }
    return;
  }

  if (isOpenAIModel(model)) {
    const sampling = normalizeSamplingParams("openai", samplingInput);
    const openai = getOpenAIClient();
    let converted: ReturnType<typeof convertAnthropicRequestToOpenAIPayload>;
    try {
      converted = convertAnthropicRequestToOpenAIPayload(body);
    } catch (err) {
      req.log.warn({ err, model, provider: "openai" }, "Invalid /messages payload for OpenAI conversion");
      sendAnthropicInvalidRequest(res, err instanceof VisionInputError ? err.message : "messages payload is not compatible with Anthropic/OpenAI conversion");
      return;
    }

    const openAIParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: converted.messages,
      stream: false,
    };
    if (body.max_tokens) {
      if (shouldUseOpenAIMaxCompletionTokens(model)) {
        (openAIParams as unknown as Record<string, unknown>).max_completion_tokens = body.max_tokens;
      } else {
        openAIParams.max_tokens = body.max_tokens;
      }
    }
    if (sampling.temperature !== undefined) openAIParams.temperature = sampling.temperature;
    if (sampling.topP !== undefined) openAIParams.top_p = sampling.topP;
    if (sampling.frequencyPenalty !== undefined) openAIParams.frequency_penalty = sampling.frequencyPenalty;
    if (sampling.presencePenalty !== undefined) openAIParams.presence_penalty = sampling.presencePenalty;
    if (converted.tools) openAIParams.tools = converted.tools;
    if (converted.toolChoice) openAIParams.tool_choice = converted.toolChoice;
    const reasoningEffort = thinkingResolution ? buildOpenAIReasoningEffort(thinkingResolution) : undefined;
    if (reasoningEffort !== undefined) openAIParams.reasoning_effort = reasoningEffort;

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const msgId = `msg_${Date.now()}`;
        res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
        res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
        (res as any).flush?.();

        const openAIStream = await withRetry(() =>
          openai.chat.completions.create({
            ...openAIParams,
            stream: true,
            stream_options: { include_usage: true },
          } as OpenAI.ChatCompletionCreateParamsStreaming)
        );
        let currentToolBlockIndex = -1;
        let nextContentBlockIndex = 0;
        let textBlockIndex = -1;
        let thinkingBlockIndex = -1;
        let promptTokens = 0;
        let completionTokens = 0;
        let emittedOutputTokens = 0;
        let textBlockActive = false;
        let thinkingBlockActive = false;

        const stopTextBlock = () => {
          if (!textBlockActive || textBlockIndex < 0) return;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: textBlockIndex })}\n\n`);
          textBlockActive = false;
        };

        const stopThinkingBlock = () => {
          if (!thinkingBlockActive || thinkingBlockIndex < 0) return;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: thinkingBlockIndex })}\n\n`);
          thinkingBlockActive = false;
        };

        const startTextBlock = () => {
          if (textBlockActive) return;
          stopThinkingBlock();
          if (currentToolBlockIndex >= 0) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
            currentToolBlockIndex = -1;
          }
          if (textBlockIndex < 0) textBlockIndex = nextContentBlockIndex++;
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: textBlockIndex, content_block: { type: "text", text: "" } })}\n\n`);
          textBlockActive = true;
        };

        const startThinkingBlock = () => {
          if (thinkingBlockActive) return;
          stopTextBlock();
          if (currentToolBlockIndex >= 0) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
            currentToolBlockIndex = -1;
          }
          if (thinkingBlockIndex < 0) thinkingBlockIndex = nextContentBlockIndex++;
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: thinkingBlockIndex, content_block: { type: "thinking", thinking: "", signature: "" } })}\n\n`);
          thinkingBlockActive = true;
        };

        for await (const chunk of openAIStream) {
          const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
          if (usage) {
            promptTokens = usage.prompt_tokens ?? promptTokens;
            completionTokens = usage.completion_tokens ?? completionTokens;
          }
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta as OpenAI.ChatCompletionChunk.Choice["delta"] & { reasoning_content?: unknown };

          if (delta.content) {
            startTextBlock();
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: textBlockIndex, delta: { type: "text_delta", text: delta.content } })}\n\n`);
            emittedOutputTokens++;
            (res as any).flush?.();
          }

          const reasoningTexts = collectReasoningTexts(delta.reasoning_content);
          for (const reasoningText of reasoningTexts) {
            startThinkingBlock();
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: thinkingBlockIndex, delta: { type: "thinking_delta", thinking: reasoningText } })}\n\n`);
            (res as any).flush?.();
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                stopTextBlock();
                stopThinkingBlock();
                if (currentToolBlockIndex >= 0) {
                  res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
                }
                currentToolBlockIndex = nextContentBlockIndex++;
                res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: currentToolBlockIndex, content_block: { type: "tool_use", id: tc.id, name: tc.function.name, input: {} } })}\n\n`);
                (res as any).flush?.();
              }
              if (tc.function?.arguments) {
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: currentToolBlockIndex, delta: { type: "input_json_delta", partial_json: tc.function.arguments } })}\n\n`);
                (res as any).flush?.();
              }
            }
          }

          if (choice.finish_reason) {
            const stopReason = choice.finish_reason === "tool_calls"
              ? "tool_use"
              : choice.finish_reason === "length"
                ? "max_tokens"
                : "end_turn";
            stopTextBlock();
            stopThinkingBlock();
            if (currentToolBlockIndex >= 0) {
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
              currentToolBlockIndex = -1;
            }
            res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: completionTokens || emittedOutputTokens } })}\n\n`);
            res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
            (res as any).flush?.();
          }
        }
        const latencyMs = Date.now() - startTs;
        req.log.info({ model, provider: "openai", latencyMs, stream: true, promptTokens, completionTokens: completionTokens || emittedOutputTokens }, "OpenAI→Anthropic stream complete");
        appendUsage({
          timestamp: Date.now(),
          model,
          provider: "openai",
          promptTokens,
          completionTokens: completionTokens || emittedOutputTokens,
          totalTokens: promptTokens + (completionTokens || emittedOutputTokens),
          latencyMs,
          cached: false,
        });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "openai" }, "OpenAI→Anthropic stream error in /messages");
        try {
          const normalized = normalizeProviderError(streamErr, "Stream error");
          const errObj = { type: "error", error: { type: normalized.anthropicType, message: normalized.message } };
          res.write(`event: error\ndata: ${JSON.stringify(errObj)}\n\n`);
        } catch {}
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    try {
      const openAIResult = await withRetry(() =>
        openai.chat.completions.create({ ...openAIParams, stream: false })
      ) as OpenAI.ChatCompletion;
      const choice = openAIResult.choices[0];
      const content: AnthropicClientResponseBlock[] = [];
      const reasoningText = joinReasoningTexts(
        collectReasoningTexts((choice.message as unknown as Record<string, unknown>).reasoning_content),
      );
      if (reasoningText) content.push({ type: "thinking", thinking: reasoningText, signature: "" });
      if (choice.message.content) content.push({ type: "text", text: choice.message.content });
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          let input: Record<string, unknown> = {};
          if (!isOpenAIFunctionToolCall(tc)) continue;
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      const stopReason = choice.finish_reason === "tool_calls"
        ? "tool_use"
        : choice.finish_reason === "length"
          ? "max_tokens"
          : "end_turn";
      const anthropicResponse = {
        id: openAIResult.id, type: "message", role: "assistant", content, model,
        stop_reason: stopReason, stop_sequence: null,
        usage: {
          input_tokens: openAIResult.usage?.prompt_tokens ?? 0,
          output_tokens: openAIResult.usage?.completion_tokens ?? 0,
        },
      };
      const promptTokens = openAIResult.usage?.prompt_tokens ?? 0;
      const completionTokens = openAIResult.usage?.completion_tokens ?? 0;
      const latencyMs = Date.now() - startTs;
      req.log.info({ model, provider: "openai", latencyMs, promptTokens, completionTokens }, "OpenAI→Anthropic request complete");
      appendUsage({
        timestamp: Date.now(),
        model,
        provider: "openai",
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
        cached: false,
      });
      res.json(anthropicResponse);
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "openai" }, "OpenAI error in /messages");
      sendAnthropicProviderError(res, err);
    }
    return;
  }

  if (isGeminiModel(model)) {
    const sampling = normalizeSamplingParams("gemini", samplingInput);
    if (sampling.adjustments.length > 0) {
      req.log.info({ model, provider: "gemini", samplingAdjustments: sampling.adjustments }, "Gemini sampling normalized");
    }

    const gemini = getGeminiClient();
    let converted: ReturnType<typeof convertAnthropicRequestToOpenAIPayload>;
    try {
      converted = convertAnthropicRequestToOpenAIPayload(body);
    } catch (err) {
      req.log.warn({ err, model, provider: "gemini" }, "Invalid /messages payload for Gemini conversion");
      sendAnthropicInvalidRequest(res, err instanceof VisionInputError ? err.message : "messages payload is not compatible with Anthropic/Gemini conversion");
      return;
    }
    let systemInstruction: string | undefined;
    let contents: GeminiContent[];
    try {
      ({ systemInstruction, contents } = await convertMessagesToGemini(converted.messages));
    } catch (err) {
      if (err instanceof VisionInputError) {
        req.log.warn({
          model,
          provider: "gemini",
          visionFetchedRemoteImage: visionSummary.kinds.includes("remote_url"),
          visionFetchFailureReason: err.message,
        }, "Gemini vision input rejected");
        sendAnthropicInvalidRequest(res, err.message);
        return;
      }
      throw err;
    }

    const generationConfig: Record<string, unknown> = { maxOutputTokens: body.max_tokens ?? 8192 };
    if (sampling.temperature !== undefined) generationConfig.temperature = sampling.temperature;
    if (sampling.topP !== undefined) generationConfig.topP = sampling.topP;
    if ((body as any).stop_sequences) {
      const stopSequences = (body as any).stop_sequences as string[] | undefined;
      if (Array.isArray(stopSequences) && stopSequences.length > 0) generationConfig.stopSequences = stopSequences;
    }
    const geminiThinking = thinkingResolution ? buildGeminiThinkingConfig(thinkingResolution) : undefined;
    if (geminiThinking) generationConfig.thinkingConfig = geminiThinking;

    const geminiConfig: Record<string, unknown> = { generationConfig };
    if (systemInstruction) geminiConfig.systemInstruction = systemInstruction;
    if (converted.tools && body.tool_choice?.type !== "none") {
      geminiConfig.tools = convertToolsToGemini(converted.tools);
      const toolConfig = convertToolChoiceToGemini(converted.toolChoice);
      if (toolConfig) geminiConfig.toolConfig = toolConfig;
    }

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const msgId = `msg_${Date.now()}`;
        res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
        res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
        (res as any).flush?.();

        const geminiStream = await withRetry(() =>
          gemini.models.generateContentStream({ model, contents, config: geminiConfig })
        );

        let currentToolBlockIndex = -1;
        let nextContentBlockIndex = 0;
        let textBlockIndex = -1;
        let thinkingBlockIndex = -1;
        let promptTokens = 0;
        let completionTokens = 0;
        let emittedOutputTokens = 0;
        let textBlockActive = false;
        let thinkingBlockActive = false;

        const stopTextBlock = () => {
          if (!textBlockActive || textBlockIndex < 0) return;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: textBlockIndex })}\n\n`);
          textBlockActive = false;
        };

        const stopThinkingBlock = () => {
          if (!thinkingBlockActive || thinkingBlockIndex < 0) return;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: thinkingBlockIndex })}\n\n`);
          thinkingBlockActive = false;
        };

        const startTextBlock = () => {
          if (textBlockActive) return;
          stopThinkingBlock();
          if (currentToolBlockIndex >= 0) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
            currentToolBlockIndex = -1;
          }
          if (textBlockIndex < 0) textBlockIndex = nextContentBlockIndex++;
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: textBlockIndex, content_block: { type: "text", text: "" } })}\n\n`);
          textBlockActive = true;
        };

        const startThinkingBlock = () => {
          if (thinkingBlockActive) return;
          stopTextBlock();
          if (currentToolBlockIndex >= 0) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
            currentToolBlockIndex = -1;
          }
          if (thinkingBlockIndex < 0) thinkingBlockIndex = nextContentBlockIndex++;
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: thinkingBlockIndex, content_block: { type: "thinking", thinking: "", signature: "" } })}\n\n`);
          thinkingBlockActive = true;
        };

        for await (const chunk of geminiStream) {
          const candidate = (chunk as any).candidates?.[0];
          const parts = candidate?.content?.parts ?? [];
          for (const part of parts) {
            if (part.text && part.thought) {
              startThinkingBlock();
              res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: thinkingBlockIndex, delta: { type: "thinking_delta", thinking: part.text } })}\n\n`);
              (res as any).flush?.();
            } else if (part.text) {
              startTextBlock();
              res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: textBlockIndex, delta: { type: "text_delta", text: part.text } })}\n\n`);
              emittedOutputTokens++;
              (res as any).flush?.();
            } else if (part.functionCall) {
              stopTextBlock();
              stopThinkingBlock();
              if (currentToolBlockIndex >= 0) {
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
              }
              currentToolBlockIndex = nextContentBlockIndex++;
              res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: currentToolBlockIndex, content_block: { type: "tool_use", id: `call_${Date.now()}_${currentToolBlockIndex}`, name: part.functionCall.name, input: {} } })}\n\n`);
              res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: currentToolBlockIndex, delta: { type: "input_json_delta", partial_json: JSON.stringify(part.functionCall.args ?? {}) } })}\n\n`);
              (res as any).flush?.();
            }
          }

          const meta = (chunk as any).usageMetadata;
          if (meta) {
            promptTokens = meta.promptTokenCount ?? promptTokens;
            completionTokens = meta.candidatesTokenCount ?? completionTokens;
          }

          if (candidate?.finishReason) {
            stopTextBlock();
            stopThinkingBlock();
            if (currentToolBlockIndex >= 0) {
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
              currentToolBlockIndex = -1;
            }
            const stopReason = candidate.finishReason === "TOOL_CALLS" || candidate.finishReason === "FUNCTION_CALL"
              ? "tool_use"
              : candidate.finishReason === "MAX_TOKENS"
                ? "max_tokens"
                : "end_turn";
            res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: completionTokens || emittedOutputTokens } })}\n\n`);
            res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
            (res as any).flush?.();
          }
        }
        const latencyMs = Date.now() - startTs;
        req.log.info({ model, provider: "gemini", latencyMs, stream: true, promptTokens, completionTokens: completionTokens || emittedOutputTokens }, "Gemini→Anthropic stream complete");
        appendUsage({
          timestamp: Date.now(),
          model,
          provider: "gemini",
          promptTokens,
          completionTokens: completionTokens || emittedOutputTokens,
          totalTokens: promptTokens + (completionTokens || emittedOutputTokens),
          latencyMs,
          cached: false,
        });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "gemini" }, "Gemini→Anthropic stream error in /messages");
        try {
          const normalized = normalizeProviderError(streamErr, "Stream error");
          const errObj = { type: "error", error: { type: normalized.anthropicType, message: normalized.message } };
          res.write(`event: error\ndata: ${JSON.stringify(errObj)}\n\n`);
        } catch {}
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    try {
      const response = await withRetry(() =>
        gemini.models.generateContent({ model, contents, config: geminiConfig })
      );
      const candidate = (response as any).candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const meta = (response as any).usageMetadata;
      const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ThinkingBlockParam> = [];

      for (const part of parts) {
        if (part.text && part.thought) {
          content.push({ type: "thinking", thinking: part.text, signature: part.thoughtSignature ?? "" });
        } else if (part.text) {
          content.push({ type: "text", text: part.text });
        } else if (part.functionCall) {
          content.push({
            type: "tool_use",
            id: `call_${Date.now()}_${content.length}`,
            name: part.functionCall.name,
            input: part.functionCall.args ?? {},
          });
        }
      }

      const stopReason = content.some((block) => block.type === "tool_use")
        ? "tool_use"
        : candidate?.finishReason === "MAX_TOKENS"
          ? "max_tokens"
          : "end_turn";
      res.json({
        id: `msg_${Date.now()}`,
        type: "message",
        role: "assistant",
        content,
        model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
          input_tokens: meta?.promptTokenCount ?? 0,
          output_tokens: meta?.candidatesTokenCount ?? 0,
        },
      });
      const promptTokens = meta?.promptTokenCount ?? 0;
      const completionTokens = meta?.candidatesTokenCount ?? 0;
      const latencyMs = Date.now() - startTs;
      req.log.info({ model, provider: "gemini", latencyMs, promptTokens, completionTokens }, "Gemini→Anthropic request complete");
      appendUsage({
        timestamp: Date.now(),
        model,
        provider: "gemini",
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
        cached: false,
      });
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "gemini" }, "Gemini error in /messages");
      sendAnthropicProviderError(res, err);
    }
    return;
  }

  if (isOpenRouterModel(model)) {
    const sampling = normalizeSamplingParams("openai", samplingInput);
    const openrouter = getOpenRouterClient();
    let converted: ReturnType<typeof convertAnthropicRequestToOpenAIPayload>;
    try {
      converted = convertAnthropicRequestToOpenAIPayload(body);
    } catch (err) {
      req.log.warn({ err, model, provider: "openrouter" }, "Invalid /messages payload for OpenRouter conversion");
      sendAnthropicInvalidRequest(res, err instanceof VisionInputError ? err.message : "messages payload is not compatible with Anthropic/OpenRouter conversion");
      return;
    }

    const orParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: converted.messages,
      stream: false,
    };
    if (body.max_tokens) orParams.max_tokens = body.max_tokens;
    if (sampling.temperature !== undefined) orParams.temperature = sampling.temperature;
    if (sampling.topP !== undefined) orParams.top_p = sampling.topP;
    if (sampling.frequencyPenalty !== undefined) orParams.frequency_penalty = sampling.frequencyPenalty;
    if (sampling.presencePenalty !== undefined) orParams.presence_penalty = sampling.presencePenalty;
    if (converted.tools) orParams.tools = converted.tools;
    if (converted.toolChoice) orParams.tool_choice = converted.toolChoice;

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const msgId = `msg_${Date.now()}`;
        res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
        res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
        (res as any).flush?.();

        const orStream = await withRetry(() =>
          openrouter.chat.completions.create({
            ...orParams,
            stream: true,
            stream_options: { include_usage: true },
          } as OpenAI.ChatCompletionCreateParamsStreaming)
        );

        let currentToolBlockIndex = -1;
        let nextContentBlockIndex = 0;
        let textBlockIndex = -1;
        let promptTokens = 0;
        let completionTokens = 0;
        let emittedOutputTokens = 0;
        let textBlockActive = false;

        const stopTextBlock = () => {
          if (!textBlockActive || textBlockIndex < 0) return;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: textBlockIndex })}\n\n`);
          textBlockActive = false;
        };

        const startTextBlock = () => {
          if (textBlockActive) return;
          if (currentToolBlockIndex >= 0) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
            currentToolBlockIndex = -1;
          }
          if (textBlockIndex < 0) textBlockIndex = nextContentBlockIndex++;
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: textBlockIndex, content_block: { type: "text", text: "" } })}\n\n`);
          textBlockActive = true;
        };

        for await (const chunk of orStream) {
          const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
          if (usage) {
            promptTokens = usage.prompt_tokens ?? promptTokens;
            completionTokens = usage.completion_tokens ?? completionTokens;
          }
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta.content) {
            startTextBlock();
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: textBlockIndex, delta: { type: "text_delta", text: delta.content } })}\n\n`);
            emittedOutputTokens++;
            (res as any).flush?.();
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                stopTextBlock();
                if (currentToolBlockIndex >= 0) {
                  res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
                }
                currentToolBlockIndex = nextContentBlockIndex++;
                res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: currentToolBlockIndex, content_block: { type: "tool_use", id: tc.id, name: tc.function.name, input: {} } })}\n\n`);
                (res as any).flush?.();
              }
              if (tc.function?.arguments) {
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: currentToolBlockIndex, delta: { type: "input_json_delta", partial_json: tc.function.arguments } })}\n\n`);
                (res as any).flush?.();
              }
            }
          }

          if (choice.finish_reason) {
            const stopReason = choice.finish_reason === "tool_calls" ? "tool_use"
              : choice.finish_reason === "length" ? "max_tokens"
              : "end_turn";
            stopTextBlock();
            if (currentToolBlockIndex >= 0) {
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolBlockIndex })}\n\n`);
              currentToolBlockIndex = -1;
            }
            res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: completionTokens || emittedOutputTokens } })}\n\n`);
            res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
            (res as any).flush?.();
          }
        }
        const latencyMs = Date.now() - startTs;
        req.log.info({ model, provider: "openrouter", latencyMs, stream: true, promptTokens, completionTokens: completionTokens || emittedOutputTokens }, "OpenRouter→Anthropic stream complete");
        appendUsage({
          timestamp: Date.now(),
          model,
          provider: "openrouter",
          promptTokens,
          completionTokens: completionTokens || emittedOutputTokens,
          totalTokens: promptTokens + (completionTokens || emittedOutputTokens),
          latencyMs,
          cached: false,
        });
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "openrouter" }, "OpenRouter→Anthropic stream error in /messages");
        try {
          const normalized = normalizeProviderError(streamErr, "Stream error");
          const errObj = { type: "error", error: { type: normalized.anthropicType, message: normalized.message } };
          res.write(`event: error\ndata: ${JSON.stringify(errObj)}\n\n`);
        } catch {}
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    try {
      const orResult = await withRetry(() =>
        openrouter.chat.completions.create({ ...orParams, stream: false })
      ) as OpenAI.ChatCompletion;
      const choice = orResult.choices[0];
      const content: AnthropicClientResponseBlock[] = [];
      if (choice.message.content) content.push({ type: "text", text: choice.message.content });
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (!isOpenAIFunctionToolCall(tc)) continue;
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      const stopReason = choice.finish_reason === "tool_calls" ? "tool_use"
        : choice.finish_reason === "length" ? "max_tokens"
        : "end_turn";
      res.json({
        id: orResult.id, type: "message", role: "assistant", content, model,
        stop_reason: stopReason, stop_sequence: null,
        usage: {
          input_tokens: orResult.usage?.prompt_tokens ?? 0,
          output_tokens: orResult.usage?.completion_tokens ?? 0,
        },
      });
      const promptTokens = orResult.usage?.prompt_tokens ?? 0;
      const completionTokens = orResult.usage?.completion_tokens ?? 0;
      const latencyMs = Date.now() - startTs;
      req.log.info({ model, provider: "openrouter", latencyMs, promptTokens, completionTokens }, "OpenRouter→Anthropic request complete");
      appendUsage({
        timestamp: Date.now(),
        model,
        provider: "openrouter",
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
        cached: false,
      });
    } catch (err: unknown) {
      req.log.error({ err, model, provider: "openrouter" }, "OpenRouter error in /messages");
      sendAnthropicProviderError(res, err);
    }
    return;
  }

  res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: `Unsupported model: ${model}` } });
});

// ─── POST /v1/responses (OpenAI Responses API pass-through) ──────────────────

router.post("/responses", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const requestedModel = body.model as string | undefined;
  const stream = Boolean(body.stream);

  if (!requestedModel) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  const model = stripThinkingModelSuffix(requestedModel);
  if (!isOpenAIModel(model)) {
    res.status(400).json({
      error: {
        message: `The Responses API only supports OpenAI models (gpt-*, o*). Model "${requestedModel}" is not supported here.`,
        type: "invalid_request_error",
      },
    });
    return;
  }

  const visionSummary = summarizeVisionInput("responses", body);
  const hasVisionInput = requestHasVisionInput("responses", body);
  if (hasVisionInput) {
    req.log.info({
      model,
      requestedModel,
      visionInputCount: visionSummary.count,
      visionInputKinds: visionSummary.kinds,
      visionTargetProvider: "openai",
    }, "Vision input detected");
  }
  if (hasVisionInput && !supportsVision(model)) {
    req.log.warn({
      model,
      requestedModel,
      visionInputCount: visionSummary.count,
      visionInputKinds: visionSummary.kinds,
      visionRejectedForUnsupportedModel: true,
    }, "Vision input rejected for unsupported model");
    sendOpenAIInvalidRequest(res, `Model "${requestedModel}" does not support image inputs`);
    return;
  }

  const thinkingResolution = resolveThinkingRequest({
    model: requestedModel,
    body,
    route: "responses",
    targetProvider: "responses",
  });
  logThinkingDecision(req, thinkingResolution);

  const baseUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";
  const upstreamBody = stripAllKnownThinkingFields(body);
  upstreamBody.model = model;
  const nextReasoning = buildResponsesReasoning(
    thinkingResolution,
    isPlainObject(upstreamBody.reasoning) ? upstreamBody.reasoning : undefined,
  );
  if (nextReasoning) upstreamBody.reasoning = nextReasoning;
  else delete upstreamBody.reasoning;

  const { controller, clear } = makeAbortController();
  req.on("close", clear);

  let upstream: globalThis.Response;
  try {
    upstream = await withRetry(() => fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Accept": stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    }));
  } catch (fetchErr) {
    clear();
    req.log.error({ err: fetchErr, model, provider: "openai" }, "Responses API fetch error");
    sendOpenAIProviderError(res, fetchErr, "Upstream request failed");
    return;
  }

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    if (!upstream.body) {
      clear();
      res.end();
      return;
    }

    const reader = (upstream.body as unknown as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
        (res as any).flush?.();
      }
    } catch (streamErr) {
      req.log.error({ err: streamErr, model, provider: "openai" }, "Responses API stream error");
    } finally {
      clear();
      res.end();
    }
    return;
  }

  try {
    const data = await upstream.json() as unknown;
    clear();
    if (upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }
    const normalized = normalizeProviderError({ status: upstream.status, message: isPlainObject(data) ? JSON.stringify(data) : "Upstream error" }, "Upstream error");
    res.status(normalized.status).json({
      error: {
        message: normalized.message,
        type: normalized.openAIType,
        param: "",
        code: normalized.openAICode,
      },
    });
  } catch (err) {
    clear();
    req.log.error({ err, model, provider: "openai" }, "Responses API non-stream error");
    sendOpenAIProviderError(res, { status: upstream.status || 500, message: "Upstream error" }, "Upstream error");
  }
});

router.use((req: Request, res: Response) => {
  sendOpenAIInvalidRequest(res, `Unknown v1 route: ${req.method} ${req.path}`, 404);
});

export default router;

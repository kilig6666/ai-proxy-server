import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { getConfig } from "../lib/config.js";
import { fetchCredits, buildCreditsJson } from "../lib/credits.js";

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
  const e = err as { status?: number; code?: string };
  if ([429, 502, 503, 504].includes(e.status ?? 0)) return true;
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

// ─── Auth + rate-limit middleware ─────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: () => void) {
  const proxyKey = getConfig().proxyApiKey;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${proxyKey}`) {
    res.status(401).json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } });
    return;
  }
  const { allowed, retryAfter } = checkRateLimit(auth);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfter ?? 60));
    res.status(429).json({ error: { message: "Rate limit exceeded. Please retry later.", type: "rate_limit_error", code: 429 } });
    return;
  }
  next();
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-") || model.startsWith("o");
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}

function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-");
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
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: string; parts: GeminiPart[] };

function convertMessagesToGemini(messages: OpenAI.ChatCompletionMessageParam[]): {
  systemInstruction?: string;
  contents: GeminiContent[];
} {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  // Build a tool_call_id → function_name map for tool result conversion
  const toolCallNameMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCallNameMap.set(tc.id, tc.function.name);
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
      const text = typeof msg.content === "string" ? msg.content
        : Array.isArray(msg.content)
          ? (msg.content as { type: string; text?: string }[]).filter(p => p.type === "text").map(p => p.text ?? "").join("")
          : "";
      if (text) parts.push({ text });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      if (parts.length === 0) parts.push({ text: "" });
      contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "user") {
      let parts: GeminiPart[] = [];
      if (typeof msg.content === "string") {
        parts = [{ text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        parts = (msg.content as { type: string; text?: string }[])
          .filter(p => p.type === "text")
          .map(p => ({ text: p.text ?? "" }));
        if (parts.length === 0) parts = [{ text: "" }];
      } else {
        parts = [{ text: "" }];
      }
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
      name: t.function.name,
      description: t.function.description ?? "",
      parameters: t.function.parameters ?? { type: "object", properties: {} },
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
    name: t.function.name,
    description: t.function.description,
    input_schema: (t.function.parameters as Anthropic.Tool["input_schema"]),
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
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const content: Anthropic.ContentBlock[] = [];
        if (msg.content) {
          content.push({ type: "text", text: typeof msg.content === "string" ? msg.content : "" });
        }
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
        converted.push({ role: "assistant", content });
      } else {
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

function convertAnthropicToOpenAI(anthropicMsg: Anthropic.Message, model: string): OpenAI.ChatCompletion {
  const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
  let textContent = "";

  for (const block of anthropicMsg.content) {
    if (block.type === "text") textContent += block.text;
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
  const models = [
    // OpenAI — chat/completions
    { id: "gpt-5.4", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5.2", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5.1", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5-mini", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5-nano", object: "model", created: now, owned_by: "openai" },
    { id: "o4-mini", object: "model", created: now, owned_by: "openai" },
    { id: "o3", object: "model", created: now, owned_by: "openai" },
    { id: "o3-mini", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-4.1", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-4.1-mini", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-4.1-nano", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-4o", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: now, owned_by: "openai" },
    // OpenAI — Responses API only
    { id: "gpt-5.3-codex", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5.2-codex", object: "model", created: now, owned_by: "openai" },
    // Anthropic
    { id: "claude-opus-4-6", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-opus-4-5", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-opus-4-1", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-sonnet-4-6", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-sonnet-4-5", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-haiku-4-5", object: "model", created: now, owned_by: "anthropic" },
    // Gemini
    { id: "gemini-3.1-pro-preview", object: "model", created: now, owned_by: "google" },
    { id: "gemini-3-pro-preview", object: "model", created: now, owned_by: "google" },
    { id: "gemini-3-flash-preview", object: "model", created: now, owned_by: "google" },
    { id: "gemini-2.5-pro", object: "model", created: now, owned_by: "google" },
    { id: "gemini-2.5-flash", object: "model", created: now, owned_by: "google" },
  ];
  res.json({ object: "list", data: models });
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
  const model = body.model as string;
  const stream = Boolean(body.stream);
  const rawMessages = (body.messages ?? []) as OpenAI.ChatCompletionMessageParam[];
  const tools = body.tools as OpenAI.ChatCompletionTool[] | undefined;
  const toolChoice = body.tool_choice as OpenAI.ChatCompletionCreateParams["tool_choice"] | undefined;
  // Fix 7: extract all common sampling params
  const temperature = body.temperature as number | undefined;
  const maxTokens = body.max_tokens as number | undefined;
  const topP = body.top_p as number | undefined;
  const stop = body.stop as string | string[] | null | undefined;
  const presencePenalty = body.presence_penalty as number | undefined;
  const frequencyPenalty = body.frequency_penalty as number | undefined;
  // Fix 9: preserve stream_options for OpenAI pass-through; detect include_usage for Anthropic/Gemini
  const streamOpts = body.stream_options as { include_usage?: boolean } | undefined;
  const includeUsageInStream = Boolean(streamOpts?.include_usage);

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  if (isOpenAIModel(model)) {
    const openAIParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: rawMessages,
      stream: false,
    };
    if (tools) openAIParams.tools = tools;
    if (toolChoice) openAIParams.tool_choice = toolChoice;
    if (temperature !== undefined) openAIParams.temperature = temperature;
    if (maxTokens !== undefined) openAIParams.max_tokens = maxTokens;
    // Fix 7: forward extra sampling params
    if (topP !== undefined) openAIParams.top_p = topP;
    if (stop != null) openAIParams.stop = stop as string | string[];
    if (presencePenalty !== undefined) openAIParams.presence_penalty = presencePenalty;
    if (frequencyPenalty !== undefined) openAIParams.frequency_penalty = frequencyPenalty;
    // Fix 9: pass stream_options through to OpenAI natively
    if (stream && streamOpts) (openAIParams as Record<string, unknown>).stream_options = streamOpts;

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
        for await (const chunk of streamRes) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          (res as any).flush?.();
        }
        res.write("data: [DONE]\n\n");
        clear();
        // Fix 11: log latency
        req.log.info({ model, provider: "openai", latencyMs: Date.now() - startTs, stream: true }, "OpenAI stream complete");
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
        // Fix 11: log model + usage + latency
        req.log.info({
          model,
          provider: "openai",
          latencyMs: Date.now() - startTs,
          promptTokens: result.usage?.prompt_tokens,
          completionTokens: result.usage?.completion_tokens,
        }, "OpenAI request complete");
        res.json(result);
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        req.log.error({ err, model, provider: "openai" }, "OpenAI error");
        res.status(e.status ?? 500).json({ error: { message: e.message ?? "Internal server error", type: "api_error" } });
      }
    }
    return;
  }

  // ── Anthropic ────────────────────────────────────────────────────────────────
  if (isAnthropicModel(model)) {
    const anthropic = getAnthropicClient();
    const { system, messages } = convertMessagesToAnthropic(rawMessages);

    const anthropicParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens ?? 8192,
      messages,
    };
    if (system) anthropicParams.system = system;
    // Fix B: when tool_choice is "none", strip both tools and tool_choice
    const effectiveToolChoice = toolChoice === "none" ? undefined : toolChoice;
    if (tools && toolChoice !== "none") anthropicParams.tools = convertToolsToAnthropic(tools);
    if (effectiveToolChoice) anthropicParams.tool_choice = convertToolChoiceToAnthropic(effectiveToolChoice);
    if (temperature !== undefined) anthropicParams.temperature = temperature;
    // Fix 7: forward top_p and stop sequences where Anthropic supports them
    if (topP !== undefined) (anthropicParams as Record<string, unknown>).top_p = topP;
    if (stop != null) {
      const stopArr = Array.isArray(stop) ? stop : [stop];
      if (stopArr.length > 0) (anthropicParams as Record<string, unknown>).stop_sequences = stopArr;
    }

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
        const anthropicStream = anthropic.messages.stream(anthropicParams);

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
        // Fix 11: log after stream
        req.log.info({
          model,
          provider: "anthropic",
          latencyMs: Date.now() - startTs,
          promptTokens: streamInputTokens,
          completionTokens: streamOutputTokens,
          stream: true,
        }, "Anthropic stream complete");
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
        anthropic.messages.stream(anthropicParams).finalMessage()
      );
      req.log.info({
        model,
        provider: "anthropic",
        latencyMs: Date.now() - startTs,
        promptTokens: finalMsg.usage.input_tokens,
        completionTokens: finalMsg.usage.output_tokens,
      }, "Anthropic request complete");
      res.json(convertAnthropicToOpenAI(finalMsg, model));
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err, model, provider: "anthropic" }, "Anthropic error");
      res.status(e.status ?? 500).json({ error: { message: e.message ?? "Internal server error", type: "api_error" } });
    }
    return;
  }

  // ── Gemini ───────────────────────────────────────────────────────────────────
  if (isGeminiModel(model)) {
    const gemini = getGeminiClient();
    const { systemInstruction, contents } = convertMessagesToGemini(rawMessages);

    // Fix 7: full generationConfig
    const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens ?? 8192 };
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (topP !== undefined) generationConfig.topP = topP;
    if (stop != null) {
      const stopArr = Array.isArray(stop) ? stop : [stop];
      if (stopArr.length > 0) generationConfig.stopSequences = stopArr;
    }

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
            if (part.text) {
              const textChunk: OpenAI.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: part.text }, finish_reason: null, logprobs: null }],
              };
              res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
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
                usage: {
                  prompt_tokens: geminiInputTokens,
                  completion_tokens: geminiOutputTokens,
                  total_tokens: geminiInputTokens + geminiOutputTokens,
                },
              };
              res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
            }
            (res as any).flush?.();
          }
        }

        res.write("data: [DONE]\n\n");
        req.log.info({
          model, provider: "gemini",
          latencyMs: Date.now() - startTs,
          promptTokens: geminiInputTokens,
          completionTokens: geminiOutputTokens,
          stream: true,
        }, "Gemini stream complete");
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
      for (const part of parts) {
        if (part.text) {
          textContent += part.text;
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
      const message: OpenAI.ChatCompletionMessage = {
        role: "assistant",
        content: textContent || null,
        refusal: null,
      };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;

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
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
      };

      req.log.info({
        model, provider: "gemini",
        latencyMs: Date.now() - startTs,
        promptTokens, completionTokens,
      }, "Gemini request complete");
      res.json(result);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err, model, provider: "gemini" }, "Gemini error");
      res.status(e.status ?? 500).json({ error: { message: e.message ?? "Internal server error", type: "api_error" } });
    }
    return;
  }

  res.status(400).json({ error: { message: `Unsupported model: ${model}`, type: "invalid_request_error" } });
});

// ─── POST /v1/messages (Anthropic native API) ─────────────────────────────────

router.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Anthropic.MessageCreateParams;
  const { model } = body;
  const stream = Boolean(body.stream);

  if (!model) {
    res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: "model is required" } });
    return;
  }

  if (isAnthropicModel(model)) {
    const anthropic = getAnthropicClient();
    const anthropicParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: body.max_tokens ?? 8192,
      messages: body.messages,
    };
    if (body.system) anthropicParams.system = body.system;
    if (body.tools) anthropicParams.tools = body.tools;
    if (body.tool_choice) anthropicParams.tool_choice = body.tool_choice;
    if (body.temperature !== undefined) anthropicParams.temperature = body.temperature;
    if ((body as any).top_p !== undefined) (anthropicParams as any).top_p = (body as any).top_p;
    if ((body as any).stop_sequences) (anthropicParams as any).stop_sequences = (body as any).stop_sequences;

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const anthropicStream = anthropic.messages.stream(anthropicParams);
        for await (const event of anthropicStream) {
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          (res as any).flush?.();
        }
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "anthropic" }, "Anthropic native stream error");
        try {
          const errObj = { type: "error", error: { type: "api_error", message: (streamErr as { message?: string }).message ?? "Stream error" } };
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
        anthropic.messages.stream(anthropicParams).finalMessage()
      );
      res.json(finalMsg);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err, model, provider: "anthropic" }, "Anthropic native error");
      res.status(e.status ?? 500).json({ type: "error", error: { type: "api_error", message: e.message ?? "Internal server error" } });
    }
    return;
  }

  if (isOpenAIModel(model)) {
    const openai = getOpenAIClient();

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
          const toolResults = content.filter((b) => b.type === "tool_result") as Anthropic.ToolResultBlockParam[];
          const textBlocks = content.filter((b) => b.type === "text") as Anthropic.TextBlockParam[];
          for (const tr of toolResults) {
            openAIMessages.push({
              role: "tool",
              tool_call_id: tr.tool_use_id,
              content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
            });
          }
          if (textBlocks.length > 0) {
            openAIMessages.push({ role: "user", content: textBlocks.map((b) => b.text).join("") });
          }
        }
      } else if (msg.role === "assistant") {
        const blocks = Array.isArray(msg.content) ? (msg.content as Anthropic.ContentBlock[]) : [];
        const toolUseBlocks = blocks.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
        const textBlocks = blocks.filter((b) => b.type === "text") as Anthropic.TextBlock[];
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
        openAIMessages.push(assistantMsg);
      }
    }

    const openAITools: OpenAI.ChatCompletionTool[] | undefined = body.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: (t as Anthropic.Tool).input_schema,
      },
    }));

    let openAIToolChoice: OpenAI.ChatCompletionCreateParams["tool_choice"] | undefined;
    if (body.tool_choice) {
      const tc = body.tool_choice;
      if (tc.type === "auto") openAIToolChoice = "auto";
      else if (tc.type === "any") openAIToolChoice = "required";
      else if (tc.type === "tool") openAIToolChoice = { type: "function", function: { name: (tc as Anthropic.ToolChoiceTool).name } };
    }

    const openAIParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: openAIMessages,
      stream: false,
    };
    if (body.max_tokens) openAIParams.max_tokens = body.max_tokens;
    if (openAITools) openAIParams.tools = openAITools;
    if (openAIToolChoice) openAIParams.tool_choice = openAIToolChoice;

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const msgId = `msg_${Date.now()}`;
        res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
        res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
        res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
        (res as any).flush?.();

        const openAIStream = await withRetry(() =>
          openai.chat.completions.create({ ...openAIParams, stream: true })
        );
        let currentToolIndex = -1;
        let toolBlocks: { id: string; name: string }[] = [];
        let outputTokens = 0;
        let textBlockActive = true;

        for await (const chunk of openAIStream) {
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta.content) {
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: toolBlocks.length, delta: { type: "text_delta", text: delta.content } })}\n\n`);
            outputTokens++;
            (res as any).flush?.();
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                if (textBlockActive) {
                  res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
                  textBlockActive = false;
                }
                currentToolIndex = toolBlocks.length;
                toolBlocks.push({ id: tc.id, name: tc.function.name });
                res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: currentToolIndex + 1, content_block: { type: "tool_use", id: tc.id, name: tc.function.name, input: {} } })}\n\n`);
                (res as any).flush?.();
              }
              if (tc.function?.arguments) {
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: currentToolIndex + 1, delta: { type: "input_json_delta", partial_json: tc.function.arguments } })}\n\n`);
                (res as any).flush?.();
              }
            }
          }

          if (choice.finish_reason) {
            const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
            if (textBlockActive) {
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
            } else if (currentToolIndex >= 0) {
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: currentToolIndex + 1 })}\n\n`);
            }
            res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`);
            res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
            (res as any).flush?.();
          }
        }
      } catch (streamErr) {
        req.log.error({ err: streamErr, model, provider: "openai" }, "OpenAI→Anthropic stream error in /messages");
        try {
          const errObj = { type: "error", error: { type: "api_error", message: (streamErr as { message?: string }).message ?? "Stream error" } };
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
      const content: Anthropic.ContentBlock[] = [];
      if (choice.message.content) content.push({ type: "text", text: choice.message.content });
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
      const anthropicResponse: Anthropic.Message = {
        id: openAIResult.id, type: "message", role: "assistant", content, model,
        stop_reason: stopReason, stop_sequence: null,
        usage: {
          input_tokens: openAIResult.usage?.prompt_tokens ?? 0,
          output_tokens: openAIResult.usage?.completion_tokens ?? 0,
        },
      };
      res.json(anthropicResponse);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err, model, provider: "openai" }, "OpenAI error in /messages");
      res.status(e.status ?? 500).json({ type: "error", error: { type: "api_error", message: e.message ?? "Internal server error" } });
    }
    return;
  }

  res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: `Unsupported model: ${model}` } });
});

// ─── POST /v1/responses (OpenAI Responses API pass-through) ──────────────────

router.post("/responses", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const model = body.model as string | undefined;
  const stream = Boolean(body.stream);

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  if (!isOpenAIModel(model)) {
    res.status(400).json({
      error: {
        message: `The Responses API only supports OpenAI models (gpt-*, o*). Model "${model}" is not supported here.`,
        type: "invalid_request_error",
      },
    });
    return;
  }

  const baseUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

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
      body: JSON.stringify(body),
      signal: controller.signal,
    }));
  } catch (fetchErr) {
    clear();
    req.log.error({ err: fetchErr, model, provider: "openai" }, "Responses API fetch error");
    res.status(502).json({ error: { message: "Upstream request failed", type: "api_error" } });
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
    res.status(upstream.status).json(data);
  } catch (err) {
    clear();
    req.log.error({ err, model, provider: "openai" }, "Responses API non-stream error");
    res.status(upstream.status || 500).json({ error: { message: "Upstream error", type: "api_error" } });
  }
});

export default router;

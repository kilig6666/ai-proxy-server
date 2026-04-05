import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

function getOpenAIClient() {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

function getAnthropicClient() {
  return new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  });
}

function requireAuth(req: Request, res: Response, next: () => void) {
  const proxyKey = process.env.PROXY_API_KEY;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${proxyKey}`) {
    res.status(401).json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } });
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

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "dummy",
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  } as ConstructorParameters<typeof GoogleGenAI>[0]);
}

type GeminiContent = { role: string; parts: { text: string }[] };

function convertMessagesToGemini(messages: OpenAI.ChatCompletionMessageParam[]): {
  systemInstruction?: string;
  contents: GeminiContent[];
} {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = typeof msg.content === "string" ? msg.content : "";
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = (msg.content as { type: string; text?: string }[])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
    }
    // Merge consecutive same-role messages (Gemini requires alternating roles)
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  return { systemInstruction, contents };
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
        // Only pass role + content — strip any extra OpenAI fields
        converted.push({
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
        });
      }
      continue;
    }

    if (msg.role === "user") {
      // Only pass role + content — strip cache_control and any other unknown fields
      const rawContent = msg.content;
      if (typeof rawContent === "string") {
        converted.push({ role: "user", content: rawContent });
      } else if (Array.isArray(rawContent)) {
        // Convert multipart content, strip unknown fields
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

// ─── GET /v1/models ──────────────────────────────────────────────────────────

router.get("/models", requireAuth, (_req: Request, res: Response) => {
  const now = Math.floor(Date.now() / 1000);
  const models = [
    // OpenAI
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

// ─── POST /v1/chat/completions ────────────────────────────────────────────────

router.post("/chat/completions", requireAuth, async (req: Request, res: Response) => {
  // Extract only the fields we need — this strips unknown/incompatible fields like stream_options
  const body = req.body as Record<string, unknown>;
  const model = body.model as string;
  const stream = Boolean(body.stream);
  const rawMessages = (body.messages ?? []) as OpenAI.ChatCompletionMessageParam[];
  const tools = body.tools as OpenAI.ChatCompletionTool[] | undefined;
  const toolChoice = body.tool_choice as OpenAI.ChatCompletionCreateParams["tool_choice"] | undefined;
  const temperature = body.temperature as number | undefined;
  const maxTokens = body.max_tokens as number | undefined;

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  if (isOpenAIModel(model)) {
    // Build a clean OpenAI params object
    const openAIParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: rawMessages,
      stream: false,
    };
    if (tools) openAIParams.tools = tools;
    if (toolChoice) openAIParams.tool_choice = toolChoice;
    if (temperature !== undefined) openAIParams.temperature = temperature;
    if (maxTokens !== undefined) openAIParams.max_tokens = maxTokens;

    const openai = getOpenAIClient();

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      try {
        const streamRes = await openai.chat.completions.create({ ...openAIParams, stream: true });
        for await (const chunk of streamRes) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          (res as any).flush?.();
        }
        res.write("data: [DONE]\n\n");
      } catch (streamErr) {
        req.log.error({ err: streamErr }, "OpenAI stream error in chat/completions");
        writeSseError(res, (streamErr as { message?: string }).message ?? "Stream error");
      } finally {
        clearInterval(keepalive);
        res.end();
      }
    } else {
      try {
        const result = await openai.chat.completions.create({ ...openAIParams, stream: false });
        res.json(result);
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        req.log.error({ err }, "OpenAI error in chat/completions");
        res.status(e.status ?? 500).json({ error: { message: e.message ?? "Internal server error", type: "api_error" } });
      }
    }
    return;
  }

  if (isAnthropicModel(model)) {
    const anthropic = getAnthropicClient();
    const { system, messages } = convertMessagesToAnthropic(rawMessages);

    const anthropicParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens ?? 8192,
      messages,
    };
    if (system) anthropicParams.system = system;
    if (tools) anthropicParams.tools = convertToolsToAnthropic(tools);
    if (toolChoice) anthropicParams.tool_choice = convertToolChoiceToAnthropic(toolChoice);
    if (temperature !== undefined) anthropicParams.temperature = temperature;

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      let messageId = `chatcmpl-${Date.now()}`;
      let toolUseBlocks: { id: string; name: string; inputJson: string }[] = [];
      let currentToolIndex = -1;

      try {
        const anthropicStream = anthropic.messages.stream(anthropicParams);

        for await (const event of anthropicStream) {
          if (event.type === "message_start") {
            messageId = event.message.id;
            const initChunk: OpenAI.ChatCompletionChunk = {
              id: messageId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null, logprobs: null }],
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
              : (event.delta.stop_reason ?? "stop");
            const finalChunk: OpenAI.ChatCompletionChunk = {
              id: messageId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: {}, finish_reason: finishReason as OpenAI.ChatCompletionChunk.Choice["finish_reason"], logprobs: null }],
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            (res as any).flush?.();
          }
        }
        res.write("data: [DONE]\n\n");
      } catch (streamErr) {
        req.log.error({ err: streamErr }, "Anthropic stream error in chat/completions");
        writeSseError(res, (streamErr as { message?: string }).message ?? "Anthropic stream error");
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    // Non-streaming: use stream().finalMessage() per Anthropic recommendation
    try {
      const finalMsg = await anthropic.messages.stream(anthropicParams).finalMessage();
      res.json(convertAnthropicToOpenAI(finalMsg, model));
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err }, "Anthropic error in chat/completions");
      res.status(e.status ?? 500).json({ error: { message: e.message ?? "Internal server error", type: "api_error" } });
    }
    return;
  }

  if (isGeminiModel(model)) {
    const gemini = getGeminiClient();
    const { systemInstruction, contents } = convertMessagesToGemini(rawMessages);

    const geminiConfig: Record<string, unknown> = { maxOutputTokens: maxTokens ?? 8192 };
    if (temperature !== undefined) geminiConfig.temperature = temperature;
    if (systemInstruction) geminiConfig.systemInstruction = systemInstruction;

    if (stream) {
      const keepalive = setupSseHeaders(req, res, () => {
        res.write(": keepalive\n\n");
        (res as any).flush?.();
      });
      req.on("close", () => clearInterval(keepalive));

      const msgId = `chatcmpl-${Date.now()}`;
      try {
        const initChunk: OpenAI.ChatCompletionChunk = {
          id: msgId, object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000), model,
          choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null, logprobs: null }],
        };
        res.write(`data: ${JSON.stringify(initChunk)}\n\n`);

        const geminiStream = await gemini.models.generateContentStream({ model, contents, config: geminiConfig });
        for await (const chunk of geminiStream) {
          const text = (chunk as any).text as string | undefined;
          if (text) {
            const textChunk: OpenAI.ChatCompletionChunk = {
              id: msgId, object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000), model,
              choices: [{ index: 0, delta: { content: text }, finish_reason: null, logprobs: null }],
            };
            res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
            (res as any).flush?.();
          }
        }

        const doneChunk: OpenAI.ChatCompletionChunk = {
          id: msgId, object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000), model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop", logprobs: null }],
        };
        res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
      } catch (streamErr) {
        req.log.error({ err: streamErr }, "Gemini stream error in chat/completions");
        writeSseError(res, (streamErr as { message?: string }).message ?? "Gemini stream error");
      } finally {
        clearInterval(keepalive);
        res.end();
      }
      return;
    }

    try {
      const response = await gemini.models.generateContent({ model, contents, config: geminiConfig });
      const text = (response as any).text as string ?? "";
      const result: OpenAI.ChatCompletion = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: text, refusal: null },
          finish_reason: "stop",
          logprobs: null,
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
      res.json(result);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err }, "Gemini error in chat/completions");
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
    // Build clean params — strip any OpenAI-only fields
    const anthropicParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: body.max_tokens ?? 8192,
      messages: body.messages,
    };
    if (body.system) anthropicParams.system = body.system;
    if (body.tools) anthropicParams.tools = body.tools;
    if (body.tool_choice) anthropicParams.tool_choice = body.tool_choice;
    if (body.temperature !== undefined) anthropicParams.temperature = body.temperature;

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
        req.log.error({ err: streamErr }, "Anthropic stream error in messages");
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
      const finalMsg = await anthropic.messages.stream(anthropicParams).finalMessage();
      res.json(finalMsg);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      req.log.error({ err }, "Anthropic error in messages");
      res.status(e.status ?? 500).json({ type: "error", error: { type: "api_error", message: e.message ?? "Internal server error" } });
    }
    return;
  }

  if (isOpenAIModel(model)) {
    const openai = getOpenAIClient();

    // Convert Anthropic-format messages → OpenAI messages
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

        const openAIStream = await openai.chat.completions.create({ ...openAIParams, stream: true });
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
        req.log.error({ err: streamErr }, "OpenAI stream error in messages");
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
      const openAIResult = await openai.chat.completions.create({ ...openAIParams, stream: false }) as OpenAI.ChatCompletion;
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
      req.log.error({ err }, "OpenAI error in messages");
      res.status(e.status ?? 500).json({ type: "error", error: { type: "api_error", message: e.message ?? "Internal server error" } });
    }
    return;
  }

  res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: `Unsupported model: ${model}` } });
});

export default router;

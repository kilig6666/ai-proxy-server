import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// Initialize clients lazily using env vars from Replit AI Integrations
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

// Auth middleware
function requireAuth(req: Request, res: Response, next: () => void) {
  const proxyKey = process.env.PROXY_API_KEY;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${proxyKey}`) {
    res.status(401).json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } });
    return;
  }
  next();
}

// Model routing helpers
function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-") || model.startsWith("o");
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}

// Convert OpenAI tool format → Anthropic tool format
function convertToolsToAnthropic(tools: OpenAI.ChatCompletionTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: (t.function.parameters as Anthropic.Tool["input_schema"]),
  }));
}

// Convert OpenAI tool_choice → Anthropic tool_choice
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

// Convert OpenAI messages → Anthropic messages (with tool_result support)
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
      // Convert tool result to Anthropic format - append to last user message or create new one
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

    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const content: Anthropic.ContentBlock[] = [];
      if (msg.content) {
        content.push({ type: "text", text: typeof msg.content === "string" ? msg.content : "" });
      }
      for (const tc of msg.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments);
        } catch {
          input = {};
        }
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      converted.push({ role: "assistant", content });
      continue;
    }

    if (msg.role === "user" || msg.role === "assistant") {
      converted.push({
        role: msg.role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
    }
  }

  return { system, messages: converted };
}

// Convert Anthropic response → OpenAI response
function convertAnthropicToOpenAI(
  anthropicMsg: Anthropic.Message,
  model: string,
): OpenAI.ChatCompletion {
  const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
  let textContent = "";

  for (const block of anthropicMsg.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const finishReason =
    anthropicMsg.stop_reason === "tool_use"
      ? "tool_calls"
      : anthropicMsg.stop_reason === "end_turn"
        ? "stop"
        : (anthropicMsg.stop_reason ?? "stop");

  const message: OpenAI.ChatCompletionMessage = {
    role: "assistant",
    content: textContent || null,
    refusal: null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return {
    id: anthropicMsg.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason as OpenAI.ChatCompletion.Choice["finish_reason"],
        logprobs: null,
      },
    ],
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
    { id: "gpt-5-mini", object: "model", created: now, owned_by: "openai" },
    { id: "gpt-5-nano", object: "model", created: now, owned_by: "openai" },
    { id: "o4-mini", object: "model", created: now, owned_by: "openai" },
    { id: "o3", object: "model", created: now, owned_by: "openai" },
    // Anthropic
    { id: "claude-opus-4-6", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-sonnet-4-6", object: "model", created: now, owned_by: "anthropic" },
    { id: "claude-haiku-4-5", object: "model", created: now, owned_by: "anthropic" },
  ];
  res.json({ object: "list", data: models });
});

// ─── POST /v1/chat/completions ────────────────────────────────────────────────

router.post("/chat/completions", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as OpenAI.ChatCompletionCreateParams;
  const { model, stream } = body;

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  try {
    if (isOpenAIModel(model)) {
      const openai = getOpenAIClient();
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          res.write(": keepalive\n\n");
          (res as any).flush?.();
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          const streamRes = await openai.chat.completions.create({ ...body, stream: true });
          for await (const chunk of streamRes) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            (res as any).flush?.();
          }
          res.write("data: [DONE]\n\n");
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const result = await openai.chat.completions.create({ ...body, stream: false });
        res.json(result);
      }
    } else if (isAnthropicModel(model)) {
      const anthropic = getAnthropicClient();
      const { system, messages } = convertMessagesToAnthropic(body.messages);

      const anthropicParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: body.max_tokens ?? 8192,
        messages,
      };
      if (system) anthropicParams.system = system;
      if (body.tools) anthropicParams.tools = convertToolsToAnthropic(body.tools);
      if (body.tool_choice) anthropicParams.tool_choice = convertToolChoiceToAnthropic(body.tool_choice);
      if (body.temperature !== undefined) anthropicParams.temperature = body.temperature;

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          res.write(": keepalive\n\n");
          (res as any).flush?.();
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        // Track streaming state for tool call reconstruction
        let messageId = `chatcmpl-${Date.now()}`;
        let toolUseBlocks: { id: string; name: string; inputJson: string }[] = [];
        let currentToolIndex = -1;
        let textContent = "";

        try {
          const anthropicStream = anthropic.messages.stream(anthropicParams);

          for await (const event of anthropicStream) {
            if (event.type === "message_start") {
              messageId = event.message.id;
              // Send initial chunk
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
                toolUseBlocks.push({
                  id: event.content_block.id,
                  name: event.content_block.name,
                  inputJson: "",
                });
                // Send tool call start chunk
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
                textContent += event.delta.text;
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
                event.delta.stop_reason === "tool_use"
                  ? "tool_calls"
                  : event.delta.stop_reason === "end_turn"
                    ? "stop"
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
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        // Non-stream: use stream().finalMessage() per Anthropic recommendation
        const finalMsg = await anthropic.messages.stream(anthropicParams).finalMessage();
        const openAIResponse = convertAnthropicToOpenAI(finalMsg, model);
        res.json(openAIResponse);
      }
    } else {
      res.status(400).json({ error: { message: `Unsupported model: ${model}`, type: "invalid_request_error" } });
    }
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    req.log.error({ err }, "Proxy error in chat/completions");
    res.status(error.status ?? 500).json({ error: { message: error.message ?? "Internal server error", type: "api_error" } });
  }
});

// ─── POST /v1/messages (Anthropic native API) ─────────────────────────────────

router.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Anthropic.MessageCreateParams;
  const { model, stream } = body;

  if (!model) {
    res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: "model is required" } });
    return;
  }

  try {
    if (isAnthropicModel(model)) {
      const anthropic = getAnthropicClient();

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          res.write(": keepalive\n\n");
          (res as any).flush?.();
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          const anthropicStream = anthropic.messages.stream(body as Anthropic.MessageCreateParamsNonStreaming);
          for await (const event of anthropicStream) {
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            (res as any).flush?.();
          }
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const finalMsg = await anthropic.messages.stream(body as Anthropic.MessageCreateParamsNonStreaming).finalMessage();
        res.json(finalMsg);
      }
    } else if (isOpenAIModel(model)) {
      // Convert Anthropic-format request → OpenAI, then convert response back
      const openai = getOpenAIClient();

      // Convert messages from Anthropic format to OpenAI format
      const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [];

      if (body.system) {
        openAIMessages.push({
          role: "system",
          content: typeof body.system === "string" ? body.system : body.system.map((b) => (b as { text: string }).text ?? "").join(""),
        });
      }

      for (const msg of body.messages) {
        if (msg.role === "user") {
          if (typeof msg.content === "string") {
            openAIMessages.push({ role: "user", content: msg.content });
          } else {
            const content = msg.content as Anthropic.ContentBlockParam[];
            // Check for tool_result blocks
            const toolResults = content.filter((b) => b.type === "tool_result");
            const textBlocks = content.filter((b) => b.type === "text");
            for (const tr of toolResults) {
              const trBlock = tr as Anthropic.ToolResultBlockParam;
              openAIMessages.push({
                role: "tool",
                tool_call_id: trBlock.tool_use_id,
                content: typeof trBlock.content === "string" ? trBlock.content : JSON.stringify(trBlock.content),
              });
            }
            if (textBlocks.length > 0) {
              openAIMessages.push({
                role: "user",
                content: textBlocks.map((b) => (b as { text: string }).text ?? "").join(""),
              });
            }
          }
        } else if (msg.role === "assistant") {
          const content = typeof msg.content === "string" ? msg.content : null;
          const blocks = Array.isArray(msg.content) ? (msg.content as Anthropic.ContentBlock[]) : [];
          const toolUseBlocks = blocks.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
          const textBlocks = blocks.filter((b) => b.type === "text") as Anthropic.TextBlock[];

          const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
            role: "assistant",
            content: content ?? (textBlocks.map((b) => b.text).join("") || null),
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

      // Convert tools
      let openAITools: OpenAI.ChatCompletionTool[] | undefined;
      if (body.tools && body.tools.length > 0) {
        openAITools = body.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: (t as Anthropic.Tool).input_schema,
          },
        }));
      }

      // Convert tool_choice
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
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          res.write(": keepalive\n\n");
          (res as any).flush?.();
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          const msgId = `msg_${Date.now()}`;
          const now = Math.floor(Date.now() / 1000);
          res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
          res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
          (res as any).flush?.();

          const openAIStream = await openai.chat.completions.create({ ...openAIParams, stream: true });

          let currentToolIndex = -1;
          let toolBlocks: { id: string; name: string }[] = [];
          let inputTokens = 0;
          let outputTokens = 0;
          let textBlockActive = true;

          for await (const chunk of openAIStream) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta.content) {
              if (!textBlockActive) {
                res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: toolBlocks.length, content_block: { type: "text", text: "" } })}\n\n`);
                textBlockActive = true;
              }
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
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const openAIResult = await openai.chat.completions.create({ ...openAIParams, stream: false }) as OpenAI.ChatCompletion;
        // Convert back to Anthropic message format
        const choice = openAIResult.choices[0];
        const content: Anthropic.ContentBlock[] = [];

        if (choice.message.content) {
          content.push({ type: "text", text: choice.message.content });
        }
        if (choice.message.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
            content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
          }
        }

        const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
        const anthropicResponse: Anthropic.Message = {
          id: openAIResult.id,
          type: "message",
          role: "assistant",
          content,
          model,
          stop_reason: stopReason,
          stop_sequence: null,
          usage: {
            input_tokens: openAIResult.usage?.prompt_tokens ?? 0,
            output_tokens: openAIResult.usage?.completion_tokens ?? 0,
          },
        };
        res.json(anthropicResponse);
      }
    } else {
      res.status(400).json({ type: "error", error: { type: "invalid_request_error", message: `Unsupported model: ${model}` } });
    }
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    req.log.error({ err }, "Proxy error in messages");
    res.status(error.status ?? 500).json({ type: "error", error: { type: "api_error", message: error.message ?? "Internal server error" } });
  }
});

export default router;

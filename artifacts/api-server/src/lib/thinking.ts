import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { getModelDefinition, type ProviderId, type ThinkingCapability, type ThinkingCapabilityMode } from "./model-catalog.js";

export type ThinkingRoute = "chat" | "messages" | "responses";
export type ThinkingProvider = ProviderId | "responses";
export type ThinkingEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ThinkingMode = "none" | "auto" | "budget" | "effort";
export type ThinkingDisplay = "summarized" | "omitted";
export type OpenAIReasoningEffort = NonNullable<OpenAI.ChatCompletionCreateParams["reasoning_effort"]>;

export interface ThinkingDirective {
  mode: ThinkingMode;
  effort?: ThinkingEffort;
  budget?: number;
  display?: ThinkingDisplay;
  summary?: "auto" | "concise" | "detailed";
  source: string;
}

export interface ParsedThinkingModel {
  rawModel: string;
  baseModel: string;
  rawSuffix?: string;
  hasSuffix: boolean;
  config?: ThinkingDirective;
}

export interface ThinkingResolution {
  requestedModel: string;
  model: string;
  targetProvider: ThinkingProvider;
  capability?: ThinkingCapability;
  source?: string;
  config?: ThinkingDirective;
  stripped: boolean;
  reason?: string;
  hadRequestConfig: boolean;
  suffixApplied: boolean;
}

export interface ThinkingLogMeta {
  thinkingSource?: string;
  thinkingAppliedFor?: ThinkingProvider;
  thinkingStripped?: boolean;
  thinkingReason?: string;
}

const LEVEL_TO_BUDGET: Record<ThinkingEffort | "auto", number> = {
  none: 0,
  auto: -1,
  minimal: 512,
  low: 1024,
  medium: 8192,
  high: 24576,
  xhigh: 32768,
  max: 128000,
};

const GEMINI_3_PREFIXES = ["gemini-3", "gemini-3."];
const ANTHROPIC_EFFORTS = new Set<ThinkingEffort>(["low", "medium", "high", "max"]);
const OPENAI_EFFORTS = new Set<ThinkingEffort>(["none", "minimal", "low", "medium", "high", "xhigh"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asDisplay(value: unknown): ThinkingDisplay | undefined {
  return value === "summarized" || value === "omitted" ? value : undefined;
}

function asThinkingEffort(value: unknown): ThinkingEffort | undefined {
  if (typeof value !== "string") return undefined;
  const effort = value.trim().toLowerCase();
  if (["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(effort)) {
    return effort as ThinkingEffort;
  }
  return undefined;
}

function convertBudgetToEffort(budget: number): ThinkingEffort | undefined {
  if (budget < -1) return undefined;
  if (budget === -1) return "high";
  if (budget === 0) return "none";
  if (budget <= 512) return "minimal";
  if (budget <= 1024) return "low";
  if (budget <= 8192) return "medium";
  if (budget <= 24576) return "high";
  return "xhigh";
}

function convertEffortToBudget(effort: ThinkingEffort | "auto"): number {
  return LEVEL_TO_BUDGET[effort];
}

function mapToClaudeEffort(effort: ThinkingEffort | undefined, supportsMax = false): Anthropic.OutputConfig["effort"] | undefined {
  if (!effort) return undefined;
  switch (effort) {
    case "minimal":
      return "low";
    case "low":
    case "medium":
    case "high":
      return effort;
    case "xhigh":
    case "max":
      return supportsMax ? "max" : "high";
    default:
      return undefined;
  }
}

function mapToOpenAIEffort(effort: ThinkingEffort | undefined): OpenAIReasoningEffort | undefined {
  if (!effort) return undefined;
  if (effort === "max") return "xhigh";
  if (OPENAI_EFFORTS.has(effort)) {
    return effort as OpenAIReasoningEffort;
  }
  return undefined;
}

function mapToGeminiLevel(effort: ThinkingEffort | undefined): "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | undefined {
  switch (effort) {
    case "minimal":
      return "MINIMAL";
    case "low":
      return "LOW";
    case "medium":
      return "MEDIUM";
    case "high":
    case "xhigh":
    case "max":
      return "HIGH";
    default:
      return undefined;
  }
}

export function parseThinkingModel(model: string): ParsedThinkingModel {
  const lastOpen = model.lastIndexOf("(");
  if (lastOpen === -1 || !model.endsWith(")")) {
    return { rawModel: model, baseModel: model, hasSuffix: false };
  }

  const baseModel = model.slice(0, lastOpen);
  const rawSuffix = model.slice(lastOpen + 1, -1).trim();
  return {
    rawModel: model,
    baseModel,
    rawSuffix,
    hasSuffix: true,
    config: parseThinkingSuffix(rawSuffix, "suffix"),
  };
}

export function stripThinkingModelSuffix(model: string): string {
  return parseThinkingModel(model).baseModel;
}

function parseThinkingSuffix(rawSuffix: string, source: string): ThinkingDirective | undefined {
  if (!rawSuffix) return undefined;
  const normalized = rawSuffix.toLowerCase();
  if (normalized === "none") return { mode: "none", effort: "none", source };
  if (normalized === "auto" || normalized === "-1") return { mode: "auto", source };
  const effort = asThinkingEffort(normalized);
  if (effort) return effort === "none" ? { mode: "none", effort, source } : { mode: "effort", effort, source };
  const budget = Number.parseInt(rawSuffix, 10);
  if (Number.isFinite(budget) && String(budget) === rawSuffix && budget >= 0) {
    return budget === 0 ? { mode: "none", effort: "none", source } : { mode: "budget", budget, source };
  }
  return undefined;
}

function extractAnthropicThinking(body: Record<string, unknown>): ThinkingDirective | undefined {
  const thinking = isRecord(body.thinking) ? body.thinking : undefined;
  const outputConfig = isRecord(body.output_config) ? body.output_config : undefined;
  const effortFromOutputConfig = asThinkingEffort(outputConfig?.effort);

  if (thinking) {
    const display = asDisplay(thinking.display);
    if (thinking.type === "disabled") {
      return { mode: "none", effort: "none", display, source: "messages.thinking.type" };
    }
    if (thinking.type === "adaptive") {
      if (effortFromOutputConfig && ANTHROPIC_EFFORTS.has(effortFromOutputConfig)) {
        return { mode: "effort", effort: effortFromOutputConfig, display, source: "messages.output_config.effort" };
      }
      return { mode: "auto", display, source: "messages.thinking.type" };
    }
    if (thinking.type === "enabled") {
      const budget = asNumber(thinking.budget_tokens);
      if (budget !== undefined) {
        return { mode: budget === 0 ? "none" : "budget", budget, display, source: "messages.thinking.budget_tokens" };
      }
    }
  }

  if (effortFromOutputConfig && ANTHROPIC_EFFORTS.has(effortFromOutputConfig)) {
    return { mode: "effort", effort: effortFromOutputConfig, source: "messages.output_config.effort" };
  }

  return undefined;
}

function extractGeminiThinking(body: Record<string, unknown>): ThinkingDirective | undefined {
  const generationConfig = isRecord(body.generationConfig) ? body.generationConfig : undefined;
  const thinkingConfig = generationConfig && isRecord(generationConfig.thinkingConfig)
    ? generationConfig.thinkingConfig
    : undefined;

  if (!thinkingConfig) return undefined;

  const level = asString(thinkingConfig.thinkingLevel)?.toLowerCase();
  const budget = asNumber(thinkingConfig.thinkingBudget);
  const includeThoughts = typeof thinkingConfig.includeThoughts === "boolean" ? thinkingConfig.includeThoughts : undefined;

  if (level) {
    const effort = asThinkingEffort(level);
    if (effort) {
      return effort === "none"
        ? { mode: "none", effort, source: "generationConfig.thinkingConfig.thinkingLevel" }
        : { mode: "effort", effort, source: "generationConfig.thinkingConfig.thinkingLevel" };
    }
  }

  if (budget !== undefined) {
    if (budget === -1) return { mode: "auto", source: "generationConfig.thinkingConfig.thinkingBudget" };
    return budget === 0
      ? { mode: "none", effort: "none", source: "generationConfig.thinkingConfig.thinkingBudget" }
      : { mode: "budget", budget, source: "generationConfig.thinkingConfig.thinkingBudget" };
  }

  if (includeThoughts) {
    return { mode: "auto", source: "generationConfig.thinkingConfig.includeThoughts" };
  }

  return undefined;
}

function extractOpenAIChatThinking(body: Record<string, unknown>): ThinkingDirective | undefined {
  const reasoningEffort = asThinkingEffort(body.reasoning_effort);
  if (!reasoningEffort) return undefined;
  return reasoningEffort === "none"
    ? { mode: "none", effort: reasoningEffort, source: "chat.reasoning_effort" }
    : { mode: "effort", effort: reasoningEffort, source: "chat.reasoning_effort" };
}

function extractResponsesThinking(body: Record<string, unknown>): ThinkingDirective | undefined {
  const reasoning = isRecord(body.reasoning) ? body.reasoning : undefined;
  const effort = asThinkingEffort(reasoning?.effort);
  if (!effort) return undefined;
  const summary = reasoning?.summary === "auto" || reasoning?.summary === "concise" || reasoning?.summary === "detailed"
    ? reasoning.summary
    : undefined;
  return effort === "none"
    ? { mode: "none", effort, summary, source: "responses.reasoning.effort" }
    : { mode: "effort", effort, summary, source: "responses.reasoning.effort" };
}

export function extractThinkingDirective(route: ThinkingRoute, body: Record<string, unknown>): ThinkingDirective | undefined {
  const extractors: Record<ThinkingRoute, Array<(value: Record<string, unknown>) => ThinkingDirective | undefined>> = {
    chat: [extractOpenAIChatThinking, extractResponsesThinking, extractAnthropicThinking, extractGeminiThinking],
    messages: [extractAnthropicThinking, extractOpenAIChatThinking, extractResponsesThinking, extractGeminiThinking],
    responses: [extractResponsesThinking, extractOpenAIChatThinking, extractAnthropicThinking, extractGeminiThinking],
  };

  for (const extractor of extractors[route]) {
    const result = extractor(body);
    if (result) return result;
  }
  return undefined;
}

export function resolveThinkingRequest(args: {
  model: string;
  body: Record<string, unknown>;
  route: ThinkingRoute;
  targetProvider: ThinkingProvider;
}): ThinkingResolution {
  const parsedModel = parseThinkingModel(args.model);
  const capability = getModelDefinition(parsedModel.baseModel)?.thinking;
  const bodyConfig = extractThinkingDirective(args.route, args.body);
  const config = parsedModel.config ?? bodyConfig;

  if (!config) {
    return {
      requestedModel: args.model,
      model: parsedModel.baseModel,
      targetProvider: args.targetProvider,
      capability,
      stripped: false,
      hadRequestConfig: false,
      suffixApplied: Boolean(parsedModel.config),
    };
  }

  if (!capability?.supported) {
    return {
      requestedModel: args.model,
      model: parsedModel.baseModel,
      targetProvider: args.targetProvider,
      capability,
      source: config.source,
      config,
      stripped: true,
      reason: "model_does_not_support_thinking",
      hadRequestConfig: true,
      suffixApplied: Boolean(parsedModel.config),
    };
  }

  return {
    requestedModel: args.model,
    model: parsedModel.baseModel,
    targetProvider: args.targetProvider,
    capability,
    source: config.source,
    config,
    stripped: false,
    hadRequestConfig: true,
    suffixApplied: Boolean(parsedModel.config),
  };
}

export function buildThinkingLogMeta(resolution: ThinkingResolution): ThinkingLogMeta {
  if (!resolution.hadRequestConfig) return {};
  return {
    thinkingSource: resolution.source,
    thinkingAppliedFor: resolution.targetProvider,
    thinkingStripped: resolution.stripped || undefined,
    thinkingReason: resolution.reason,
  };
}

export function buildOpenAIReasoningEffort(resolution: ThinkingResolution): OpenAIReasoningEffort | undefined {
  const config = resolution.config;
  if (!config || resolution.stripped) return undefined;
  if (config.mode === "auto") return undefined;
  if (config.mode === "budget") return mapToOpenAIEffort(convertBudgetToEffort(config.budget ?? 0));
  return mapToOpenAIEffort(config.effort);
}

export function buildResponsesReasoning(resolution: ThinkingResolution, existingReasoning: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!resolution.hadRequestConfig) return existingReasoning;
  const nextReasoning = { ...(existingReasoning ?? {}) };

  if (resolution.stripped) {
    delete nextReasoning.effort;
    return Object.keys(nextReasoning).length > 0 ? nextReasoning : undefined;
  }

  const config = resolution.config;
  if (!config) return existingReasoning;

  if (config.mode === "auto") {
    delete nextReasoning.effort;
  } else if (config.mode === "budget") {
    const effort = mapToOpenAIEffort(convertBudgetToEffort(config.budget ?? 0));
    if (effort) nextReasoning.effort = effort;
  } else {
    const effort = mapToOpenAIEffort(config.effort);
    if (effort) nextReasoning.effort = effort;
  }

  if (config.summary) nextReasoning.summary = config.summary;
  return Object.keys(nextReasoning).length > 0 ? nextReasoning : undefined;
}

export function buildAnthropicThinkingPayload(args: {
  resolution: ThinkingResolution;
  maxTokens: number;
  existingOutputConfig?: Anthropic.MessageCreateParamsNonStreaming["output_config"] | null;
}): {
  thinking?: Anthropic.MessageCreateParamsNonStreaming["thinking"];
  outputConfig?: Anthropic.MessageCreateParamsNonStreaming["output_config"];
} {
  const { resolution, maxTokens } = args;
  const existingOutputConfig = args.existingOutputConfig ?? undefined;

  if (!resolution.hadRequestConfig) {
    return existingOutputConfig ? { outputConfig: existingOutputConfig } : {};
  }

  const nextOutputConfig = isRecord(existingOutputConfig) ? { ...existingOutputConfig } : undefined;
  delete nextOutputConfig?.effort;

  if (resolution.stripped || !resolution.config) {
    return nextOutputConfig && Object.keys(nextOutputConfig).length > 0 ? { outputConfig: nextOutputConfig as Anthropic.OutputConfig } : {};
  }

  const config = resolution.config;
  const display = config.display;

  if (config.mode === "none") {
    return {
      thinking: { type: "disabled" },
      outputConfig: nextOutputConfig && Object.keys(nextOutputConfig).length > 0 ? nextOutputConfig as Anthropic.OutputConfig : undefined,
    };
  }

  if (config.mode === "auto") {
    return {
      thinking: display ? { type: "adaptive", display } : { type: "adaptive" },
      outputConfig: nextOutputConfig && Object.keys(nextOutputConfig).length > 0 ? nextOutputConfig as Anthropic.OutputConfig : undefined,
    };
  }

  if (config.mode === "effort") {
    const effort = mapToClaudeEffort(config.effort, resolution.capability?.supportsMax);
    if (effort) {
      const outputConfig: Anthropic.OutputConfig = { ...(nextOutputConfig ?? {}), effort };
      return {
        thinking: display ? { type: "adaptive", display } : { type: "adaptive" },
        outputConfig,
      };
    }
  }

  const requestedBudget = config.mode === "budget"
    ? (config.budget ?? 0)
    : convertEffortToBudget(config.effort ?? "high");
  const upperBound = Math.max(1024, maxTokens - 1);
  const budgetTokens = Math.max(1024, Math.min(requestedBudget, upperBound));

  return {
    thinking: display
      ? { type: "enabled", budget_tokens: budgetTokens, display }
      : { type: "enabled", budget_tokens: budgetTokens },
    outputConfig: nextOutputConfig && Object.keys(nextOutputConfig).length > 0 ? nextOutputConfig as Anthropic.OutputConfig : undefined,
  };
}

export function buildGeminiThinkingConfig(resolution: ThinkingResolution): Record<string, unknown> | undefined {
  if (!resolution.hadRequestConfig) return undefined;
  if (resolution.stripped || !resolution.config) return undefined;

  const config = resolution.config;
  const isGemini3 = GEMINI_3_PREFIXES.some((prefix) => resolution.model.startsWith(prefix));

  if (config.mode === "none") {
    return { includeThoughts: false, thinkingBudget: 0 };
  }

  if (config.mode === "auto") {
    return { includeThoughts: true, thinkingBudget: -1 };
  }

  if (config.mode === "budget") {
    return { includeThoughts: true, thinkingBudget: config.budget ?? -1 };
  }

  if (isGemini3) {
    const thinkingLevel = mapToGeminiLevel(config.effort);
    if (thinkingLevel) {
      return { includeThoughts: true, thinkingLevel };
    }
  }

  return { includeThoughts: true, thinkingBudget: convertEffortToBudget(config.effort ?? "high") };
}

export function stripAllKnownThinkingFields<T>(value: T): T {
  if (!isRecord(value)) return value;
  const cloned = deepClone(value) as Record<string, unknown>;
  delete cloned.reasoning_effort;
  delete cloned.thinking;

  if (isRecord(cloned.reasoning)) {
    const reasoning = { ...cloned.reasoning };
    delete reasoning.effort;
    cloned.reasoning = reasoning;
    if (Object.keys(reasoning).length === 0) delete cloned.reasoning;
  }

  if (isRecord(cloned.output_config)) {
    const outputConfig = { ...cloned.output_config };
    delete outputConfig.effort;
    cloned.output_config = outputConfig;
    if (Object.keys(outputConfig).length === 0) delete cloned.output_config;
  }

  if (isRecord(cloned.generationConfig)) {
    const generationConfig = { ...cloned.generationConfig };
    delete generationConfig.thinkingConfig;
    cloned.generationConfig = generationConfig;
    if (Object.keys(generationConfig).length === 0) delete cloned.generationConfig;
  }

  return cloned as T;
}

export function collectReasoningTexts(value: unknown): string[] {
  if (typeof value === "string") {
    return value ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectReasoningTexts(item));
  }
  if (isRecord(value)) {
    const texts: string[] = [];
    if (typeof value.text === "string" && value.text) texts.push(value.text);
    if (typeof value.thinking === "string" && value.thinking) texts.push(value.thinking);
    if (Array.isArray(value.summary)) {
      texts.push(...collectReasoningTexts(value.summary));
    }
    if (Array.isArray(value.content)) {
      texts.push(...collectReasoningTexts(value.content));
    }
    return texts;
  }
  return [];
}

export function joinReasoningTexts(texts: string[]): string | undefined {
  const normalized = texts.map((text) => text.trim()).filter(Boolean);
  if (normalized.length === 0) return undefined;
  return normalized.join("\n\n");
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getThinkingCapabilityMode(model: string): ThinkingCapabilityMode | undefined {
  return getModelDefinition(model)?.thinking.mode;
}

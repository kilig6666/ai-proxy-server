export type SamplingProvider = "openai" | "anthropic" | "gemini";

export interface SamplingInput {
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface SamplingAdjustment {
  field: "temperature" | "top_p" | "frequency_penalty" | "presence_penalty";
  action: "dropped";
  reason: string;
}

export interface NormalizedSampling {
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  adjustments: SamplingAdjustment[];
}

export function normalizeSamplingParams(provider: SamplingProvider, input: SamplingInput): NormalizedSampling {
  const normalized: NormalizedSampling = {
    temperature: input.temperature,
    topP: input.topP,
    frequencyPenalty: input.frequencyPenalty,
    presencePenalty: input.presencePenalty,
    adjustments: [],
  };

  if (provider === "anthropic") {
    if (normalized.temperature !== undefined && normalized.topP !== undefined) {
      normalized.adjustments.push({
        field: "top_p",
        action: "dropped",
        reason: "anthropic_conflict_with_temperature",
      });
      normalized.topP = undefined;
    }

    if (normalized.frequencyPenalty !== undefined) {
      normalized.adjustments.push({
        field: "frequency_penalty",
        action: "dropped",
        reason: "unsupported_by_anthropic",
      });
      normalized.frequencyPenalty = undefined;
    }

    if (normalized.presencePenalty !== undefined) {
      normalized.adjustments.push({
        field: "presence_penalty",
        action: "dropped",
        reason: "unsupported_by_anthropic",
      });
      normalized.presencePenalty = undefined;
    }
  }

  if (provider === "gemini") {
    if (normalized.frequencyPenalty !== undefined) {
      normalized.adjustments.push({
        field: "frequency_penalty",
        action: "dropped",
        reason: "unsupported_by_gemini",
      });
      normalized.frequencyPenalty = undefined;
    }

    if (normalized.presencePenalty !== undefined) {
      normalized.adjustments.push({
        field: "presence_penalty",
        action: "dropped",
        reason: "unsupported_by_gemini",
      });
      normalized.presencePenalty = undefined;
    }
  }

  return normalized;
}

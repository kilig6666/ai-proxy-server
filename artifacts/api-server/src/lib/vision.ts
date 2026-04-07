import type OpenAI from "openai";

export type VisionRoute = "chat" | "messages" | "responses";
export type VisionInputKind = "remote_url" | "data_url" | "anthropic_base64";

export type VisionDetail = "low" | "high" | "auto" | "original";

export type VisionImageInput = {
  kind: VisionInputKind;
  mimeType?: string;
  base64Data?: string;
  url?: string;
  detail?: VisionDetail;
};

export type GeminiVisionPart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
  mediaResolution?: {
    level: string;
  };
};

export type VisionConversionEvent =
  | {
      type: "fetched_remote_image";
      url: string;
      mimeType: string;
      sizeBytes: number;
    }
  | {
      type: "fetch_remote_image_failed";
      url: string;
      reason: string;
    };

export class VisionRequestError extends Error {
  readonly status: number;
  readonly code: "invalid_request_error";

  constructor(message: string, status = 400) {
    super(message);
    this.name = "VisionRequestError";
    this.status = status;
    this.code = "invalid_request_error";
  }
}

export { VisionRequestError as VisionInputError };

const VISION_FETCH_TIMEOUT_MS = 15_000;
const VISION_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_IMAGE_MIME = "image/jpeg";
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/tiff",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMimeType(mimeType: string | undefined): string | undefined {
  if (!mimeType) return undefined;
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function parseDataUrl(url: string, detail?: VisionDetail): VisionImageInput | null {
  if (!url.startsWith("data:")) return null;
  const commaIndex = url.indexOf(",");
  if (commaIndex < 0) return null;

  const header = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  const headerParts = header.split(";");
  const mimeType = normalizeMimeType(headerParts[0]) ?? DEFAULT_IMAGE_MIME;
  const isBase64 = headerParts.includes("base64");
  const base64Data = isBase64
    ? payload
    : Buffer.from(decodeURIComponent(payload), "utf8").toString("base64");

  return {
    kind: "data_url",
    mimeType,
    base64Data,
    detail,
  };
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function parseOpenAIImageUrlValue(
  value: unknown,
): { url?: string; detail?: VisionDetail } {
  if (typeof value === "string") return { url: value };
  if (!isPlainObject(value)) return {};

  const url = typeof value.url === "string" ? value.url : undefined;
  const detail = value.detail === "low" || value.detail === "high" || value.detail === "auto" || value.detail === "original"
    ? value.detail
    : undefined;
  return { url, detail };
}

export function openAIContentPartToVisionInput(part: unknown): VisionImageInput | null {
  if (!isPlainObject(part) || part.type !== "image_url") return null;

  const { url, detail } = parseOpenAIImageUrlValue(part.image_url);
  if (!url) return null;

  const dataUrl = parseDataUrl(url, detail);
  if (dataUrl) return dataUrl;
  if (!isHttpUrl(url)) return null;

  return { kind: "remote_url", url, detail };
}

export function responsesInputImageToVisionInput(item: unknown): VisionImageInput | null {
  if (!isPlainObject(item) || item.type !== "input_image") return null;

  const detail = item.detail === "low" || item.detail === "high" || item.detail === "auto" || item.detail === "original"
    ? item.detail
    : undefined;

  if (typeof item.image_url === "string") {
    const dataUrl = parseDataUrl(item.image_url, detail);
    if (dataUrl) return dataUrl;
    if (isHttpUrl(item.image_url)) return { kind: "remote_url", url: item.image_url, detail };
  }

  if (typeof item.file_id === "string" && item.file_id.trim()) {
    return { kind: "remote_url", url: `file_id:${item.file_id.trim()}`, detail };
  }

  return null;
}

export function anthropicContentBlockToVisionInput(block: unknown): VisionImageInput | null {
  if (!isPlainObject(block) || block.type !== "image" || !isPlainObject(block.source)) return null;

  const source = block.source;
  if (source.type === "base64" && typeof source.data === "string") {
    return {
      kind: "anthropic_base64",
      mimeType: normalizeMimeType(typeof source.media_type === "string" ? source.media_type : undefined) ?? DEFAULT_IMAGE_MIME,
      base64Data: source.data,
    };
  }

  if (source.type === "url" && typeof source.url === "string" && isHttpUrl(source.url)) {
    return {
      kind: "remote_url",
      url: source.url,
    };
  }

  return null;
}

function collectChatVisionInputs(messages: unknown): VisionImageInput[] {
  if (!Array.isArray(messages)) return [];

  const images: VisionImageInput[] = [];
  for (const message of messages) {
    if (!isPlainObject(message) || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const image = openAIContentPartToVisionInput(part);
      if (image) images.push(image);
    }
  }
  return images;
}

function collectAnthropicVisionInputs(messages: unknown): VisionImageInput[] {
  if (!Array.isArray(messages)) return [];

  const images: VisionImageInput[] = [];
  for (const message of messages) {
    if (!isPlainObject(message) || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      const image = anthropicContentBlockToVisionInput(block);
      if (image) images.push(image);
    }
  }
  return images;
}

function collectResponsesVisionInputs(input: unknown): VisionImageInput[] {
  const images: VisionImageInput[] = [];

  const visitContentArray = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      const image = responsesInputImageToVisionInput(item);
      if (image) images.push(image);
    }
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      const topLevelImage = responsesInputImageToVisionInput(item);
      if (topLevelImage) {
        images.push(topLevelImage);
        continue;
      }
      if (isPlainObject(item)) {
        visitContentArray(item.content);
      }
    }
    return images;
  }

  if (isPlainObject(input)) {
    const topLevelImage = responsesInputImageToVisionInput(input);
    if (topLevelImage) images.push(topLevelImage);
    visitContentArray(input.content);
  }

  return images;
}

export function collectVisionInputsForRoute(route: VisionRoute, body: Record<string, unknown>): VisionImageInput[] {
  switch (route) {
    case "chat":
      return collectChatVisionInputs(body.messages);
    case "messages":
      return collectAnthropicVisionInputs(body.messages);
    case "responses":
      return collectResponsesVisionInputs(body.input);
    default:
      return [];
  }
}

export function buildVisionLogMeta(inputs: VisionImageInput[]): {
  visionInputCount: number;
  visionInputKinds: VisionInputKind[];
} {
  return {
    visionInputCount: inputs.length,
    visionInputKinds: [...new Set(inputs.map((item) => item.kind))],
  };
}

export function visionInputToOpenAIImageContentPart(
  image: VisionImageInput,
): OpenAI.ChatCompletionContentPartImage {
  const url = image.kind === "remote_url"
    ? image.url ?? ""
    : `data:${image.mimeType ?? DEFAULT_IMAGE_MIME};base64,${image.base64Data ?? ""}`;

  return {
    type: "image_url",
    image_url: {
      url,
      ...(image.detail ? { detail: image.detail === "original" ? "high" : image.detail } : {}),
    },
  };
}

function mapVisionDetailToGeminiResolution(detail: VisionDetail | undefined): GeminiVisionPart["mediaResolution"] | undefined {
  if (detail === "low") return { level: "MEDIA_RESOLUTION_LOW" };
  if (detail === "high" || detail === "original") return { level: "MEDIA_RESOLUTION_HIGH" };
  return undefined;
}

async function fetchRemoteImageAsBase64(
  url: string,
  onEvent?: (event: VisionConversionEvent) => void,
): Promise<{ mimeType: string; base64Data: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const reason = `download failed with status ${response.status}`;
      onEvent?.({ type: "fetch_remote_image_failed", url, reason });
      throw new VisionRequestError(`Failed to download image from "${url}": ${reason}`);
    }

    const rawContentType = response.headers.get("content-type") ?? "";
    const mimeType = normalizeMimeType(rawContentType.split(";")[0]) ?? "";
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      const reason = rawContentType
        ? `unsupported image content-type "${rawContentType}"`
        : "missing image content-type";
      onEvent?.({ type: "fetch_remote_image_failed", url, reason });
      throw new VisionRequestError(`Image URL "${url}" is not a supported public image.`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > VISION_MAX_IMAGE_BYTES) {
        const reason = `image exceeds ${VISION_MAX_IMAGE_BYTES} bytes`;
        onEvent?.({ type: "fetch_remote_image_failed", url, reason });
        throw new VisionRequestError(`Image URL "${url}" exceeds the 10MB limit.`);
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    if (bytes.length > VISION_MAX_IMAGE_BYTES) {
      const reason = `image exceeds ${VISION_MAX_IMAGE_BYTES} bytes`;
      onEvent?.({ type: "fetch_remote_image_failed", url, reason });
      throw new VisionRequestError(`Image URL "${url}" exceeds the 10MB limit.`);
    }

    onEvent?.({ type: "fetched_remote_image", url, mimeType, sizeBytes: bytes.length });
    return {
      mimeType,
      base64Data: bytes.toString("base64"),
    };
  } catch (error) {
    if (error instanceof VisionRequestError) throw error;

    const reason = error instanceof Error && error.name === "AbortError"
      ? `download timed out after ${VISION_FETCH_TIMEOUT_MS}ms`
      : error instanceof Error
        ? error.message
        : "unknown download error";

    onEvent?.({ type: "fetch_remote_image_failed", url, reason });
    throw new VisionRequestError(`Failed to download image from "${url}": ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function visionInputToGeminiInlinePart(
  image: VisionImageInput,
  onEvent?: (event: VisionConversionEvent) => void,
): Promise<GeminiVisionPart> {
  let mimeType = normalizeMimeType(image.mimeType) ?? DEFAULT_IMAGE_MIME;
  let base64Data = image.base64Data;

  if (image.kind === "remote_url") {
    if (!image.url || image.url.startsWith("file_id:")) {
      throw new VisionRequestError("Responses input_image.file_id is not supported for Gemini routing in this proxy.");
    }
    const downloaded = await fetchRemoteImageAsBase64(image.url, onEvent);
    mimeType = downloaded.mimeType;
    base64Data = downloaded.base64Data;
  }

  if (!base64Data) {
    throw new VisionRequestError("Image payload is missing base64 data.");
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new VisionRequestError(`Unsupported image mime type "${mimeType}".`);
  }

  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
    ...(mapVisionDetailToGeminiResolution(image.detail)
      ? { mediaResolution: mapVisionDetailToGeminiResolution(image.detail) }
      : {}),
  };
}

export function summarizeVisionInput(
  route: VisionRoute,
  body: Record<string, unknown>,
): {
  count: number;
  kinds: VisionInputKind[];
} {
  const inputs = collectVisionInputsForRoute(route, body);
  return {
    count: inputs.length,
    kinds: [...new Set(inputs.map((item) => item.kind))],
  };
}

export async function convertOpenAIImagePartToGeminiPart(part: unknown): Promise<GeminiVisionPart> {
  const image = openAIContentPartToVisionInput(part);
  if (!image) {
    throw new VisionRequestError("OpenAI image_url content part is invalid.");
  }
  return visionInputToGeminiInlinePart(image);
}

export function convertAnthropicImageBlockToOpenAIContentPart(
  block: unknown,
): OpenAI.ChatCompletionContentPartImage {
  const image = anthropicContentBlockToVisionInput(block);
  if (!image) {
    throw new VisionRequestError("Anthropic image content block is invalid.");
  }
  return visionInputToOpenAIImageContentPart(image);
}

export async function convertAnthropicImageBlockToGeminiPart(block: unknown): Promise<GeminiVisionPart> {
  const image = anthropicContentBlockToVisionInput(block);
  if (!image) {
    throw new VisionRequestError("Anthropic image content block is invalid.");
  }
  return visionInputToGeminiInlinePart(image);
}

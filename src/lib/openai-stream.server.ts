type JsonMap = Record<string, unknown>;

const asMap = (value: unknown): JsonMap =>
  value != null && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};

const integer = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

function jsonTextLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + jsonTextLength(item), 0);
  if (!value || typeof value !== "object") return 0;
  let total = 0;
  for (const item of Object.values(value as JsonMap)) total += jsonTextLength(item);
  return total;
}

export type StreamUsage = { input: number; output: number };

/** Extracts exact usage when available and a conservative fallback from streamed deltas. */
export class OpenAiStreamMeter {
  private inputTokens = 0;
  private outputTokens = 0;
  private outputCharacters = 0;
  private billablePayload = false;
  private protocolError = "";

  observeData(data: string) {
    const trimmed = data.trim();
    if (!trimmed || trimmed === "[DONE]") return;

    let payload: JsonMap;
    try {
      payload = asMap(JSON.parse(trimmed));
    } catch {
      return;
    }

    const error = asMap(payload["error"]);
    if (Object.keys(error).length > 0 || payload["type"] === "error") {
      this.protocolError = String(error["message"] ?? payload["message"] ?? "stream_error")
        .trim()
        .slice(0, 300);
    }

    const response = asMap(payload["response"]);
    const vendorUsage = asMap(asMap(payload["x_groq"])["usage"]);
    const usageCandidates = [asMap(payload["usage"]), asMap(response["usage"]), vendorUsage];
    for (const usage of usageCandidates) {
      const input = integer(usage["prompt_tokens"] ?? usage["input_tokens"]);
      const output = integer(usage["completion_tokens"] ?? usage["output_tokens"]);
      if (input > 0) this.inputTokens = input;
      if (output > 0) this.outputTokens = output;
      if (input > 0 || output > 0) this.billablePayload = true;
    }

    const choices = Array.isArray(payload["choices"]) ? payload["choices"] : [];
    for (const choiceValue of choices) {
      const choice = asMap(choiceValue);
      const delta = asMap(choice["delta"]);
      const message = asMap(choice["message"]);
      const measured =
        jsonTextLength(delta["content"]) +
        jsonTextLength(delta["reasoning_content"] ?? delta["reasoning"]) +
        jsonTextLength(delta["tool_calls"]) +
        jsonTextLength(message["content"]) +
        jsonTextLength(message["reasoning_content"] ?? message["reasoning"]) +
        jsonTextLength(message["tool_calls"]);
      this.outputCharacters += measured;
      if (measured > 0 || Object.keys(delta).length > 0 || Object.keys(message).length > 0) {
        this.billablePayload = true;
      }
    }

    const directText = jsonTextLength(payload["text"] ?? payload["content"]);
    this.outputCharacters += directText;
    if (directText > 0) this.billablePayload = true;
  }

  usage(inputEstimate: number): StreamUsage {
    return {
      input: Math.max(1, this.inputTokens || Math.trunc(inputEstimate)),
      output: Math.max(1, this.outputTokens || Math.ceil(this.outputCharacters / 4)),
    };
  }

  hasBillablePayload() {
    return this.billablePayload;
  }

  errorMessage() {
    return this.protocolError;
  }
}

export type SseEvent = {
  event: string;
  data: string;
  rawLines: string[];
};

/** Incremental SSE decoder that tolerates arbitrary network chunk boundaries. */
export class SseEventDecoder {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];
  private rawLines: string[] = [];

  push(text: string): SseEvent[] {
    this.buffer += text;
    const events: SseEvent[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const event = this.consumeLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  finish(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer.length > 0) {
      let line = this.buffer;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.buffer = "";
      const event = this.consumeLine(line);
      if (event) events.push(event);
    }
    const pending = this.dispatch();
    if (pending) events.push(pending);
    return events;
  }

  private consumeLine(line: string): SseEvent | null {
    if (line === "") return this.dispatch();
    this.rawLines.push(line);
    if (line.startsWith(":")) return null;
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    let value = separator >= 0 ? line.slice(separator + 1) : "";
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.eventName = value;
    else if (field === "data") this.dataLines.push(value);
    return null;
  }

  private dispatch(): SseEvent | null {
    if (this.rawLines.length === 0) return null;
    const event = {
      event: this.eventName,
      data: this.dataLines.join("\n"),
      rawLines: [...this.rawLines],
    };
    this.eventName = "";
    this.dataLines = [];
    this.rawLines = [];
    return event;
  }
}

export function billingEnvelope(
  requestId: string,
  usage: StreamUsage,
  wallet: unknown,
  pending = false,
) {
  return {
    id: `axion-billing-${requestId}`,
    object: "chat.completion.chunk",
    choices: [],
    usage: {
      prompt_tokens: usage.input,
      completion_tokens: usage.output,
      total_tokens: usage.input + usage.output,
    },
    axion_wallet: wallet,
    axion_request_id: requestId,
    ...(pending ? { axion_billing_pending: true } : {}),
  };
}

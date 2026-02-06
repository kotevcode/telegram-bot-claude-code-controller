import type {
  ClaudeEvent,
  SystemInit,
  AssistantMessage,
  ResultMessage,
  ContentBlock,
} from "../types.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly rawLine: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export function parseLine(line: string): ClaudeEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ParseError(`Invalid JSON: ${trimmed.substring(0, 100)}`, trimmed);
  }

  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    throw new ParseError("Missing 'type' field", trimmed);
  }

  const obj = parsed as Record<string, unknown>;

  switch (obj.type) {
    case "system":
      return parseSystemInit(obj, trimmed);
    case "assistant":
      return parseAssistantMessage(obj, trimmed);
    case "result":
      return parseResultMessage(obj, trimmed);
    default:
      // Unknown event types are silently ignored to be forward-compatible
      return null;
  }
}

function parseSystemInit(
  obj: Record<string, unknown>,
  raw: string,
): SystemInit {
  if (obj.subtype !== "init") {
    throw new ParseError(`Unknown system subtype: ${obj.subtype}`, raw);
  }

  return {
    type: "system",
    subtype: "init",
    session_id: String(obj.session_id ?? ""),
    tools: Array.isArray(obj.tools) ? obj.tools.map(String) : [],
    model: String(obj.model ?? ""),
    cwd: String(obj.cwd ?? ""),
  };
}

function parseAssistantMessage(
  obj: Record<string, unknown>,
  raw: string,
): AssistantMessage {
  const message = obj.message as Record<string, unknown> | undefined;
  if (!message || typeof message !== "object") {
    throw new ParseError("Missing 'message' field in assistant event", raw);
  }

  const content = Array.isArray(message.content)
    ? (message.content as ContentBlock[])
    : [];

  return {
    type: "assistant",
    message: {
      id: String(message.id ?? ""),
      role: "assistant",
      model: String(message.model ?? ""),
      content,
      stop_reason:
        message.stop_reason != null ? String(message.stop_reason) : null,
    },
    session_id: String(obj.session_id ?? ""),
  };
}

function parseResultMessage(
  obj: Record<string, unknown>,
  _raw: string,
): ResultMessage {
  const subtype = obj.subtype === "error" ? "error" : "success";

  return {
    type: "result",
    subtype,
    session_id: String(obj.session_id ?? ""),
    cost_usd: Number(obj.cost_usd ?? 0),
    duration_ms: Number(obj.duration_ms ?? 0),
    duration_api_ms: Number(obj.duration_api_ms ?? 0),
    is_error: Boolean(obj.is_error),
    num_turns: Number(obj.num_turns ?? 0),
    result: obj.result != null ? String(obj.result) : undefined,
    error: obj.error != null ? String(obj.error) : undefined,
  };
}

export function extractTextContent(message: AssistantMessage): string {
  return message.message.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("");
}

export function detectAttentionNeeded(message: AssistantMessage): boolean {
  return message.message.content.some(
    (block) =>
      block.type === "tool_use" && block.tool_name === "AskUserQuestion",
  );
}

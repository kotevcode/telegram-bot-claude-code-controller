import {
  parseLine,
  extractTextContent,
  detectAttentionNeeded,
  ParseError,
} from "../../src/claude/stream-parser.js";
import type { AssistantMessage } from "../../src/types.js";

describe("parseLine", () => {
  it("returns null for empty string", () => {
    expect(parseLine("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseLine("   \t  ")).toBeNull();
  });

  it("parses SystemInit event correctly", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "abc123",
      tools: ["Read", "Write"],
      model: "claude-sonnet-4-5-20250929",
      cwd: "/test",
    });

    const result = parseLine(line);

    expect(result).toEqual({
      type: "system",
      subtype: "init",
      session_id: "abc123",
      tools: ["Read", "Write"],
      model: "claude-sonnet-4-5-20250929",
      cwd: "/test",
    });
  });

  it("parses AssistantMessage event correctly", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [{ type: "text", text: "Hello" }],
        stop_reason: "end_turn",
      },
    });

    const result = parseLine(line);

    expect(result).toEqual({
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [{ type: "text", text: "Hello" }],
        stop_reason: "end_turn",
      },
    });
  });

  it("parses ResultMessage event correctly", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "abc123",
      cost_usd: 0.001,
      duration_ms: 1000,
      duration_api_ms: 800,
      is_error: false,
      num_turns: 1,
      result: "done",
    });

    const result = parseLine(line);

    expect(result).toEqual({
      type: "result",
      subtype: "success",
      session_id: "abc123",
      cost_usd: 0.001,
      duration_ms: 1000,
      duration_api_ms: 800,
      is_error: false,
      num_turns: 1,
      result: "done",
    });
  });

  it("returns null for unknown event types (forward-compatible)", () => {
    const line = JSON.stringify({ type: "unknown_future_type", data: "whatever" });

    expect(parseLine(line)).toBeNull();
  });

  it("throws ParseError for invalid JSON", () => {
    expect(() => parseLine("not-json{")).toThrow(ParseError);

    try {
      parseLine("not-json{");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).rawLine).toBe("not-json{");
    }
  });

  it("throws ParseError for missing type field", () => {
    const line = JSON.stringify({ subtype: "init", session_id: "abc" });

    expect(() => parseLine(line)).toThrow(ParseError);

    try {
      parseLine(line);
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).message).toContain("type");
    }
  });

  it("throws ParseError for unknown system subtype", () => {
    const line = JSON.stringify({ type: "system", subtype: "shutdown" });

    expect(() => parseLine(line)).toThrow(ParseError);

    try {
      parseLine(line);
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).message).toContain("Unknown system subtype");
    }
  });

  it("throws ParseError for assistant event missing message field", () => {
    const line = JSON.stringify({ type: "assistant", session_id: "abc123" });

    expect(() => parseLine(line)).toThrow(ParseError);

    try {
      parseLine(line);
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).message).toContain("message");
    }
  });
});

describe("extractTextContent", () => {
  it("extracts text from text blocks and joins multiple", () => {
    const message: AssistantMessage = {
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
        stop_reason: "end_turn",
      },
    };

    expect(extractTextContent(message)).toBe("Hello world");
  });

  it("returns empty string for no text blocks", () => {
    const message: AssistantMessage = {
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [
          { type: "tool_use", tool_name: "Read", tool_input: { path: "/test" } },
        ],
        stop_reason: "end_turn",
      },
    };

    expect(extractTextContent(message)).toBe("");
  });
});

describe("detectAttentionNeeded", () => {
  it("returns true when AskUserQuestion tool_use is present", () => {
    const message: AssistantMessage = {
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [
          { type: "text", text: "I have a question." },
          {
            type: "tool_use",
            tool_name: "AskUserQuestion",
            tool_input: { question: "Which file?" },
          },
        ],
        stop_reason: "end_turn",
      },
    };

    expect(detectAttentionNeeded(message)).toBe(true);
  });

  it("returns false when no tool_use blocks are present", () => {
    const message: AssistantMessage = {
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [{ type: "text", text: "All done." }],
        stop_reason: "end_turn",
      },
    };

    expect(detectAttentionNeeded(message)).toBe(false);
  });

  it("returns false for other tool names", () => {
    const message: AssistantMessage = {
      type: "assistant",
      session_id: "abc123",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [
          {
            type: "tool_use",
            tool_name: "Write",
            tool_input: { path: "/test", content: "data" },
          },
        ],
        stop_reason: "end_turn",
      },
    };

    expect(detectAttentionNeeded(message)).toBe(false);
  });
});

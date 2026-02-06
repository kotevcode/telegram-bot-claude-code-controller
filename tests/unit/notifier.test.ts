import { Notifier } from "../../src/notifications/notifier.js";
import { EventEmitter } from "node:events";
import type { AssistantMessage, ResultMessage } from "../../src/types.js";

function createMockBot() {
  return {
    api: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockSession(overrides: Partial<{ chatId: number; projectPath: string; id: string }> = {}) {
  return Object.assign(new EventEmitter(), {
    chatId: overrides.chatId ?? 100,
    projectPath: overrides.projectPath ?? "/test/project",
    id: overrides.id ?? "session-123",
    getClaudeSessionId: () => "claude-session-456",
  });
}

function makeAttentionMessage(): AssistantMessage {
  return {
    type: "assistant",
    session_id: "abc123",
    message: {
      id: "msg_1",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [
        { type: "text", text: "I have a question for you." },
        {
          type: "tool_use",
          tool_name: "AskUserQuestion",
          tool_input: { question: "Which file should I edit?" },
        },
      ],
      stop_reason: "end_turn",
    },
  };
}

function makeSuccessResult(): ResultMessage {
  return {
    type: "result",
    subtype: "success",
    session_id: "abc123",
    cost_usd: 0.005,
    duration_ms: 2000,
    duration_api_ms: 1500,
    is_error: false,
    num_turns: 3,
    result: "Task completed successfully",
  };
}

function makeErrorResult(): ResultMessage {
  return {
    type: "result",
    subtype: "error",
    session_id: "abc123",
    cost_usd: 0.001,
    duration_ms: 500,
    duration_api_ms: 300,
    is_error: true,
    num_turns: 1,
    error: "Something went wrong",
  };
}

describe("Notifier", () => {
  it("sends attention notification when session emits 'attention-needed'", async () => {
    const bot = createMockBot();
    const notifier = new Notifier(bot as any);
    const session = createMockSession();

    notifier.subscribe(session as any);
    session.emit("attention-needed", makeAttentionMessage());

    // Allow promise microtask to settle
    await vi.waitFor(() => {
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    const [chatId, text] = bot.api.sendMessage.mock.calls[0];
    expect(chatId).toBe(100);
    expect(text).toContain("needs your input");
  });

  it("sends completion notification when session emits 'result' (success)", async () => {
    const bot = createMockBot();
    const notifier = new Notifier(bot as any);
    const session = createMockSession();

    notifier.subscribe(session as any);
    session.emit("result", makeSuccessResult());

    await vi.waitFor(() => {
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    const [, text] = bot.api.sendMessage.mock.calls[0];
    expect(text).toContain("Task completed");
  });

  it("sends error notification when session emits 'result' with is_error=true", async () => {
    const bot = createMockBot();
    const notifier = new Notifier(bot as any);
    const session = createMockSession();

    notifier.subscribe(session as any);
    session.emit("result", makeErrorResult());

    await vi.waitFor(() => {
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    const [, text] = bot.api.sendMessage.mock.calls[0];
    expect(text).toContain("Session error");
  });

  it("sends error notification when session emits 'error'", async () => {
    const bot = createMockBot();
    const notifier = new Notifier(bot as any);
    const session = createMockSession();

    notifier.subscribe(session as any);
    session.emit("error", new Error("Process crashed unexpectedly"));

    await vi.waitFor(() => {
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    const [, text] = bot.api.sendMessage.mock.calls[0];
    expect(text).toContain("Session error");
  });

  it("sends ended notification when session emits 'exit'", async () => {
    const bot = createMockBot();
    const notifier = new Notifier(bot as any);
    const session = createMockSession();

    notifier.subscribe(session as any);
    session.emit("exit", 0);

    await vi.waitFor(() => {
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    const [, text] = bot.api.sendMessage.mock.calls[0];
    expect(text).toContain("Session ended");
  });

  it("sends notification to correct chat ID", async () => {
    const bot = createMockBot();
    const notifier = new Notifier(bot as any);
    const session = createMockSession({ chatId: 42 });

    notifier.subscribe(session as any);
    session.emit("exit", 1);

    await vi.waitFor(() => {
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    const [chatId] = bot.api.sendMessage.mock.calls[0];
    expect(chatId).toBe(42);
  });

  it("handles sendMessage failures gracefully (logs error, does not throw)", async () => {
    const bot = createMockBot();
    bot.api.sendMessage.mockRejectedValue(new Error("Telegram API down"));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const notifier = new Notifier(bot as any);
    const session = createMockSession();

    notifier.subscribe(session as any);

    // This should not throw even though sendMessage rejects
    expect(() => session.emit("exit", 1)).not.toThrow();

    // Allow the rejected promise's .catch handler to run
    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send notification"),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});

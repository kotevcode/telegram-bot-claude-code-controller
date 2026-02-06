import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

export interface MockProcess extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
  pid: number;
}

export function createMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess;

  const stdinData: string[] = [];
  proc.stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinData.push(chunk.toString());
      callback();
    },
  });
  (proc.stdin as Writable & { getWrittenData: () => string[] }).getWrittenData =
    () => stdinData;

  proc.stdout = new Readable({
    read() {},
  });

  proc.stderr = new Readable({
    read() {},
  });

  proc.kill = vi.fn(() => {
    proc.emit("exit", 0);
    return true;
  });

  proc.pid = 12345;

  return proc;
}

export function sendSystemInit(
  proc: MockProcess,
  sessionId = "test-session-123",
): void {
  const event = JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    tools: ["Read", "Write", "Bash"],
    model: "claude-sonnet-4-5-20250929",
    cwd: "/test/project",
  });
  proc.stdout.push(event + "\n");
}

export function sendAssistantMessage(
  proc: MockProcess,
  text: string,
  sessionId = "test-session-123",
): void {
  const event = JSON.stringify({
    type: "assistant",
    session_id: sessionId,
    message: {
      id: "msg_123",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    },
  });
  proc.stdout.push(event + "\n");
}

export function sendAskUserQuestion(
  proc: MockProcess,
  question: string,
  sessionId = "test-session-123",
): void {
  const event = JSON.stringify({
    type: "assistant",
    session_id: sessionId,
    message: {
      id: "msg_456",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [
        { type: "text", text: question },
        {
          type: "tool_use",
          tool_name: "AskUserQuestion",
          tool_input: { question },
          tool_use_id: "tool_123",
        },
      ],
      stop_reason: "tool_use",
    },
  });
  proc.stdout.push(event + "\n");
}

export function sendResult(
  proc: MockProcess,
  options: {
    sessionId?: string;
    isError?: boolean;
    result?: string;
    error?: string;
    cost?: number;
  } = {},
): void {
  const event = JSON.stringify({
    type: "result",
    subtype: options.isError ? "error" : "success",
    session_id: options.sessionId ?? "test-session-123",
    cost_usd: options.cost ?? 0.001,
    duration_ms: 1500,
    duration_api_ms: 1200,
    is_error: options.isError ?? false,
    num_turns: 1,
    result: options.result,
    error: options.error,
  });
  proc.stdout.push(event + "\n");
}

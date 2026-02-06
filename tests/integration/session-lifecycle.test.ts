import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockProcess,
  sendSystemInit,
  sendAssistantMessage,
  sendResult,
  sendAskUserQuestion,
  type MockProcess,
} from "../helpers/mock-claude-process.js";

let currentMockProcess: MockProcess;
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => currentMockProcess),
}));

const { SessionManager } = await import(
  "../../src/claude/session-manager.js"
);
const { spawn } = await import("node:child_process");

describe("Session Lifecycle Integration", () => {
  let manager: InstanceType<typeof SessionManager>;

  beforeEach(() => {
    currentMockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(currentMockProcess as unknown as ReturnType<typeof spawn>);
    manager = new SessionManager(
      "claude",
      5,
      "sonnet",
      "dangerously-skip-permissions",
    );
  });

  it("full lifecycle: create → init → send → receive → stop", async () => {
    const session = manager.createSession(100, {
      projectPath: "/test/project",
    });

    expect(session.getStatus()).toBe("ready");
    expect(spawn).toHaveBeenCalled();

    // Simulate system init from Claude
    const initEvents: unknown[] = [];
    session.on("system-init", (e) => initEvents.push(e));

    sendSystemInit(currentMockProcess, "real-session-id");

    // Wait for event processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(initEvents.length).toBe(1);
    expect(session.getClaudeSessionId()).toBe("real-session-id");

    // Send a message
    session.send("What files are in this project?");

    const stdinData = (
      currentMockProcess.stdin as unknown as { getWrittenData: () => string[] }
    ).getWrittenData();
    expect(stdinData.length).toBe(1);
    const sent = JSON.parse(stdinData[0].trim());
    expect(sent.type).toBe("user");
    expect(sent.content).toBe("What files are in this project?");

    // Simulate response
    const responses: string[] = [];
    session.on("response", (text) => responses.push(text));

    sendAssistantMessage(currentMockProcess, "Here are the files...");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(responses.length).toBe(1);
    expect(responses[0]).toBe("Here are the files...");

    // Simulate result
    const results: unknown[] = [];
    session.on("result", (r) => results.push(r));

    sendResult(currentMockProcess, { result: "Task complete" });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(results.length).toBe(1);
    expect(session.getStatus()).toBe("ready");

    // Stop session
    session.stop();
    expect(currentMockProcess.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("attention needed flow: AskUserQuestion triggers event", async () => {
    const session = manager.createSession(100, {
      projectPath: "/test/project",
    });

    const attentionEvents: unknown[] = [];
    session.on("attention-needed", (msg) => attentionEvents.push(msg));

    sendAskUserQuestion(currentMockProcess, "Which file should I edit?");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(attentionEvents.length).toBe(1);
  });

  it("error recovery: process crash emits error and exit", async () => {
    const session = manager.createSession(100, {
      projectPath: "/test/project",
    });

    const errors: Error[] = [];
    const exits: (number | null)[] = [];

    session.on("error", (err) => errors.push(err));
    session.on("exit", (code) => exits.push(code));

    // Simulate process error
    currentMockProcess.emit("error", new Error("Process crashed"));

    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("Process crashed");
    expect(session.getStatus()).toBe("error");

    // Simulate process exit
    currentMockProcess.emit("exit", 1);

    expect(exits.length).toBe(1);
    expect(exits[0]).toBe(1);
    expect(session.getStatus()).toBe("stopped");
  });

  it("multi-session: different chats have different active sessions", () => {
    const session1 = manager.createSession(100, {
      projectPath: "/project-a",
    });
    const session2 = manager.createSession(200, {
      projectPath: "/project-b",
    });

    expect(manager.getActiveSessionForChat(100)?.id).toBe(session1.id);
    expect(manager.getActiveSessionForChat(200)?.id).toBe(session2.id);
    expect(manager.getActiveSessions().length).toBe(2);
  });

  it("resume session passes --resume flag to spawn", () => {
    manager.resumeSession(100, "old-session-id", "/test/project");

    const spawnCall = vi.mocked(spawn).mock.calls.at(-1);
    expect(spawnCall).toBeDefined();
    const args = spawnCall![1] as string[];
    expect(args).toContain("--resume");
    expect(args).toContain("old-session-id");
  });

  it("stopAll cleans up all sessions", () => {
    manager.createSession(100, { projectPath: "/project-a" });

    currentMockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(currentMockProcess as unknown as ReturnType<typeof spawn>);

    manager.createSession(200, { projectPath: "/project-b" });

    expect(manager.getActiveSessions().length).toBe(2);

    manager.stopAll();

    expect(manager.getActiveSessions().length).toBe(0);
    expect(manager.getActiveSessionForChat(100)).toBeUndefined();
    expect(manager.getActiveSessionForChat(200)).toBeUndefined();
  });
});

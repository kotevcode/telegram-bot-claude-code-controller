import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockProcess,
  sendSystemInit,
  sendAssistantMessage,
  sendResult,
  sendAskUserQuestion,
  type MockProcess,
} from "../helpers/mock-claude-process.js";
import type { SessionOptions } from "../../src/types.js";

/**
 * Create a mock process whose kill() does NOT immediately emit "exit".
 * This avoids the problem where the Session.stop() method tries to register
 * an "exit" listener on this.process after kill already nulled it out.
 */
function createNonAutoExitMockProcess(): MockProcess {
  const proc = createMockProcess();
  // Override kill to NOT auto-emit exit, just record the call
  proc.kill = vi.fn(() => true);
  return proc;
}

// Mock spawn before importing Session
let currentMockProcess: MockProcess = createMockProcess();
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => currentMockProcess),
}));

// Import after mocking
const { Session } = await import("../../src/claude/session.js");
const { spawn } = await import("node:child_process");

describe("Session", () => {
  const chatId = 12345;
  const defaultOptions: SessionOptions = {
    projectPath: "/test/project",
    model: "sonnet",
    permissionMode: "dangerously-skip-permissions",
  };
  const cliPath = "/usr/local/bin/claude";

  beforeEach(() => {
    vi.clearAllMocks();
    currentMockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
  });

  describe("start()", () => {
    it("calls spawn with correct CLI arguments", () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      expect(spawn).toHaveBeenCalledWith(
        cliPath,
        expect.arrayContaining([
          "-p",
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
          "--verbose",
          "--dangerously-skip-permissions",
          "--model",
          "sonnet",
        ]),
        expect.objectContaining({
          stdio: ["pipe", "pipe", "pipe"],
          cwd: "/test/project",
        }),
      );
    });

    it("includes --resume flag when resumeSessionId is provided", () => {
      const options: SessionOptions = {
        ...defaultOptions,
        resumeSessionId: "resume-abc-123",
      };
      const session = new Session(chatId, options, cliPath);
      session.start();

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const args = spawnCall[1] as string[];
      expect(args).toContain("--resume");
      const resumeIndex = args.indexOf("--resume");
      expect(args[resumeIndex + 1]).toBe("resume-abc-123");
    });
  });

  describe("send()", () => {
    it("writes JSON to stdin with correct format", () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      session.send("Hello, Claude!");

      const stdinData = (
        currentMockProcess.stdin as any
      ).getWrittenData() as string[];
      expect(stdinData).toHaveLength(1);
      expect(stdinData[0]).toBe(
        JSON.stringify({ type: "user", message: { role: "user", content: "Hello, Claude!" } }) + "\n",
      );
    });

    it("throws when session is not started", () => {
      const session = new Session(chatId, defaultOptions, cliPath);

      expect(() => session.send("Hello")).toThrow("Session is not active");
    });
  });

  describe("events", () => {
    it('emits "system-init" when receiving SystemInit event from stdout', async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const initPromise = new Promise<void>((resolve) => {
        session.on("system-init", (event) => {
          expect(event.type).toBe("system");
          expect(event.session_id).toBe("test-session-123");
          resolve();
        });
      });

      sendSystemInit(currentMockProcess);
      await initPromise;
    });

    it('emits "response" with extracted text when receiving AssistantMessage', async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const responsePromise = new Promise<void>((resolve) => {
        session.on("response", (text, message) => {
          expect(text).toBe("Hello from Claude!");
          expect(message.type).toBe("assistant");
          resolve();
        });
      });

      sendAssistantMessage(currentMockProcess, "Hello from Claude!");
      await responsePromise;
    });

    it('emits "attention-needed" when AssistantMessage contains AskUserQuestion tool_use', async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const attentionPromise = new Promise<void>((resolve) => {
        session.on("attention-needed", (message) => {
          expect(message.type).toBe("assistant");
          expect(message.message.content).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: "tool_use",
                tool_name: "AskUserQuestion",
              }),
            ]),
          );
          resolve();
        });
      });

      sendAskUserQuestion(currentMockProcess, "What should I do?");
      await attentionPromise;
    });

    it('emits "result" when receiving Result event', async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const resultPromise = new Promise<void>((resolve) => {
        session.on("result", (result) => {
          expect(result.type).toBe("result");
          expect(result.subtype).toBe("success");
          expect(result.cost_usd).toBe(0.001);
          resolve();
        });
      });

      sendResult(currentMockProcess, { result: "Task completed" });
      await resultPromise;
    });

    it('emits "exit" when process exits', async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const exitPromise = new Promise<void>((resolve) => {
        session.on("exit", (code) => {
          expect(code).toBe(0);
          resolve();
        });
      });

      currentMockProcess.emit("exit", 0);
      await exitPromise;
    });

    it('emits "error" when process emits error', async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const errorPromise = new Promise<void>((resolve) => {
        session.on("error", (error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBe("spawn ENOENT");
          resolve();
        });
      });

      currentMockProcess.emit("error", new Error("spawn ENOENT"));
      await errorPromise;
    });
  });

  describe("stop()", () => {
    it('calls process.kill("SIGTERM")', () => {
      // Use a mock whose kill() does NOT auto-emit "exit",
      // because the real stop() registers an "exit" listener on the process
      // after calling kill, which fails if kill already triggered exit and
      // the exit handler nulled out this.process.
      const nonAutoExitProcess = createNonAutoExitMockProcess();
      vi.mocked(spawn).mockReturnValue(nonAutoExitProcess as any);

      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      session.stop();

      expect(nonAutoExitProcess.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("getStatus()", () => {
    it("returns correct status through lifecycle", async () => {
      // Use non-auto-exit mock so stop() doesn't crash
      const nonAutoExitProcess = createNonAutoExitMockProcess();
      vi.mocked(spawn).mockReturnValue(nonAutoExitProcess as any);

      const session = new Session(chatId, defaultOptions, cliPath);
      expect(session.getStatus()).toBe("starting");

      session.start();
      expect(session.getStatus()).toBe("ready");

      session.send("Hello");
      expect(session.getStatus()).toBe("busy");

      // Wait for the system-init to set status back to ready
      const readyPromise = new Promise<void>((resolve) => {
        session.on("system-init", () => resolve());
      });
      sendSystemInit(nonAutoExitProcess);
      await readyPromise;
      expect(session.getStatus()).toBe("ready");

      session.stop();
      expect(session.getStatus()).toBe("stopped");
    });
  });

  describe("getInfo()", () => {
    it("returns session info object", () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      const info = session.getInfo();

      expect(info).toEqual(
        expect.objectContaining({
          chatId,
          projectPath: "/test/project",
          model: "sonnet",
          status: "starting",
          isResumed: false,
        }),
      );
      expect(info.sessionId).toBeDefined();
      expect(info.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("getClaudeSessionId()", () => {
    it("returns null before init", () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      expect(session.getClaudeSessionId()).toBeNull();
    });

    it("returns session_id after system-init", async () => {
      const session = new Session(chatId, defaultOptions, cliPath);
      session.start();

      const initPromise = new Promise<void>((resolve) => {
        session.on("system-init", () => resolve());
      });

      sendSystemInit(currentMockProcess, "claude-session-xyz");
      await initPromise;

      expect(session.getClaudeSessionId()).toBe("claude-session-xyz");
    });
  });
});

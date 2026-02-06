import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockProcess,
  type MockProcess,
} from "../helpers/mock-claude-process.js";

/**
 * Create a mock process whose kill() does NOT immediately emit "exit".
 * This avoids the problem where Session.stop() registers an "exit" listener
 * after kill already triggered exit and the exit handler nulled out this.process.
 */
function createNonAutoExitMockProcess(): MockProcess {
  const proc = createMockProcess();
  proc.kill = vi.fn(() => true);
  return proc;
}

let currentMockProcess: MockProcess = createMockProcess();
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => currentMockProcess),
}));

const { SessionManager } = await import("../../src/claude/session-manager.js");
const { spawn } = await import("node:child_process");

describe("SessionManager", () => {
  let manager: InstanceType<typeof SessionManager>;

  beforeEach(() => {
    currentMockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
    manager = new SessionManager(
      "claude",
      5,
      "sonnet",
      "dangerously-skip-permissions",
    );
  });

  describe("createSession()", () => {
    it("creates a new session and sets it as active for the chat", () => {
      const chatId = 100;
      const session = manager.createSession(chatId, {
        projectPath: "/test/project",
      });

      expect(session).toBeDefined();
      expect(session.chatId).toBe(chatId);
      expect(session.projectPath).toBe("/test/project");

      const active = manager.getActiveSessionForChat(chatId);
      expect(active).toBe(session);
    });

    it("throws when max sessions reached", () => {
      // Manager has maxSessions = 5
      for (let i = 0; i < 5; i++) {
        currentMockProcess = createMockProcess();
        vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
        manager.createSession(i, {
          projectPath: `/project/${i}`,
        });
      }

      expect(() =>
        manager.createSession(99, { projectPath: "/extra" }),
      ).toThrow("Maximum sessions reached (5)");
    });
  });

  describe("getActiveSessionForChat()", () => {
    it("returns the active session for a chat", () => {
      const chatId = 200;
      const session = manager.createSession(chatId, {
        projectPath: "/test/project",
      });

      const active = manager.getActiveSessionForChat(chatId);
      expect(active).toBe(session);
    });

    it("returns undefined when no active session", () => {
      const active = manager.getActiveSessionForChat(999);
      expect(active).toBeUndefined();
    });
  });

  describe("switchSession()", () => {
    it("changes the active session for a chat", () => {
      const chatId = 300;

      // Create first session
      manager.createSession(chatId, {
        projectPath: "/project1",
      });

      // Create second session for a different chat so it doesn't replace the first
      currentMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
      const session2 = manager.createSession(chatId + 1, {
        projectPath: "/project2",
      });

      // Switch chatId to session2
      const switched = manager.switchSession(chatId, session2.id);
      expect(switched).toBe(session2);

      const active = manager.getActiveSessionForChat(chatId);
      expect(active).toBe(session2);
    });

    it("throws for non-existent session ID", () => {
      expect(() => manager.switchSession(300, "non-existent-id")).toThrow(
        "Session not found: non-existent-id",
      );
    });
  });

  describe("stopSession()", () => {
    it("stops the session", () => {
      // Use non-auto-exit mock to avoid kill() immediately firing "exit"
      // and nulling this.process before stop() registers its own listener
      currentMockProcess = createNonAutoExitMockProcess();
      vi.mocked(spawn).mockReturnValue(currentMockProcess as any);

      const session = manager.createSession(400, {
        projectPath: "/test/project",
      });

      manager.stopSession(session.id);

      expect(session.getStatus()).toBe("stopped");
    });

    it("throws for non-existent session ID", () => {
      expect(() => manager.stopSession("non-existent-id")).toThrow(
        "Session not found: non-existent-id",
      );
    });
  });

  describe("getActiveSessions()", () => {
    it("returns all active session infos", () => {
      manager.createSession(500, { projectPath: "/project1" });

      currentMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
      manager.createSession(501, { projectPath: "/project2" });

      const sessions = manager.getActiveSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual(
        expect.objectContaining({
          chatId: 500,
          projectPath: "/project1",
        }),
      );
      expect(sessions[1]).toEqual(
        expect.objectContaining({
          chatId: 501,
          projectPath: "/project2",
        }),
      );
    });
  });

  describe("stopAll()", () => {
    it("stops all sessions and clears maps", () => {
      // Use non-auto-exit mocks for sessions that will be stopped
      currentMockProcess = createNonAutoExitMockProcess();
      vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
      manager.createSession(600, { projectPath: "/project1" });

      currentMockProcess = createNonAutoExitMockProcess();
      vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
      manager.createSession(601, { projectPath: "/project2" });

      manager.stopAll();

      expect(manager.getActiveSessions()).toHaveLength(0);
      expect(manager.getActiveSessionForChat(600)).toBeUndefined();
      expect(manager.getActiveSessionForChat(601)).toBeUndefined();
    });
  });

  describe("resumeSession()", () => {
    it("creates a session with resumeSessionId", () => {
      const chatId = 700;
      const session = manager.resumeSession(
        chatId,
        "old-session-abc",
        "/test/project",
      );

      expect(session).toBeDefined();
      expect(session.id).toBe("old-session-abc");
      expect(session.isResumed).toBe(true);
      expect(session.projectPath).toBe("/test/project");

      const active = manager.getActiveSessionForChat(chatId);
      expect(active).toBe(session);
    });
  });

  describe("multiple chats", () => {
    it("can have different active sessions for different chats", () => {
      const session1 = manager.createSession(800, {
        projectPath: "/project1",
      });

      currentMockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(currentMockProcess as any);
      const session2 = manager.createSession(801, {
        projectPath: "/project2",
      });

      expect(manager.getActiveSessionForChat(800)).toBe(session1);
      expect(manager.getActiveSessionForChat(801)).toBe(session2);
      expect(manager.getActiveSessionForChat(800)).not.toBe(
        manager.getActiveSessionForChat(801),
      );
    });
  });
});

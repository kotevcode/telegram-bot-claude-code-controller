import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

const { getRecentSessions, getSessionsForProject } = await import(
  "../../src/claude/history.js"
);
const { readFile, readdir } = await import("node:fs/promises");

describe("getRecentSessions", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(readdir).mockReset();
  });

  it("returns parsed sessions from history.jsonl", async () => {
    const jsonlContent = [
      '{"session_id":"s1","project_path":"/proj1","timestamp":"2025-01-15T10:00:00Z","model":"sonnet"}',
      '{"session_id":"s2","project_path":"/proj2","timestamp":"2025-01-16T10:00:00Z","model":"opus"}',
    ].join("\n");

    vi.mocked(readFile).mockResolvedValue(jsonlContent);

    const sessions = await getRecentSessions();

    expect(sessions).toHaveLength(2);
    // Sorted by most recent first: s2 (Jan 16) before s1 (Jan 15)
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: "s2",
        projectPath: "/proj2",
        model: "opus",
      }),
    );
    expect(sessions[1]).toEqual(
      expect.objectContaining({
        sessionId: "s1",
        projectPath: "/proj1",
        model: "sonnet",
      }),
    );
  });

  it("returns sessions sorted by most recent first", async () => {
    const jsonlContent = [
      '{"session_id":"s1","project_path":"/proj1","timestamp":"2025-01-10T10:00:00Z","model":"sonnet"}',
      '{"session_id":"s2","project_path":"/proj2","timestamp":"2025-01-20T10:00:00Z","model":"opus"}',
      '{"session_id":"s3","project_path":"/proj3","timestamp":"2025-01-15T10:00:00Z","model":"haiku"}',
    ].join("\n");

    vi.mocked(readFile).mockResolvedValue(jsonlContent);

    const sessions = await getRecentSessions();

    expect(sessions).toHaveLength(3);
    expect(sessions[0].sessionId).toBe("s2"); // Jan 20 (most recent)
    expect(sessions[1].sessionId).toBe("s3"); // Jan 15
    expect(sessions[2].sessionId).toBe("s1"); // Jan 10 (oldest)
  });

  it("respects limit parameter", async () => {
    const jsonlContent = [
      '{"session_id":"s1","project_path":"/proj1","timestamp":"2025-01-10T10:00:00Z","model":"sonnet"}',
      '{"session_id":"s2","project_path":"/proj2","timestamp":"2025-01-20T10:00:00Z","model":"opus"}',
      '{"session_id":"s3","project_path":"/proj3","timestamp":"2025-01-15T10:00:00Z","model":"haiku"}',
    ].join("\n");

    vi.mocked(readFile).mockResolvedValue(jsonlContent);

    const sessions = await getRecentSessions(2);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe("s2");
    expect(sessions[1].sessionId).toBe("s3");
  });

  it("skips malformed JSONL lines gracefully", async () => {
    const jsonlContent = [
      '{"session_id":"s1","project_path":"/proj1","timestamp":"2025-01-15T10:00:00Z","model":"sonnet"}',
      "this is not valid json",
      '{"session_id":"s2","project_path":"/proj2","timestamp":"2025-01-16T10:00:00Z","model":"opus"}',
    ].join("\n");

    vi.mocked(readFile).mockResolvedValue(jsonlContent);

    const sessions = await getRecentSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe("s2");
    expect(sessions[1].sessionId).toBe("s1");
  });

  it("returns empty array when file doesn't exist (ENOENT)", async () => {
    const error = new Error("ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    vi.mocked(readFile).mockRejectedValue(error);

    const sessions = await getRecentSessions();

    expect(sessions).toEqual([]);
  });

  it("returns empty array for empty file", async () => {
    vi.mocked(readFile).mockResolvedValue("");

    const sessions = await getRecentSessions();

    expect(sessions).toEqual([]);
  });
});

describe("getSessionsForProject", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(readdir).mockReset();
  });

  it("returns sessions for a project directory", async () => {
    vi.mocked(readdir).mockResolvedValue([
      "session-1.jsonl",
      "session-2.jsonl",
    ] as any);

    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      const path = String(filePath);
      if (path.includes("session-1.jsonl")) {
        return '{"timestamp":"2025-01-15T10:00:00Z","model":"sonnet","summary":"First session"}\n{"type":"user"}';
      }
      if (path.includes("session-2.jsonl")) {
        return '{"timestamp":"2025-01-16T10:00:00Z","model":"opus","summary":"Second session"}\n{"type":"user"}';
      }
      throw new Error("Unexpected file");
    });

    const sessions = await getSessionsForProject("/test/project");

    expect(sessions).toHaveLength(2);
    // Sorted by most recent first
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: "session-2",
        projectPath: "/test/project",
        model: "opus",
        summary: "Second session",
      }),
    );
    expect(sessions[1]).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        projectPath: "/test/project",
        model: "sonnet",
        summary: "First session",
      }),
    );
  });

  it("returns empty array when directory doesn't exist", async () => {
    const error = new Error("ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    vi.mocked(readdir).mockRejectedValue(error);

    const sessions = await getSessionsForProject("/nonexistent/project");

    expect(sessions).toEqual([]);
  });

  it("handles malformed session files gracefully", async () => {
    vi.mocked(readdir).mockResolvedValue([
      "session-good.jsonl",
      "session-bad.jsonl",
    ] as any);

    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      const path = String(filePath);
      if (path.includes("session-good.jsonl")) {
        return '{"timestamp":"2025-01-15T10:00:00Z","model":"sonnet"}';
      }
      if (path.includes("session-bad.jsonl")) {
        return "this is not valid json at all";
      }
      throw new Error("Unexpected file");
    });

    const sessions = await getSessionsForProject("/test/project");

    expect(sessions).toHaveLength(2);

    // The good session should be parsed properly
    const goodSession = sessions.find((s) => s.sessionId === "session-good");
    expect(goodSession).toEqual(
      expect.objectContaining({
        sessionId: "session-good",
        projectPath: "/test/project",
        model: "sonnet",
      }),
    );

    // The bad session should still appear with minimal info
    const badSession = sessions.find((s) => s.sessionId === "session-bad");
    expect(badSession).toEqual(
      expect.objectContaining({
        sessionId: "session-bad",
        projectPath: "/test/project",
        model: "unknown",
      }),
    );
  });
});

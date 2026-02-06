import type { SessionOptions, SessionInfo } from "../types.js";
import { Session } from "./session.js";

export class SessionManager {
  private sessions = new Map<string, Session>();
  private activeSessions = new Map<number, string>(); // chatId -> sessionId

  constructor(
    private readonly cliPath: string,
    private readonly maxSessions: number,
    private readonly defaultModel: string,
    private readonly defaultPermissionMode: string,
  ) {}

  createSession(chatId: number, options: SessionOptions): Session {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum sessions reached (${this.maxSessions}). Stop a session first.`,
      );
    }

    const sessionOptions: SessionOptions = {
      ...options,
      model: options.model || this.defaultModel,
      permissionMode: options.permissionMode || this.defaultPermissionMode,
    };

    const session = new Session(chatId, sessionOptions, this.cliPath);
    session.start();

    // Use a listener to capture the Claude session ID once available
    session.on("system-init", () => {
      const claudeId = session.getClaudeSessionId();
      if (claudeId && claudeId !== session.id) {
        // Re-map with the real Claude session ID
        this.sessions.delete(session.id);
        this.sessions.set(claudeId, session);
        if (this.activeSessions.get(chatId) === session.id) {
          this.activeSessions.set(chatId, claudeId);
        }
      }
    });

    session.on("exit", () => {
      const id = session.getClaudeSessionId() || session.id;
      this.sessions.delete(id);
      if (this.activeSessions.get(chatId) === id) {
        this.activeSessions.delete(chatId);
      }
    });

    this.sessions.set(session.id, session);
    this.activeSessions.set(chatId, session.id);

    return session;
  }

  resumeSession(chatId: number, sessionId: string, projectPath: string): Session {
    return this.createSession(chatId, {
      projectPath,
      resumeSessionId: sessionId,
    });
  }

  switchSession(chatId: number, sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.activeSessions.set(chatId, sessionId);
    return session;
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.stop();
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessionForChat(chatId: number): Session | undefined {
    const sessionId = this.activeSessions.get(chatId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.stop();
    }
    this.sessions.clear();
    this.activeSessions.clear();
  }
}

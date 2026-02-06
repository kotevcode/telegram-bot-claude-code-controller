import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  SessionInfo,
  SessionOptions,
  SessionStatus,
  ClaudeEvent,
  UserMessage,
  AssistantMessage,
  ResultMessage,
} from "../types.js";
import {
  parseLine,
  ParseError,
  extractTextContent,
  detectAttentionNeeded,
} from "./stream-parser.js";

export interface SessionEvents {
  "system-init": (event: ClaudeEvent) => void;
  response: (text: string, message: AssistantMessage) => void;
  result: (result: ResultMessage) => void;
  "attention-needed": (message: AssistantMessage) => void;
  error: (error: Error) => void;
  exit: (code: number | null) => void;
}

export class Session extends EventEmitter {
  public readonly id: string;
  public readonly chatId: number;
  public readonly projectPath: string;
  public readonly model: string;
  public readonly isResumed: boolean;
  public readonly createdAt: Date;

  private process: ChildProcess | null = null;
  private status: SessionStatus = "starting";
  private stdoutBuffer = "";
  private claudeSessionId: string | null = null;

  constructor(
    chatId: number,
    private readonly options: SessionOptions,
    private readonly cliPath: string,
  ) {
    super();
    this.id = options.resumeSessionId || randomUUID();
    this.chatId = chatId;
    this.projectPath = options.projectPath;
    this.model = options.model || "sonnet";
    this.isResumed = !!options.resumeSessionId;
    this.createdAt = new Date();
  }

  start(): void {
    const args = this.buildArgs();
    this.process = spawn(this.cliPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.projectPath,
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.handleStdout(data.toString());
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        this.emit("error", new Error(`stderr: ${text}`));
      }
    });

    this.process.on("error", (err) => {
      this.status = "error";
      this.emit("error", err);
    });

    this.process.on("exit", (code) => {
      this.status = "stopped";
      this.process = null;
      this.emit("exit", code);
    });

    this.status = "ready";
  }

  send(message: string): void {
    if (!this.process?.stdin?.writable) {
      throw new Error("Session is not active");
    }

    const userMessage: UserMessage = {
      type: "user",
      message: {
        role: "user",
        content: message,
      },
    };

    this.status = "busy";
    this.process.stdin.write(JSON.stringify(userMessage) + "\n");
  }

  stop(): void {
    const proc = this.process;
    if (proc) {
      // Register the exit listener before killing so we catch synchronous exits
      const forceKillTimer = setTimeout(() => {
        if (this.process) {
          this.process.kill("SIGKILL");
        }
      }, 5000);

      proc.on("exit", () => {
        clearTimeout(forceKillTimer);
      });

      proc.kill("SIGTERM");
    }
    this.status = "stopped";
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  getInfo(): SessionInfo {
    return {
      sessionId: this.claudeSessionId || this.id,
      chatId: this.chatId,
      projectPath: this.projectPath,
      model: this.model,
      status: this.status,
      createdAt: this.createdAt,
      isResumed: this.isResumed,
    };
  }

  getClaudeSessionId(): string | null {
    return this.claudeSessionId;
  }

  private buildArgs(): string[] {
    const args = [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
    ];

    if (this.options.resumeSessionId) {
      args.push("--resume", this.options.resumeSessionId);
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    const permissionMode =
      this.options.permissionMode || "dangerously-skip-permissions";
    if (permissionMode === "dangerously-skip-permissions") {
      args.push("--dangerously-skip-permissions");
    }

    return args;
  }

  private handleStdout(data: string): void {
    this.stdoutBuffer += data;
    const lines = this.stdoutBuffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      this.processLine(line);
    }
  }

  private processLine(line: string): void {
    try {
      const event = parseLine(line);
      if (!event) return;

      switch (event.type) {
        case "system":
          this.claudeSessionId = event.session_id;
          this.status = "ready";
          this.emit("system-init", event);
          break;

        case "assistant": {
          const text = extractTextContent(event);
          if (text) {
            this.emit("response", text, event);
          }
          if (detectAttentionNeeded(event)) {
            this.emit("attention-needed", event);
          }
          break;
        }

        case "result":
          this.status = "ready";
          this.emit("result", event);
          break;
      }
    } catch (err) {
      if (err instanceof ParseError) {
        this.emit("error", err);
      } else {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

// Claude Code stream-json event types

export interface SystemInit {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: string[];
  model: string;
  cwd: string;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface AssistantMessage {
  type: "assistant";
  message: {
    id: string;
    role: "assistant";
    model: string;
    content: ContentBlock[];
    stop_reason: string | null;
  };
  session_id: string;
}

export interface ResultMessage {
  type: "result";
  subtype: "success" | "error";
  session_id: string;
  cost_usd: number;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result?: string;
  error?: string;
}

export type ClaudeEvent = SystemInit | AssistantMessage | ResultMessage;

export interface UserMessage {
  type: "user";
  content: string;
}

// Session types

export type SessionStatus = "starting" | "ready" | "busy" | "stopped" | "error";

export interface SessionInfo {
  sessionId: string;
  chatId: number;
  projectPath: string;
  model: string;
  status: SessionStatus;
  createdAt: Date;
  isResumed: boolean;
}

export interface SessionOptions {
  projectPath: string;
  model?: string;
  resumeSessionId?: string;
  maxBudget?: number;
  permissionMode?: string;
}

// History types

export interface HistoryEntry {
  sessionId: string;
  projectPath: string;
  timestamp: string;
  model: string;
  summary?: string;
}

// Config types

export interface AppConfig {
  telegramBotToken: string;
  allowedUserIds: number[];
  defaultModel: string;
  defaultPermissionMode: string;
  claudeCliPath: string;
  maxSessions: number;
}

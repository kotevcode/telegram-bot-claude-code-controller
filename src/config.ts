import "dotenv/config";
import type { AppConfig } from "./types.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new ConfigError("TELEGRAM_BOT_TOKEN is required");
  }

  const userIdsRaw = env.ALLOWED_USER_IDS;
  if (!userIdsRaw) {
    throw new ConfigError("ALLOWED_USER_IDS is required");
  }

  const allowedUserIds = userIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => {
      const num = Number(id);
      if (!Number.isInteger(num) || num <= 0) {
        throw new ConfigError(`Invalid user ID: "${id}"`);
      }
      return num;
    });

  if (allowedUserIds.length === 0) {
    throw new ConfigError("ALLOWED_USER_IDS must contain at least one valid ID");
  }

  const defaultModel = env.DEFAULT_MODEL || "sonnet";
  const validModels = ["sonnet", "opus", "haiku"];
  if (!validModels.includes(defaultModel)) {
    throw new ConfigError(
      `Invalid DEFAULT_MODEL: "${defaultModel}". Must be one of: ${validModels.join(", ")}`,
    );
  }

  const defaultPermissionMode =
    env.DEFAULT_PERMISSION_MODE || "dangerously-skip-permissions";

  const claudeCliPath = env.CLAUDE_CLI_PATH || "claude";

  const maxSessionsRaw = env.MAX_SESSIONS || "5";
  const maxSessions = Number(maxSessionsRaw);
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new ConfigError(`Invalid MAX_SESSIONS: "${maxSessionsRaw}"`);
  }

  return {
    telegramBotToken: token,
    allowedUserIds,
    defaultModel,
    defaultPermissionMode,
    claudeCliPath,
    maxSessions,
  };
}

import { Bot } from "grammy";
import type { AppConfig } from "../types.js";
import { SessionManager } from "../claude/session-manager.js";
import { Notifier } from "../notifications/notifier.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { registerCommands } from "./commands.js";

export function createBot(config: AppConfig) {
  const bot = new Bot(config.telegramBotToken);

  const sessionManager = new SessionManager(
    config.claudeCliPath,
    config.maxSessions,
    config.defaultModel,
    config.defaultPermissionMode,
  );

  const notifier = new Notifier(bot);

  // Auth middleware
  bot.use(createAuthMiddleware(config.allowedUserIds));

  // Register commands
  const commands = registerCommands(sessionManager, notifier, config.defaultModel);

  bot.command("start", commands.start);
  bot.command("help", commands.help);
  bot.command("new", commands.new);
  bot.command("sessions", commands.sessions);
  bot.command("resume", commands.resume);
  bot.command("switch", commands.switch);
  bot.command("send", commands.send);
  bot.command("model", commands.model);
  bot.command("budget", commands.budget);
  bot.command("stop", commands.stop);
  bot.command("status", commands.status);

  // Callback queries from inline keyboards
  bot.on("callback_query:data", commands.handleCallbackQuery);

  // Plain text messages → active session
  bot.on("message:text", commands.handleTextMessage);

  // Error handling
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return { bot, sessionManager, notifier };
}

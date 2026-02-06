import type { Context } from "grammy";
import type { SessionManager } from "../claude/session-manager.js";
import type { Notifier } from "../notifications/notifier.js";
import { getRecentSessions, resolveSessionId } from "../claude/history.js";
import { buildSessionListKeyboard } from "./keyboards.js";

import type { AssistantMessage } from "../types.js";

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export function registerCommands(
  sessionManager: SessionManager,
  notifier: Notifier,
  defaultModel: string,
) {
  const handlers = {
    start: async (ctx: Context) => {
      await ctx.reply(
        "Welcome to Claude Code Controller! 🤖\n\n" +
          "Use /new <project-path> to start a new session.\n" +
          "Use /sessions to browse active and recent sessions.\n" +
          "Use /help for all commands.",
      );
    },

    help: async (ctx: Context) => {
      await ctx.reply(
        "*Available Commands:*\n\n" +
          "/new `<project-path>` — Start new session\n" +
          "/sessions — List active & recent sessions\n" +
          "/resume `<session-id>` — Resume a session\n" +
          "/switch `<session-id>` — Switch active session\n" +
          "/send `<message>` — Send to active session\n" +
          "/model `<model>` — Change model \\(sonnet/opus/haiku\\)\n" +
          "/budget `<amount>` — Set session budget\n" +
          "/stop \\[session\\-id\\] — Stop session\n" +
          "/status — Active session info\n" +
          "/help — Show this message",
        { parse_mode: "MarkdownV2" },
      );
    },

    new: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const parts = text.split(" ").slice(1);
      const projectPath = parts.join(" ").trim();

      if (!projectPath) {
        await ctx.reply("Usage: /new <project-path>\n\nExample: /new /home/user/my-project");
        return;
      }

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      try {
        const session = sessionManager.createSession(chatId, {
          projectPath,
          model: defaultModel,
        });

        notifier.subscribe(session);

        session.on("response", (text: string, _message: AssistantMessage) => {
          sendChunkedMessage(ctx, text);
        });

        await ctx.reply(
          `Session started!\n\nProject: ${projectPath}\nModel: ${session.model}\nID: ${session.id.substring(0, 8)}\n\nSend messages directly or use /send <message>.`,
        );
      } catch (err) {
        await ctx.reply(`Failed to create session: ${(err as Error).message}`);
      }
    },

    sessions: async (ctx: Context) => {
      const active = sessionManager.getActiveSessions();
      let history: Awaited<ReturnType<typeof getRecentSessions>>;
      try {
        history = await getRecentSessions(10);
      } catch {
        history = [];
      }

      if (active.length === 0 && history.length === 0) {
        await ctx.reply("No active or recent sessions found.\n\nUse /new <project-path> to start one.");
        return;
      }

      let text = "";
      if (active.length > 0) {
        text += "*Active Sessions:*\n";
        for (const s of active) {
          text += `🟢 \`${s.sessionId.substring(0, 8)}\` — ${escapeMarkdown(s.projectPath)} \\(${s.model}\\)\n`;
        }
        text += "\n";
      }

      if (history.length > 0) {
        text += "*Recent Sessions:*\n";
        for (const h of history) {
          const date = h.timestamp
            ? new Date(h.timestamp).toLocaleDateString()
            : "unknown";
          text += `📂 \`${h.sessionId.substring(0, 8)}\` — ${escapeMarkdown(h.projectPath)} — ${escapeMarkdown(date)}\n`;
        }
      }

      const keyboard = buildSessionListKeyboard(active, history);
      await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: keyboard });
    },

    resume: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const inputId = text.split(" ").slice(1).join(" ").trim();

      if (!inputId) {
        await ctx.reply("Usage: /resume <session-id>\n\nYou can use a partial ID (first 8 chars) or the full UUID.");
        return;
      }

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      try {
        const resolved = await resolveSessionId(inputId);
        if (!resolved) {
          await ctx.reply(`Session not found for ID: ${inputId}\n\nUse /sessions to see available sessions.`);
          return;
        }

        const session = sessionManager.resumeSession(chatId, resolved.sessionId, resolved.projectPath);

        notifier.subscribe(session);

        session.on("response", (responseText: string, _message: AssistantMessage) => {
          sendChunkedMessage(ctx, responseText);
        });

        await ctx.reply(
          `Session resumed: ${resolved.sessionId.substring(0, 8)}\nProject: ${resolved.projectPath}`,
        );
      } catch (err) {
        await ctx.reply(`Failed to resume session: ${(err as Error).message}`);
      }
    },

    switch: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const sessionId = text.split(" ").slice(1).join(" ").trim();

      if (!sessionId) {
        await ctx.reply("Usage: /switch <session-id>");
        return;
      }

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      try {
        const session = sessionManager.switchSession(chatId, sessionId);
        await ctx.reply(
          `Switched to session: ${sessionId.substring(0, 8)}\nProject: ${session.projectPath}`,
        );
      } catch (err) {
        await ctx.reply(`Failed to switch: ${(err as Error).message}`);
      }
    },

    send: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const message = text.split(" ").slice(1).join(" ").trim();

      if (!message) {
        await ctx.reply("Usage: /send <message>");
        return;
      }

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const session = sessionManager.getActiveSessionForChat(chatId);
      if (!session) {
        await ctx.reply("No active session. Use /new or /resume to start one.");
        return;
      }

      try {
        session.send(message);
      } catch (err) {
        await ctx.reply(`Failed to send: ${(err as Error).message}`);
      }
    },

    model: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const model = text.split(" ").slice(1).join(" ").trim();
      const validModels = ["sonnet", "opus", "haiku"];

      if (!model || !validModels.includes(model)) {
        await ctx.reply(`Usage: /model <model>\n\nValid models: ${validModels.join(", ")}`);
        return;
      }

      await ctx.reply(
        `Model set to ${model}. This will apply to the next new session.\n\nTo apply to the current session, stop it with /stop and start a new one with /new.`,
      );
    },

    budget: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const amount = text.split(" ").slice(1).join(" ").trim();

      if (!amount || isNaN(Number(amount))) {
        await ctx.reply("Usage: /budget <amount>\n\nExample: /budget 1.00");
        return;
      }

      await ctx.reply(`Budget set to $${Number(amount).toFixed(2)} for future sessions.`);
    },

    stop: async (ctx: Context) => {
      const text = ctx.message?.text || "";
      const sessionId = text.split(" ").slice(1).join(" ").trim();
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      try {
        if (sessionId) {
          sessionManager.stopSession(sessionId);
          await ctx.reply(`Session stopped: ${sessionId.substring(0, 8)}`);
        } else {
          const session = sessionManager.getActiveSessionForChat(chatId);
          if (!session) {
            await ctx.reply("No active session to stop.");
            return;
          }
          const id = session.getClaudeSessionId() || session.id;
          sessionManager.stopSession(id);
          await ctx.reply(`Active session stopped: ${id.substring(0, 8)}`);
        }
      } catch (err) {
        await ctx.reply(`Failed to stop session: ${(err as Error).message}`);
      }
    },

    status: async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const session = sessionManager.getActiveSessionForChat(chatId);
      if (!session) {
        await ctx.reply("No active session.\n\nUse /new or /resume to start one.");
        return;
      }

      const info = session.getInfo();
      await ctx.reply(
        `*Active Session*\n\n` +
          `ID: \`${escapeMarkdown(info.sessionId.substring(0, 8))}\`\n` +
          `Project: ${escapeMarkdown(info.projectPath)}\n` +
          `Model: ${escapeMarkdown(info.model)}\n` +
          `Status: ${escapeMarkdown(info.status)}\n` +
          `Started: ${escapeMarkdown(info.createdAt.toLocaleString())}\n` +
          `Resumed: ${info.isResumed ? "Yes" : "No"}`,
        { parse_mode: "MarkdownV2" },
      );
    },

    handleTextMessage: async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const session = sessionManager.getActiveSessionForChat(chatId);
      if (!session) {
        await ctx.reply("No active session. Use /new <project-path> to start one.");
        return;
      }

      const message = ctx.message?.text;
      if (!message) return;

      try {
        session.send(message);
      } catch (err) {
        await ctx.reply(`Failed to send: ${(err as Error).message}`);
      }
    },

    handleCallbackQuery: async (ctx: Context) => {
      const data = ctx.callbackQuery?.data;
      if (!data) return;

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      if (data.startsWith("switch:")) {
        const sessionId = data.substring(7);
        try {
          sessionManager.switchSession(chatId, sessionId);
          await ctx.answerCallbackQuery({ text: "Switched!" });
          await ctx.reply(`Switched to session: ${sessionId.substring(0, 8)}`);
        } catch (err) {
          await ctx.answerCallbackQuery({
            text: (err as Error).message,
          });
        }
      } else if (data.startsWith("resume:")) {
        const inputId = data.substring(7);
        try {
          const resolved = await resolveSessionId(inputId);
          if (!resolved) {
            await ctx.answerCallbackQuery({ text: "Session not found" });
            return;
          }

          const session = sessionManager.resumeSession(chatId, resolved.sessionId, resolved.projectPath);
          notifier.subscribe(session);

          session.on("response", (responseText: string, _message: AssistantMessage) => {
            sendChunkedMessage(ctx, responseText);
          });

          await ctx.answerCallbackQuery({ text: "Resuming..." });
          await ctx.reply(`Resumed session: ${resolved.sessionId.substring(0, 8)}\nProject: ${resolved.projectPath}`);
        } catch (err) {
          await ctx.answerCallbackQuery({
            text: (err as Error).message,
          });
        }
      } else if (data.startsWith("model:")) {
        const model = data.substring(6);
        await ctx.answerCallbackQuery({ text: `Model set to ${model}` });
        await ctx.reply(`Model set to ${model}. Applies to next new session.`);
      }
    },
  };

  return handlers;
}

async function sendChunkedMessage(ctx: Context, text: string): Promise<void> {
  if (text.length === 0) return;

  const chunks = chunkText(text, TELEGRAM_MAX_MESSAGE_LENGTH);
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk);
    } catch (err) {
      console.error("Failed to send message chunk:", err);
    }
  }
}

function chunkText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline
    let breakPoint = remaining.lastIndexOf("\n", maxLength);
    if (breakPoint <= 0) {
      // Try to break at a space
      breakPoint = remaining.lastIndexOf(" ", maxLength);
    }
    if (breakPoint <= 0) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trimStart();
  }

  return chunks;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

import type { Bot, Context } from "grammy";
import type { Session } from "../claude/session.js";
import type { AssistantMessage, ResultMessage } from "../types.js";
import { extractTextContent } from "../claude/stream-parser.js";

export class Notifier {
  constructor(private readonly bot: Bot<Context>) {}

  subscribe(session: Session): void {
    const chatId = session.chatId;
    const sessionLabel = this.formatSessionLabel(session);

    session.on("attention-needed", (message: AssistantMessage) => {
      const text = extractTextContent(message);
      const question = text ? `\n\n${truncate(text, 500)}` : "";
      this.sendNotification(
        chatId,
        `🔔 *Session needs your input*\n${sessionLabel}${escapeMarkdown(question)}`,
      );
    });

    session.on("result", (result: ResultMessage) => {
      const costInfo = result.cost_usd
        ? ` \\| Cost: $${result.cost_usd.toFixed(4)}`
        : "";
      const resultText = result.result
        ? `\n\n${escapeMarkdown(truncate(result.result, 500))}`
        : "";

      if (result.is_error) {
        const errorText = result.error
          ? `\n\n${escapeMarkdown(truncate(result.error, 500))}`
          : "";
        this.sendNotification(
          chatId,
          `❌ *Session error*\n${sessionLabel}${costInfo}${errorText}`,
        );
      } else {
        this.sendNotification(
          chatId,
          `✅ *Task completed*\n${sessionLabel}${costInfo}${resultText}`,
        );
      }
    });

    session.on("error", (error: Error) => {
      this.sendNotification(
        chatId,
        `⚠️ *Session error*\n${sessionLabel}\n\n${escapeMarkdown(truncate(error.message, 300))}`,
      );
    });

    session.on("exit", (code: number | null) => {
      const codeStr = code !== null ? ` \\(exit code: ${code}\\)` : "";
      this.sendNotification(
        chatId,
        `🛑 *Session ended*${codeStr}\n${sessionLabel}`,
      );
    });
  }

  private formatSessionLabel(session: Session): string {
    const project = escapeMarkdown(session.projectPath);
    const id = escapeMarkdown(
      (session.getClaudeSessionId() || session.id).substring(0, 8),
    );
    return `Project: \`${project}\` \\| ID: \`${id}\``;
  }

  private sendNotification(chatId: number, text: string): void {
    this.bot.api.sendMessage(chatId, text, { parse_mode: "MarkdownV2" }).catch((err) => {
      console.error(`Failed to send notification to chat ${chatId}:`, err);
    });
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

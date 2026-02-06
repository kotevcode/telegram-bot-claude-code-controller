import { InlineKeyboard } from "grammy";
import type { SessionInfo, HistoryEntry } from "../types.js";

export function buildSessionListKeyboard(
  activeSessions: SessionInfo[],
  historySessions: HistoryEntry[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (activeSessions.length > 0) {
    for (const session of activeSessions) {
      const label = `🟢 ${shortenPath(session.projectPath)} (${session.sessionId.substring(0, 8)})`;
      keyboard.text(label, `switch:${session.sessionId}`).row();
    }
  }

  if (historySessions.length > 0) {
    for (const entry of historySessions.slice(0, 10)) {
      const date = entry.timestamp
        ? new Date(entry.timestamp).toLocaleDateString()
        : "unknown";
      const label = `📂 ${shortenPath(entry.projectPath)} — ${date}`;
      keyboard.text(label, `resume:${entry.sessionId}`).row();
    }
  }

  return keyboard;
}

export function buildModelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Sonnet", "model:sonnet")
    .text("Opus", "model:opus")
    .text("Haiku", "model:haiku");
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return ".../" + parts.slice(-2).join("/");
}
